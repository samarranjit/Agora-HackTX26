import { createApiClient } from './client.js'

const STORAGE_KEY = 'memory-palace.backend-session.v1'
function readStorage(storage) { try { return JSON.parse(storage?.getItem(STORAGE_KEY) || 'null') } catch { return null } }

// One shared coordinator for game and tester. Rendering never owns requests or rewards.
export function createGameSession({ storage, baseUrl, fetchImpl, timeoutMs } = {}) {
  const saved = readStorage(storage)
  let credentials = saved?.credentials || null
  let journal = saved?.journal || null
  let epoch = 0
  let inFlight = null
  let refreshFlight = null
  let mutationVersion = 0
  let mutating = false
  let snapshot = { signedIn: !!credentials, username: saved?.username || '', status: null, player: null,
    attempt: null, result: null, error: null, busy: false, unresolved: journal, logs: [] }
  const listeners = new Set()
  const publish = (patch) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((f) => f()) }
  const persist = () => { try { if (credentials) storage?.setItem(STORAGE_KEY, JSON.stringify({ credentials, username: snapshot.username, journal })); else storage?.removeItem(STORAGE_KEY) } catch { /* In-memory sessions still work when storage is unavailable. */ } }
  const clear = (message) => {
    epoch++
    credentials = null
    journal = null
    persist()
    publish({ signedIn: false, username: '', status: null, player: null, attempt: null, result: null, unresolved: null, error: message ? { message, code: 'session_expired' } : null })
  }
  const api = createApiClient({ baseUrl, fetchImpl, timeoutMs, getToken: () => credentials?.access_token,
    onUnauthorized: (token) => { if (token === credentials?.access_token) clear('Your session expired. Sign in again to recover your question.') },
    onRequest: (entry) => publish({ logs: [entry, ...snapshot.logs].slice(0, 40) }),
  })
  const applyStatus = (data) => {
    if (typeof data?.xp !== 'number') return
    if (snapshot.status && data.state_version < snapshot.status.state_version) return
    publish({ status: { ...snapshot.status, ...data } })
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
    return execute({ kind, path, body, ...(keyed ? { key: crypto.randomUUID() } : {}) })
  })
  return {
    api, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) }, getSnapshot: () => snapshot,
    refresh, clearError: () => publish({ error: null }), continue: () => publish({ result: null, error: null }),
    authenticate: (mode, body) => exclusive(async () => {
      if (mode === 'register') await api.register(body)
      const session = await api.login(body)
      epoch++
      credentials = session
      journal = null
      publish({ signedIn: true, username: body.username, player: null, status: null, attempt: null, result: null, unresolved: null })
      persist()
      await refresh()
    }),
    logout: () => exclusive(async () => { await api.logout(); clear() }),
    practice: (id) => begin('practice', '/api/practice/attempts', id ? { question_set_id: id } : {}, false),
    battle: (id) => begin('battle', '/api/adventure/battles', id ? { question_set_id: id } : {}),
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
