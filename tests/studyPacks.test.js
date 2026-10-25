import test from 'node:test'
import assert from 'node:assert/strict'
import { createGameSession } from '../src/api/gameSession.js'
import { createApiClient } from '../src/api/client.js'
import { validStudyPack } from '../src/api/responseValidation.js'
import { normalizeApiBase } from '../src/api/config.js'
import { createForestRun } from '../src/game/forestRun.js'
import { backendWorldView } from '../src/game/backendWorld.js'
import { approachingForestEncounter, forestEnemyEligible, forestHeight } from '../src/forestLayout.js'

const id = 'a'.repeat(32), practiceId = 'b'.repeat(32), adventureId = 'c'.repeat(32)
const pack = (status = 'processing', stage = 'indexing') => ({ document_id: id, name: 'biology.pdf', topic: 'Biology', status, stage, error: null, practice: status === 'ready' ? { question_set_id: practiceId, mode: 'practice', status: 'ready', error: null, question_count: 10 } : null, adventure: status === 'ready' ? { question_set_id: adventureId, mode: 'adventure', status: 'ready', error: null, question_count: 3 } : null, created_at: '', updated_at: '' })
const ready = pack('ready', 'done'), file = new File(['%PDF-1.4'], 'biology.pdf', { type: 'application/pdf' })
const balances = { xp: 0, health: 100, max_health: 100, state_version: 0, adventure_unlocked: false, adventure_completed: false, location: 'playground' }
const question = { attempt_id: 'attempt', question_id: 'q', mode: 'practice', type: 'multiple_choice', prompt: 'PDF question', options: [{ id: 'a', text: 'One' }, { id: 'b', text: 'Two' }], topic: 'Biology', difficulty: 1, sources: [], battle: null }
const json = (v, status = 200) => new Response(JSON.stringify(v), { status })
function harness(work = async () => json(ready), storage = (() => { const values = new Map(); return { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) } })()) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname; calls.push({ path, ...init })
    if (path.endsWith('/login')) return json({ access_token: 'token', token_type: 'bearer', expires_at: '2099-01-01' })
    if (path.endsWith('/logout')) return new Response(null, { status: 204 })
    if (path.endsWith('/status')) return json(balances)
    if (path.endsWith('/state')) return json({ ...balances, username: 'ada', villains: [], rules: { unlock_threshold: 100, battle_cost: 30 } })
    if (path.endsWith('/active-attempt')) return json({ attempt: null })
    return work(path, init)
  }
  const session = createGameSession({ storage, baseUrl: 'http://api.test', fetchImpl })
  return { session, calls, storage, fetchImpl, login: () => session.authenticate('login', { username: 'ada', password: 'test-password' }) }
}

test('backend URL is explicit, public and validated; blank performs no network access', async () => {
  assert.equal(normalizeApiBase('  '), '')
  assert.equal(normalizeApiBase('http://localhost:8000/'), 'http://localhost:8000')
  for (const url of ['javascript:alert(1)', 'http://secret@host', 'http://host/?key=secret']) assert.throws(() => normalizeApiBase(url))
  const api = createApiClient({ baseUrl: '', fetchImpl: () => { throw Error('must not fetch') } })
  await assert.rejects(api.health(), (e) => e.code === 'backend_not_configured')
})

test('upload progresses through indexing and writing to ready; duplicate starts send one PDF', async () => {
  let reads = 0
  const h = harness(async (_, init) => init.method === 'POST' ? json(pack(), 202) : json(++reads === 1 ? pack('processing', 'writing_questions') : ready))
  await h.login()
  const one = h.session.preparePack(file, { topic: 'Cells', practiceCount: 5, pollOptions: { intervalMs: 1 } })
  const two = h.session.preparePack(file)
  assert.equal(one, two)
  assert.deepEqual(await one, ready)
  const upload = h.calls.find((c) => c.path === '/api/study-packs' && c.method === 'POST')
  assert.equal(upload.headers.Authorization, 'Bearer token')
  assert.equal(upload.headers['Content-Type'], undefined)
  assert.equal(upload.body.get('topic'), 'Cells'); assert.equal(upload.body.get('practice_count'), '5')
  assert.equal(h.calls.filter((c) => c.method === 'POST' && c.path === '/api/study-packs').length, 1)
  assert.equal(h.session.getSnapshot().status.xp, 0, 'preparation never awards XP')
})

