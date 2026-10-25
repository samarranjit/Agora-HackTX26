import { createApiClient } from './client.js'

// Adapted from the existing shared gameplay coordinator. Credentials, selected
// content and idempotent retries now live only in this page, with no tester/history.
export function createGameSession({ baseUrl, fetchImpl, timeoutMs } = {}) {
  let credentials = null, journal = null, inFlight = null, refreshFlight = null
  let epoch = 0, mutationVersion = 0, mutating = false, registeredUsername = null
  let questionIds = new Set()
  let snapshot = { signedIn: false, busy: false, status: null, player: null, attempt: null, result: null, unresolved: null, error: null, pack: null }
  const listeners = new Set()
  const publish = (patch) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((f) => f()) }
  const clear = (message) => {
    epoch++; credentials = null; journal = null; questionIds = new Set(); registeredUsername = null
    publish({ signedIn: false, status: null, player: null, attempt: null, result: null, unresolved: null, pack: null, error: message ? new Error(message) : null })
  }
  const api = createApiClient({ baseUrl, fetchImpl, timeoutMs, getToken: () => credentials?.access_token,
    onUnauthorized: (token) => { if (token && token === credentials?.access_token) clear('Your session expired. Please sign in again.') },
  })
  const applyStatus = (data) => {
    if (!Number.isFinite(data?.xp) || snapshot.status && data.state_version < snapshot.status.state_version) return
    const patch = Object.fromEntries(['xp', 'health', 'max_health', 'state_version', 'adventure_unlocked', 'adventure_completed', 'location'].filter((key) => data[key] !== undefined).map((key) => [key, data[key]]))
    if (data.encounter?.adventure_unlocked_now) patch.adventure_unlocked = true
    if (typeof data.encounter?.adventure_completed === 'boolean') patch.adventure_completed = data.encounter.adventure_completed
    publish({ status: { ...snapshot.status, ...patch } })
  }
  const checkQuestion = (attempt) => {
    if (attempt && !questionIds.has(attempt.question_id)) throw new Error('A pending question belongs to another PDF. Return to study sets and select that PDF to finish it before switching.')
    return attempt
  }
  function refresh(afterMutation = false) {
    if (!credentials || mutating && !afterMutation) return Promise.resolve(false)
    if (refreshFlight) return refreshFlight
    const generation = epoch, version = mutationVersion
    refreshFlight = (async () => {
      const values = await Promise.allSettled([api.status(), api.state(), api.active()])
      if (generation !== epoch || version !== mutationVersion) return false
      if (values[0].status === 'fulfilled') applyStatus(values[0].value)
      if (values[1].status === 'fulfilled') { publish({ player: values[1].value }); applyStatus(values[1].value) }
      const failed = values.find((v) => v.status === 'rejected')
      if (failed) { publish({ error: failed.reason }); return false }
      try { publish({ attempt: checkQuestion(values[2].value.attempt), error: null }); return true }
      catch (error) { publish({ attempt: null, error }); return false }
    })().finally(() => { refreshFlight = null })
    return refreshFlight
  }
  function exclusive(work) {
    if (inFlight) return inFlight
    publish({ busy: true, error: null })
    inFlight = Promise.resolve().then(work).catch((error) => { publish({ error }); return null }).finally(() => { inFlight = null; publish({ busy: false }) })
    return inFlight
  }
  async function execute(action) {
    if (refreshFlight) await refreshFlight
    const generation = epoch
    mutationVersion++; mutating = true; journal = action
    publish({ unresolved: journal, result: null })
    try {
      const data = await api.request(action.path, { method: 'POST', body: action.body, key: action.key })
      if (generation !== epoch) return null
      journal = null
      publish({ unresolved: null, attempt: checkQuestion(action.kind === 'answer' ? data.next_attempt : data.attempt), result: action.kind === 'answer' ? data : null })
      applyStatus(data)
      await refresh(true)
      return data
    } catch (error) {
      if (generation === epoch && !error.ambiguous) { journal = null; publish({ unresolved: null }) }
      if (['attempt_already_answered', 'attempt_not_active', 'battle_in_progress', 'state_conflict'].includes(error.code)) await refresh(true)
      throw error
    } finally { mutating = false }
  }
  const begin = (kind, path, body, keyed = true) => exclusive(() => {
    if (!credentials) throw new Error('Please sign in again.')
    if (!snapshot.pack || !questionIds.size) throw new Error('Please wait for your PDF questions to finish preparing.')
    if (journal) throw new Error('Retry the previous action before starting another question.')
    if (snapshot.result) throw new Error('Finish reviewing the answer before continuing.')
    if (kind === 'battle' && snapshot.attempt) throw new Error('Finish the current question before starting a battle.')
    return execute({ kind, path, body, ...(keyed ? { key: crypto.randomUUID() } : {}) })
  })
  return {
    api, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) }, getSnapshot: () => snapshot,
    refresh, clear: () => clear(), clearError: () => publish({ error: null }), continue: () => publish({ result: null, error: null }),
    authenticate: (mode, body) => {
      const generation = epoch
      return exclusive(async () => {
      if (generation !== epoch) return null
      if (mode === 'register' && registeredUsername !== body.username) {
        await api.register(body)
        if (generation !== epoch) return null
        registeredUsername = body.username
      }
      const session = await api.login(body)
      if (generation !== epoch) return null
      epoch++; credentials = session; journal = null; questionIds = new Set(); registeredUsername = null
      publish({ signedIn: true, status: null, player: null, attempt: null, result: null, unresolved: null, pack: null })
      return session
      })
    },
    usePack: (pack, signal) => exclusive(async () => {
      if (!credentials) throw new Error('Please sign in again.')
      const generation = epoch
      const sets = await Promise.all([api.questionSet(pack.practice.question_set_id, signal), api.questionSet(pack.adventure.question_set_id, signal)])
      if (generation !== epoch || signal?.aborted) return false
      if (sets.some((set, index) => set.status !== 'ready' || set.question_set_id !== [pack.practice.question_set_id, pack.adventure.question_set_id][index] || set.mode !== ['practice', 'adventure'][index] || !set.document_ids.includes(pack.document_id))) throw new Error('The server returned questions for a different or unfinished PDF. Please retry.')
      questionIds = new Set(sets.flatMap((set) => set.questions.map((q) => q.question_id)))
      if (!questionIds.size) throw new Error('This PDF has no ready questions. Please retry.')
      publish({ pack, attempt: null, result: null })
      return await refresh()
    }),
    practice: () => snapshot.attempt ? Promise.resolve(snapshot.attempt) : begin('practice', '/api/practice/attempts', { question_set_id: snapshot.pack?.practice.question_set_id }, false),
    battle: (villainId) => {
      const current = snapshot.player?.villains?.find((v) => v.status === 'current')?.villain_id
      if (villainId && current && current !== villainId) return exclusive(() => { throw new Error('This guardian is not available yet. Finish the current guardian first.') })
      return begin('battle', '/api/adventure/battles', { question_set_id: snapshot.pack?.adventure.question_set_id })
    },
    answer: (answer) => {
      if (!snapshot.attempt || snapshot.result || typeof answer !== 'string' || !answer.trim()) return Promise.resolve(null)
      return begin('answer', '/api/attempts/' + encodeURIComponent(snapshot.attempt.attempt_id) + '/answer', { answer })
    },
    retry: () => exclusive(() => journal ? execute(journal) : refresh()),
    restart: () => exclusive(async () => {
      if (!credentials) throw new Error('Please sign in again.')
      mutationVersion++
      mutating = true
      try {
        const data = await api.restart()
        journal = null
        publish({
          attempt: null,
          result: null,
          unresolved: null,
          error: null,
          player: data,
          status: {
            xp: data.xp,
            health: data.health,
            max_health: data.max_health,
            state_version: data.state_version,
            adventure_unlocked: data.adventure_unlocked,
            adventure_completed: data.adventure_completed,
            location: data.location,
          },
        })
        return data
      } finally { mutating = false }
    }),
  }
}
