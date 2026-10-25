import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient, ApiError } from '../src/api/client.js'
import { createGameSession } from '../src/api/gameSession.js'
import { pollJob } from '../src/api/pollJob.js'
import { nearGoblin, GOBLIN_SPOT, createForestGoblin } from '../src/forestGoblin.js'
import { disposeScene } from '../src/sceneResources.js'

const status = { schema_version: 1, state_version: 0, xp: 0, health: 100, max_health: 100, adventure_unlocked: false, adventure_completed: false, location: 'playground' }
const question = { attempt_id: 'attempt-one', question_id: 'q1', mode: 'practice', type: 'numeric', prompt: 'What is 3 × 4?', options: null, difficulty: 1, topic: 'Arithmetic', learning_objective: null, sources: [], battle: null }
const result = { attempt_id: question.attempt_id, correct: true, feedback: { correct_answer: '12', explanation: 'Three groups of four.' }, xp_delta: 10, xp: 10, health_delta: 0, health: 100, max_health: 100,
  encounter: { mode: 'practice', outcome: 'none', adventure_unlocked_now: false, adventure_completed: false }, next_attempt: null, state_version: 1 }
const credentials = { access_token: 'private-test-token', token_type: 'bearer', expires_at: '2099-01-01T00:00:00Z' }
const json = (body, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } })
const memoryStorage = () => { const data = new Map(); return { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) } }

function harness({ storage = memoryStorage(), initialActive = null, mutation = async () => json({ created: true, attempt: question }) } = {}) {
  const calls = []
  let active = initialActive
  let balances = { ...status }
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname
    calls.push({ path, ...init })
    if (path === '/api/auth/login') return json(credentials)
    if (path === '/api/auth/register') return json({ user_id: 'u1', username: 'ada' }, 201)
    if (path === '/api/auth/logout') return new Response(null, { status: 204 })
    if (path === '/api/me/status') return json(balances)
    if (path === '/api/me/state') return json({ ...balances, username: 'ada', rules: { unlock_threshold: 100, battle_cost: 30 }, villains: [] })
    if (path === '/api/me/active-attempt') return json({ attempt: active })
    return mutation(path, init, { setActive: (q) => { active = q }, setStatus: (s) => { balances = { ...balances, ...s } } })
  }
  const session = createGameSession({ storage, fetchImpl })
  return { session, calls, storage, login: () => session.authenticate('login', { username: 'ada', password: 'password-for-testing' }) }
}

test('client sends bearer JSON and key; 204 is successful; auth endpoints are public', async () => {
  const calls = []
  const client = createApiClient({ baseUrl: 'http://127.0.0.1:8000/', getToken: () => 'secret', fetchImpl: async (url, init) => {
    calls.push({ url, ...init })
    if (url.endsWith('/logout')) return new Response(null, { status: 204 })
    if (url.endsWith('/login')) return json(credentials)
    return json(result)
  } })
  await client.request('/api/attempts/a/answer', { method: 'POST', body: { answer: '12' }, key: 'one-action-key' })
  assert.equal(calls[0].headers.Authorization, 'Bearer secret')
  assert.equal(calls[0].headers['Idempotency-Key'], 'one-action-key')
  assert.deepEqual(JSON.parse(calls[0].body), { answer: '12' })
  assert.equal(await client.logout(), null)
  await client.login({ username: 'ada', password: 'test-password' })
  assert.equal(calls[2].headers.Authorization, undefined)
})

test('multipart upload leaves Content-Type boundary to the browser', async () => {
  let sent
  const client = createApiClient({ fetchImpl: async (_, init) => { sent = init; return json({ document_id: 'actual-id', status: 'pending' }, 202) } })
  await client.upload(new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' }))
  assert.ok(sent.body instanceof FormData)
  assert.equal(sent.body.get('file').name, 'notes.pdf')
  assert.equal(sent.headers['Content-Type'], undefined)
})

test('reusable request supports empty 204 responses independently of logout', async () => {
  const client = createApiClient({ fetchImpl: async () => new Response(null, { status: 204 }) })
  assert.equal(await client.request('/empty', { method: 'POST' }), null)
})

test('structured errors retain code, status and field details', async () => {
  const client = createApiClient({ fetchImpl: async () => json({ error: { code: 'invalid_answer', message: 'Choose an option.', details: [{ field: 'answer', problem: 'not an option' }] } }, 422) })
  await assert.rejects(client.request('/api/attempts/a/answer', { method: 'POST', body: { answer: 'bad' } }), (e) => e instanceof ApiError && e.code === 'invalid_answer' && e.status === 422 && e.details[0].field === 'answer' && !e.ambiguous)
})

test('401 expires authenticated session; failed public login does not', async () => {
  const tokens = []
  const client = createApiClient({ getToken: () => 'expired', onUnauthorized: (t) => tokens.push(t), fetchImpl: async () => json({ error: { code: 'invalid_token', message: 'Expired.' } }, 401) })
  await assert.rejects(client.status())
  await assert.rejects(client.login({ username: 'ada', password: 'password' }))
  assert.deepEqual(tokens, ['expired'])
})

test('network and timeouts mark mutations ambiguous; invalid success bodies are rejected', async () => {
  const network = createApiClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
  await assert.rejects(network.request('/api/adventure/battles', { method: 'POST', body: {} }), (e) => e.code === 'connection_failed' && e.ambiguous)
  await assert.rejects(network.status(), (e) => !e.ambiguous)
  const timeout = createApiClient({ timeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) })
  await assert.rejects(timeout.request('/api/adventure/battles', { method: 'POST' }), (e) => e.code === 'timeout' && e.ambiguous)
  for (const response of [new Response('<html>wrong host</html>'), json({}), new Response('')]) {
    const invalid = createApiClient({ fetchImpl: async () => response })
    await assert.rejects(invalid.request('/api/adventure/battles', { method: 'POST' }), (e) => e.code === 'invalid_response' && e.ambiguous)
  }
})