test('selected PDF IDs scope practice and battles; selection survives reload using reads only', async () => {
  const h = harness(async (path) => {
    if (path === '/api/study-packs') return json({ study_packs: [ready] })
    if (path === '/api/practice/attempts') return json({ created: true, attempt: question }, 201)
    return json({ error: { code: 'adventure_locked', message: 'Earn 100 XP.' } }, 409)
  })
  await h.login(); await h.session.loadPacks(); h.session.selectPack(id)
  const reload = createGameSession({ storage: h.storage, baseUrl: 'http://api.test', fetchImpl: h.fetchImpl })
  const before = h.calls.length
  await reload.refresh(); await reload.loadPacks()
  assert.ok(h.calls.slice(before).every((c) => c.method === 'GET'))
  assert.equal(reload.getSnapshot().pack.document_id, id)
  await reload.battle(); await reload.practice()
  assert.deepEqual(JSON.parse(h.calls.find((c) => c.path === '/api/adventure/battles').body), { question_set_id: adventureId })
  assert.deepEqual(JSON.parse(h.calls.find((c) => c.path === '/api/practice/attempts').body), { question_set_id: practiceId })
  assert.equal(reload.getSnapshot().status.adventure_unlocked, false)
})

test('failed packs display the backend failure and cannot silently draw other questions', async () => {
  const h = harness(async () => json({ ...pack('failed', 'failed'), error: 'Scanned PDF is unreadable.' }))
  await h.login(); await h.session.preparePack(file)
  assert.match(h.session.getSnapshot().packError.message, /Scanned PDF/)
  assert.equal(h.session.getSnapshot().pack.status, 'failed')
  const before = h.calls.length; await h.session.practice(); await h.session.battle()
  assert.equal(h.calls.length, before)
  assert.match(h.session.getSnapshot().error.message, /not ready/)
})

test('bounded polling and cancellation retain a recoverable pack; resuming never uploads twice', async () => {
  const h = harness(async () => json(pack()))
  await h.login()
  await h.session.preparePack(file, { pollOptions: { timeoutMs: 5, intervalMs: 1 } })
  assert.match(h.session.getSnapshot().packError.message, /longer than/)
  const wait = h.session.preparePack(null, { pollOptions: { intervalMs: 100 } })
  h.session.cancelPack(); await wait
  assert.equal(h.session.getSnapshot().packBusy, false)
  assert.equal(h.session.getSnapshot().pack.document_id, id)
  assert.equal(h.calls.filter((c) => c.path === '/api/study-packs' && c.method === 'POST').length, 1)
})

test('an ambiguous upload shows an error without automatic retry; list recovers the created pack', async () => {
  const h = harness(async (_, init) => { if (init.method === 'POST') throw new TypeError('lost response'); return json({ study_packs: [ready] }) })
  await h.login(); await h.session.preparePack(file)
  assert.equal(h.session.getSnapshot().packError.code, 'connection_failed')
  await h.session.loadPacks(); h.session.selectPack(id)
  assert.deepEqual(h.session.getSnapshot().pack, ready)
  assert.equal(h.calls.filter((c) => c.path === '/api/study-packs' && c.method === 'POST').length, 1)
})

test('pack validation rejects unmapped receipts, malformed sets, and incomplete ready responses', () => {
  assert.equal(validStudyPack({ receipt: true }), false)
  assert.equal(validStudyPack({ ...ready, practice: null }), false)
  assert.equal(validStudyPack({ ...ready, adventure: { ...ready.adventure, mode: 'practice' } }), false)
  assert.equal(validStudyPack(ready), true)
})

test('expired sessions fence late polling and clear selected content and progress', async () => {
  const h = harness(async (_, init) => init.method === 'POST' ? json(pack(), 202) : json({ error: { code: 'expired', message: 'Expired' } }, 401))
  await h.login(); await h.session.preparePack(file)
  assert.equal(h.session.getSnapshot().signedIn, false)
  assert.equal(h.session.getSnapshot().pack, null)
  assert.equal(h.session.getSnapshot().status, null)
  assert.equal(h.session.getSnapshot().packBusy, false)
})

