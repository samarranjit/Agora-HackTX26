import { createApiClient } from './client.js'
import { uploadProfilePdf } from './profilePdf.js'
import { pollJob } from './pollJob.js'

const STORAGE_KEY = 'memory-palace.backend-session.v1'
function readStorage(storage) { try { return JSON.parse(storage?.getItem(STORAGE_KEY) || 'null') } catch { return null } }

// One shared coordinator for game and tester. Rendering never owns requests or rewards.
export function createGameSession({ storage, baseUrl, fetchImpl, timeoutMs } = {}) {
  const saved = readStorage(storage)
  let credentials = saved?.credentials || null
  let journal = saved?.journal || null
  let selectedPackId = saved?.selectedPackId || null
  let packRevision = 0
  let packController = null, packFlight = null, listFlight = null
  let epoch = 0
  let inFlight = null
  let refreshFlight = null
  let mutationVersion = 0
  let mutating = false
  let snapshot = { signedIn: !!credentials, username: saved?.username || '', status: null, player: null,
    attempt: null, result: null, error: null, busy: false, unresolved: journal, logs: [], packs: [], pack: null, packBusy: false, packError: null }
  const listeners = new Set()
  const publish = (patch) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((f) => f()) }
  const persist = () => { try { if (credentials) storage?.setItem(STORAGE_KEY, JSON.stringify({ credentials, username: snapshot.username, journal, selectedPackId })); else storage?.removeItem(STORAGE_KEY) } catch { /* In-memory sessions still work when storage is unavailable. */ } }
  const clear = (message) => {
    epoch++
    credentials = null
    journal = null
    selectedPackId = null
    packController?.abort()
    persist()
    publish({ signedIn: false, username: '', status: null, player: null, attempt: null, result: null, unresolved: null, packs: [], pack: null, packBusy: false, packError: null, error: message ? { message, code: 'session_expired' } : null })
  }
  const api = createApiClient({ baseUrl, fetchImpl, timeoutMs, getToken: () => credentials?.access_token,
    onUnauthorized: (token) => { if (token === credentials?.access_token) clear('Your session expired. Sign in again to recover your question.') },
    onRequest: (entry) => publish({ logs: [entry, ...snapshot.logs].slice(0, 40) }),
  })
  const applyStatus = (data) => {
    if (typeof data?.xp !== 'number') return
    if (snapshot.status && data.state_version < snapshot.status.state_version) return
    const patch = Object.fromEntries(['xp', 'health', 'max_health', 'state_version', 'adventure_unlocked', 'adventure_completed', 'location'].filter((key) => data[key] !== undefined).map((key) => [key, data[key]]))
    if (data.encounter?.adventure_unlocked_now) patch.adventure_unlocked = true
    if (typeof data.encounter?.adventure_completed === 'boolean') patch.adventure_completed = data.encounter.adventure_completed
    publish({ status: { ...snapshot.status, ...patch } })
  }
  function refresh(afterMutation = false) {
    if (!credentials) return Promise.resolve()
    if (mutating && !afterMutation) return Promise.resolve()
    if (refreshFlight) return refreshFlight
    const generation = epoch
    const version = mutationVersion
    refreshFlight = (async () => {
      const values = await Promise.allSettled([api.status(), api.state(), api.active()])
      if (generation !== epoch || version !== mutationVersion) return
      if (values[0].status === 'fulfilled') applyStatus(values[0].value)
      if (values[1].status === 'fulfilled') { publish({ player: values[1].value, username: values[1].value.username }); applyStatus(values[1].value) }
      if (values[2].status === 'fulfilled') publish({ attempt: values[2].value.attempt })
      const failed = values.find((v) => v.status === 'rejected')
      publish({ error: failed ? failed.reason : null })
    })().finally(() => { refreshFlight = null })
    return refreshFlight
  }
  function exclusive(work) {
    if (inFlight) return inFlight
    publish({ busy: true, error: null })
    inFlight = Promise.resolve().then(work).catch((error) => { publish({ error }); return null }).finally(() => {
      inFlight = null
      publish({ busy: false })
    })
    return inFlight
  }
  async function execute(action, retry = false) {
    // Settle any older read before mutating; it must not restore an obsolete question.
    if (refreshFlight) await refreshFlight
    const generation = epoch
    mutationVersion++
    mutating = true
    journal = action
    persist() // Persist before sending: reloads must not generate a second mutation.
    publish({ unresolved: journal, result: null })
    try {
      const data = await api.request(action.path, { method: 'POST', body: action.body, key: action.key })
      if (generation !== epoch) return null
      journal = null
      persist()
      publish({ unresolved: null, attempt: action.kind === 'answer' ? data.next_attempt : data.attempt, result: action.kind === 'answer' ? data : null })
      applyStatus(data)
      await refresh(true) // Also reconciles a replayed battle start with the current pending question.
      if (retry && action.kind !== 'answer') publish({ result: null })
      return data
    } catch (error) {
      if (generation === epoch && !error.ambiguous) { journal = null; persist(); publish({ unresolved: null }) }
      if (['attempt_already_answered', 'attempt_not_active', 'battle_in_progress', 'state_conflict'].includes(error.code)) await refresh(true)
      throw error
    } finally { mutating = false }
  }
  const begin = (kind, path, body, keyed = true) => exclusive(() => {
    if (!credentials) throw new Error('Sign in to save learning progress and start questions.')
    if (journal) throw new Error('An earlier action has an uncertain result. Retry the saved action first.')
    if (snapshot.packBusy) throw new Error('Stop waiting for PDF preparation before starting a question.')
    if (kind !== 'answer' && selectedPackId && !snapshot.pack) throw new Error('Refresh saved PDFs and select your study pack before starting a question.')
    if (kind !== 'answer' && snapshot.pack && (kind === 'practice' ? snapshot.pack.practice?.status !== 'ready' : snapshot.pack.status !== 'ready')) throw new Error('Your selected PDF is not ready for this activity. Prepare it or select a ready study pack first.')
    if (kind !== 'answer' && snapshot.result) throw new Error('Finish review before starting another question.')
    if (kind === 'battle' && snapshot.attempt) throw new Error('Resume the pending question before starting another battle.')
    return execute({ kind, path, body, ...(keyed ? { key: crypto.randomUUID() } : {}) })
  })
  const cancelPack = () => packController?.abort()
  const recordPack = (pack) => {
    packRevision++
    selectedPackId = pack.document_id
    publish({ pack, packs: [pack, ...snapshot.packs.filter((p) => p.document_id !== pack.document_id)] })
    persist()
  }
  const loadPacks = () => {
    if (!credentials) return Promise.resolve()
    if (listFlight) return listFlight
    const generation = epoch
    const revision = packRevision
    listFlight = api.studyPacks().then((data) => {
      if (generation !== epoch) return
      if (revision !== packRevision) return
      const selected = data.study_packs.find((p) => p.document_id === selectedPackId) || null
      publish({ packs: data.study_packs, pack: selected, packError: null })
    }).catch((error) => { if (generation === epoch) publish({ packError: error }) }).finally(() => { listFlight = null })
    return listFlight
  }
  function preparePack(file, options = {}) {
    if (packFlight) return packFlight
    if (!credentials || snapshot.busy || snapshot.attempt || snapshot.result || journal) {
      publish({ packError: new Error('Sign in and finish or recover the current question before changing study packs.') }); return Promise.resolve(null)
    }
    const generation = epoch, controller = new AbortController()
    packController = controller
    publish({ packBusy: true, packError: null })
    packFlight = (async () => {
      let pack = file ? await uploadProfilePdf(file, { api, ...options, signal: controller.signal }) : snapshot.pack
      if (!pack) throw new Error('Choose an existing study pack or submit the PDF again.')
      if (generation !== epoch || controller.signal.aborted) return null
      recordPack(pack)
      pack = await pollJob(async (signal) => {
        const next = await api.studyPack(pack.document_id, signal)
        if (next.document_id !== pack.document_id) throw new Error('The backend returned a different study pack. Refresh your PDF list.')
        if (generation === epoch && !signal.aborted) recordPack(next)
        return next
      }, controller.signal, { timeoutMs: 600000, ...options.pollOptions })
      return generation === epoch && !controller.signal.aborted ? pack : null
    })().catch((error) => {
      if (generation === epoch && !controller.signal.aborted) publish({ packError: error })
      return null
    }).finally(() => {
      if (packController === controller) { packController = null; packFlight = null; publish({ packBusy: false }) }
    })
    return packFlight
  }
  return {
    api, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) }, getSnapshot: () => snapshot,
    refresh, clearError: () => publish({ error: null }), continue: () => publish({ result: null, error: null }),
    loadPacks, preparePack, cancelPack,
    selectPack: (id) => {
      if (snapshot.attempt || snapshot.result || journal || snapshot.packBusy) { publish({ packError: new Error('Finish the current question before changing study packs.') }); return }
      const pack = snapshot.packs.find((p) => p.document_id === id)
      if (pack) recordPack(pack)
    },
    forget: () => clear('Sign-in removed from this tab. Server progress is unchanged.'),
    authenticate: (mode, body) => exclusive(async () => {
      if (mode === 'register') await api.register(body)
      const session = await api.login(body)
      packController?.abort()
      epoch++
      credentials = session
      journal = null
      selectedPackId = null
      publish({ pack: null, packs: [], packError: null })
      publish({ signedIn: true, username: body.username, player: null, status: null, attempt: null, result: null, unresolved: null })
      persist()
      await refresh()
    }),
    logout: () => exclusive(async () => {
      if (journal) throw new Error('Retry the saved action before signing out.')
      packController?.abort()
      await api.logout(); clear()
    }),
    practice: (id = snapshot.pack?.practice?.status === 'ready' ? snapshot.pack.practice.question_set_id : null) => begin('practice', '/api/practice/attempts', id ? { question_set_id: id } : {}, false),
    battle: (id = snapshot.pack?.status === 'ready' ? snapshot.pack.adventure.question_set_id : null) => begin('battle', '/api/adventure/battles', id ? { question_set_id: id } : {}),
    answer: (answer) => {
      if (!snapshot.attempt || snapshot.result) return Promise.resolve(null)
      return begin('answer', `/api/attempts/${encodeURIComponent(snapshot.attempt.attempt_id)}/answer`, { answer })
    },
    retry: () => exclusive(() => journal ? execute(journal, true) : refresh()),
    read: (kind) => exclusive(async () => {
      const data = await api[kind]()
      if (kind === 'status') applyStatus(data)
      if (kind === 'state') { publish({ player: data }); applyStatus(data) }
      if (kind === 'active') publish({ attempt: data.attempt, result: null })
      return data
    }),
  }
}