test('request history redacts credentials recursively and never retains tokens/passwords', async () => {
  const logs = []
  const client = createApiClient({ getToken: () => credentials.access_token, onRequest: (e) => logs.push(e), fetchImpl: async () => json(credentials) })
  await client.login({ username: 'ada', password: 'ultra-private-password' })
  const history = JSON.stringify(logs)
  assert.ok(!history.includes(credentials.access_token))
  assert.ok(!history.includes('ultra-private-password'))
  assert.ok(history.includes('[redacted]'))
  assert.equal(logs[0].status, 200)
  assert.ok(logs[0].duration >= 0)
})

test('login and reconnect restore exact pending question using reads only', async () => {
  const h = harness({ mutation: async (_, __, state) => { state.setActive(question); return json({ created: true, attempt: question }) } })
  await h.login()
  assert.equal(h.calls.filter((c) => c.method === 'POST').length, 1)
  await h.session.practice()
  const reloaded = harness({ storage: h.storage, initialActive: question })
  await reloaded.session.refresh()
  assert.ok(reloaded.calls.every((c) => c.method === 'GET'))
  assert.deepEqual(reloaded.session.getSnapshot().attempt, question)
  assert.equal(h.session.getSnapshot().attempt.attempt_id, question.attempt_id)
})

test('double battle starts share one request; ambiguous retry uses identical key/body across reload', async () => {
  let count = 0
  const mutation = async () => { count++; throw new TypeError('response lost') }
  const h = harness({ mutation })
  await h.login()
  const one = h.session.battle('a'.repeat(32))
  const two = h.session.battle('a'.repeat(32))
  assert.equal(one, two)
  await one
  assert.equal(count, 1)
  const first = h.calls.find((c) => c.path === '/api/adventure/battles')
  assert.ok(first.headers['Idempotency-Key'])
  const saved = h.session.getSnapshot().unresolved
  const reload = harness({ storage: h.storage, mutation })
  await reload.session.refresh()
  assert.deepEqual(reload.session.getSnapshot().unresolved, saved)
  await reload.session.practice()
  assert.equal(count, 1, 'new actions blocked until uncertain action is resolved')
  await reload.session.retry()
  const retry = reload.calls.find((c) => c.path === '/api/adventure/battles')
  assert.equal(retry.headers['Idempotency-Key'], first.headers['Idempotency-Key'])
  assert.equal(retry.body, first.body)
})

test('double answers cannot award twice; next question and balances come from server', async () => {
  const next = { ...question, attempt_id: 'attempt-two' }
  const accepted = { ...result, next_attempt: next, encounter: { ...result.encounter, outcome: 'in_progress' } }
  const h = harness({ mutation: async (path, _, state) => {
    if (path === '/api/practice/attempts') { state.setActive(question); return json({ created: true, attempt: question }) }
    state.setActive(next); state.setStatus({ xp: 10, state_version: 1 }); return json(accepted)
  } })
  await h.login(); await h.session.practice()
  const one = h.session.answer('12')
  const two = h.session.answer('12')
  assert.equal(one, two)
  await one
  assert.equal(h.calls.filter((c) => c.path.endsWith('/answer')).length, 1)
  assert.equal(h.session.getSnapshot().status.xp, 10)
  assert.equal(h.session.getSnapshot().attempt.attempt_id, next.attempt_id)
  assert.deepEqual(h.session.getSnapshot().result, accepted)
  await h.session.answer('13')
  assert.equal(h.calls.filter((c) => c.path.endsWith('/answer')).length, 1, 'review must be continued before answering next question')
})

test('invalid answer releases action; corrected input uses a fresh key', async () => {
  let answers = 0
  const h = harness({ mutation: async (path, _, state) => {
    if (path === '/api/practice/attempts') { state.setActive(question); return json({ created: true, attempt: question }) }
    if (++answers === 1) return json({ error: { code: 'invalid_answer', message: 'Enter a number.' } }, 422)
    state.setActive(null); state.setStatus({ xp: 10, state_version: 1 }); return json(result)
  } })
  await h.login(); await h.session.practice(); await h.session.answer('bad')
  assert.equal(h.session.getSnapshot().unresolved, null)
  assert.equal(h.session.getSnapshot().attempt.attempt_id, question.attempt_id)
  await h.session.answer('12')
  const sent = h.calls.filter((c) => c.path.endsWith('/answer'))
  assert.notEqual(sent[0].headers['Idempotency-Key'], sent[1].headers['Idempotency-Key'])
})