test('account world cannot use local XP/items to unlock or claim victory; guest rules stay independent', () => {
  const world = { ...createForestRun(), xp: 1000, collectedIds: ['invented'], bridgeState: 'lowered', dragonDefeated: true }
  const locked = backendWorldView(world, { signedIn: true, status: balances })
  assert.equal(locked.bridgeState, 'raised'); assert.equal(locked.dragonDefeated, false); assert.deepEqual(locked.collectedIds, [])
  const unlocked = backendWorldView(createForestRun(), { signedIn: true, status: { ...balances, xp: 70, adventure_unlocked: true, adventure_completed: true } })
  assert.equal(unlocked.bridgeState, 'lowering'); assert.equal(unlocked.dragonDefeated, true)
  assert.equal(forestEnemyEligible(unlocked, 'goblin'), true)
  const spot = unlocked.layout.encounters[0]
  assert.equal(approachingForestEncounter({ ...spot, y: forestHeight(spot.x, spot.z, unlocked.layout) + 1.6 }, unlocked), null, 'account mode never automatically starts battles')
  assert.equal(backendWorldView(world, { signedIn: false, status: { adventure_unlocked: true } }).bridgeState, 'raised')
  const expiredCastle = backendWorldView({ ...world, stage: 'castle', spawnId: 'castle-approach' }, { signedIn: false, status: null })
  assert.equal(expiredCastle.stage, 'forest'); assert.equal(expiredCastle.spawnId, 'start')
  assert.equal(createForestRun().accountMode, undefined)
})

test('a failed adventure pack can still use its ready practice set without enabling battle', async () => {
  const partial = { ...ready, status: 'failed', stage: 'failed', error: 'Adventure generation failed.', adventure: null }
  const h = harness(async (path) => path === '/api/practice/attempts' ? json({ created: true, attempt: question }, 201) : json(partial))
  await h.login(); await h.session.preparePack(file); await h.session.practice()
  assert.deepEqual(JSON.parse(h.calls.find((c) => c.path === '/api/practice/attempts').body), { question_set_id: practiceId })
  const before = h.calls.length; await h.session.battle()
  assert.equal(h.calls.length, before)
  assert.equal(h.session.getSnapshot().status.adventure_unlocked, false)
})

test('an older pack list cannot overwrite a newer preparation response', async () => {
  let release
  const h = harness(async (path, init) => path === '/api/study-packs' && init.method === 'GET' ? new Promise((r) => { release = r }) : json(ready))
  await h.login()
  const list = h.session.loadPacks()
  await h.session.preparePack(file)
  release(json({ study_packs: [pack()] })); await list
  assert.equal(h.session.getSnapshot().pack.status, 'ready')
})

test('polling refuses another document ID without attaching its content', async () => {
  const h = harness(async (_, init) => json(init.method === 'POST' ? pack() : { ...ready, document_id: 'd'.repeat(32) }))
  await h.login(); await h.session.preparePack(file)
  assert.match(h.session.getSnapshot().packError.message, /different study pack/)
  assert.equal(h.session.getSnapshot().pack.document_id, id)
})

test('accepted answer flags remain authoritative even when follow-up reconciliation is offline', async () => {
  let failReads = false, pending = false
  const accepted = { attempt_id: question.attempt_id, correct: true, feedback: { correct_answer: 'b', explanation: 'Stored feedback' }, xp: 70, xp_delta: 30, health: 100, health_delta: 0, max_health: 100, state_version: 3, next_attempt: null, encounter: { mode: 'adventure', outcome: 'won', adventure_unlocked_now: true, adventure_completed: true } }
  const h = harness(async (path) => {
    if (path === '/api/practice/attempts') { pending = true; return json({ created: true, attempt: question }) }
    failReads = true; return json(accepted)
  })
  const session = createGameSession({ baseUrl: 'http://api.test', fetchImpl: (url, init) => failReads && init.method === 'GET' ? Promise.reject(new TypeError('offline')) : new URL(url).pathname === '/api/me/active-attempt' ? Promise.resolve(json({ attempt: pending ? question : null })) : h.fetchImpl(url, init) })
  await session.authenticate('login', { username: 'ada', password: 'test-password' })
  await session.practice(); await session.answer('b')
  const state = session.getSnapshot()
  assert.equal(state.status.xp, 70)
  assert.equal(state.status.adventure_unlocked, true)
  assert.equal(state.status.adventure_completed, true)
  assert.equal(state.result.encounter.outcome, 'won')
  assert.equal(state.unresolved, null)
  assert.equal(state.error.code, 'connection_failed')
})