test('ambiguous answer retry preserves original answer and key', async () => {
  let failed = false
  const h = harness({ mutation: async (path, _, state) => {
    if (path === '/api/practice/attempts') { state.setActive(question); return json({ created: true, attempt: question }) }
    if (!failed) { failed = true; throw new TypeError('connection dropped') }
    state.setActive(null); state.setStatus({ xp: 10, state_version: 1 }); return json(result)
  } })
  await h.login(); await h.session.practice(); await h.session.answer('12')
  await h.session.answer('999')
  await h.session.retry()
  const calls = h.calls.filter((c) => c.path.endsWith('/answer'))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].body, calls[1].body)
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key'])
  assert.equal(h.session.getSnapshot().unresolved, null)
})

test('backend eligibility rejection is surfaced without granting XP or unlocking', async () => {
  const h = harness({ mutation: async () => json({ error: { code: 'adventure_locked', message: 'Earn 100 XP in practice first.' } }, 409) })
  await h.login(); await h.session.battle()
  assert.equal(h.session.getSnapshot().error.message, 'Earn 100 XP in practice first.')
  assert.equal(h.session.getSnapshot().status.xp, 0)
  assert.equal(h.session.getSnapshot().status.adventure_unlocked, false)
  assert.equal(h.session.getSnapshot().unresolved, null)
})

test('server failure keeps the mutation journal and successful retry clears it', async () => {
  let fail = true
  const h = harness({ mutation: async (_, __, s) => {
    if (fail) { fail = false; return json({ error: { code: 'internal_error', message: 'Please retry.' } }, 500) }
    s.setActive(question)
    return json({ ...status, battle_attempt_id: 'b1', villain_id: 'forest-goblin', villain_name: 'Forest Goblin', entry_cost: 30, attempt: question })
  } })
  await h.login(); await h.session.battle()
  assert.ok(h.session.getSnapshot().unresolved)
  await h.session.retry()
  assert.equal(h.session.getSnapshot().unresolved, null)
  const calls = h.calls.filter((c) => c.path === '/api/adventure/battles')
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key'])
})

test('replayed battle start restores current active question instead of its old first question', async () => {
  const current = { ...question, attempt_id: 'current-question' }
  const h = harness({ mutation: async (_, __, s) => {
    s.setActive(current)
    return json({ ...status, battle_attempt_id: 'b1', villain_id: 'forest-goblin', villain_name: 'Forest Goblin', entry_cost: 30, attempt: question })
  } })
  await h.login(); await h.session.battle()
  assert.equal(h.session.getSnapshot().attempt.attempt_id, current.attempt_id)
})

test('expired persisted session clears authentication, question, and stored token', async () => {
  const storage = memoryStorage()
  const first = harness({ storage }); await first.login()
  const expired = createGameSession({ storage, fetchImpl: async () => json({ error: { code: 'invalid_token', message: 'Expired.' } }, 401) })
  await expired.refresh()
  assert.equal(expired.getSnapshot().signedIn, false)
  assert.equal(expired.getSnapshot().attempt, null)
  assert.equal(expired.getSnapshot().error.code, 'session_expired')
  const reload = createGameSession({ storage })
  assert.equal(reload.getSnapshot().signedIn, false)
})

test('job polling stops on ready, failure, timeout and cancellation', async () => {
  const signal = new AbortController().signal
  let calls = 0
  const ready = await pollJob(async () => ({ status: ++calls === 2 ? 'ready' : 'processing' }), signal, { intervalMs: 1 })
  assert.equal(ready.status, 'ready')
  await assert.rejects(pollJob(async () => ({ status: 'failed', error: 'Unreadable PDF' }), signal), /Unreadable PDF/)
  await assert.rejects(pollJob(async () => ({ status: 'pending' }), signal, { timeoutMs: 5, intervalMs: 1 }), /longer than/)
  const abort = new AbortController(); abort.abort()
  await assert.rejects(pollJob(async () => { throw new Error('must not read') }, abort.signal), /Polling stopped/)
})

test('goblin proximity rejects far and airborne positions; owned model resources dispose', () => {
  assert.equal(nearGoblin({ x: 0, y: 1.6, z: 19 }), false)
  assert.equal(nearGoblin({ ...GOBLIN_SPOT, y: 1.6 }), true)
  assert.equal(nearGoblin({ ...GOBLIN_SPOT, y: 8 }), false)
  const goblin = createForestGoblin()
  assert.equal(goblin.root.name, 'Forest Goblin')
  const resources = new Set()
  goblin.root.traverse((node) => { if (node.geometry) resources.add(node.geometry); if (node.material) resources.add(node.material) })
  let disposed = 0
  resources.forEach((r) => r.addEventListener('dispose', () => disposed++))
  goblin.update(1)
  disposeScene(goblin.root)
  assert.equal(disposed, resources.size)
})
