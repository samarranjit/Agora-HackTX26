import test from 'node:test'
import assert from 'node:assert/strict'
import { generateForestLayout, createForestWorld, pathX, forestHeight, FOREST_PATH, approachingForestEncounter, HALL, createHallWorld, hallHeight } from '../src/forestLayout.js'
import { createForestRun, forestRunReducer, forestTurnToken } from '../src/game/forestRun.js'
import { FOREST_COLLECTIBLES, FOREST_ENEMIES } from '../src/game/forestContent.js'
import { createCastleHallScene } from '../src/forestScene.js'
import { validateProfilePdf, uploadProfilePdf } from '../src/api/profilePdf.js'
import { createApiClient } from '../src/api/client.js'

const event = (run, type, fields = {}) => forestRunReducer(run, { type, runId: run.runId, token: forestTurnToken(run), ...fields })
function collect(run, id) {
  run = event(run, 'OPEN_CHALLENGE', { targetId: id })
  for (let i = 0; i < 3; i++) { run = event(run, 'ANSWER', { answer: 'answer' }); if (i < 2) run = event(run, 'NEXT_QUESTION') }
  return run
}

test('seeded layouts repeat within a run, vary across runs, and reserve routes for every item', () => {
  assert.deepEqual(generateForestLayout('same'), generateForestLayout('same'))
  assert.notDeepEqual(generateForestLayout('same').collectibles, generateForestLayout('different').collectibles)
  for (let seed = 0; seed < 50; seed++) {
    const layout = generateForestLayout(seed), world = createForestWorld('start', layout)
    assert.equal(layout.collectibles.length, 5)
    assert.ok(layout.encounters[0].z - layout.encounters[1].z >= 16)
    for (const item of layout.collectibles) {
      assert.ok(Math.abs(item.x) < 20 && item.z > -18 && item.z < 36)
      assert.ok(Math.hypot(item.x, item.z - 40) > 9)
      for (const other of layout.collectibles) if (other !== item) assert.ok(Math.hypot(item.x - other.x, item.z - other.z) >= 8)
      const from = { x: pathX(item.z), z: item.z }, target = { x: item.x + Math.sign(from.x - item.x) * 1.8, z: item.z }
      const reached = world.move(from, target)
      assert.ok(Math.hypot(reached.x - target.x, reached.z - target.z) < 0.02, `seed ${seed}: branch to ${item.id} must stay clear`)
      assert.ok(Number.isFinite(forestHeight(item.x, item.z, layout)))
    }
    for (let i = 1; i < FOREST_PATH.length - 1; i++) {
      const from = FOREST_PATH[i - 1], to = FOREST_PATH[i], reached = world.move(from, to)
      assert.ok(Math.hypot(reached.x - to.x, reached.z - to.z) < 0.02, 'the full main route stays clear')
    }
  }
  const first = createForestRun(), reset = event(first, 'RESET_RUN')
  assert.notEqual(first.layout.seed, reset.layout.seed)
})

test('pedestal bases stop normal and diagonal approaches from every side without moving interactions', () => {
  const run = createForestRun({ seed: 'pedestals' }), world = createForestWorld('start', run.layout)
  for (const item of run.layout.collectibles) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    const from = { x: item.x + dx * 2.4, z: item.z + dz * 2.4 }, end = world.move(from, item)
    const distance = Math.hypot(end.x - item.x, end.z - item.z)
    assert.ok(distance >= 1.079 && distance < 2.6)
    assert.deepEqual(world.move(end, item), end, 'pushing toward the pedestal should remain stable')
  }
})

test('goblin starts after two stories; wolf is later, ordered, once per run, and combat has no help', () => {
  let run = createForestRun({ seed: 'encounters' })
  const at = (r, id) => { const spot = r.layout.encounters.find((p) => p.id === id); return { ...spot, y: forestHeight(spot.x, spot.z, r.layout) + 1.6 } }
  assert.equal(approachingForestEncounter(at(run, 'goblin'), run), null)
  run = collect(run, 'trident'); assert.equal(approachingForestEncounter(at(run, 'goblin'), run), null)
  run = collect(run, 'cloak'); assert.equal(run.xp, 40)
  assert.equal(approachingForestEncounter(at(run, 'goblin'), run), 'goblin')
  assert.equal(approachingForestEncounter(at(run, 'wolf'), run), null)
  assert.equal(event(run, 'START_FOREST_ENCOUNTER', { targetId: 'wolf' }), run)
  run = event(run, 'START_FOREST_ENCOUNTER', { targetId: 'goblin' })
  assert.equal(event(run, 'SHOW_EXPLANATION'), run)
  assert.equal(event(run, 'OPEN_CHALLENGE', { targetId: 'slipper' }), run)
  assert.equal(approachingForestEncounter(at(run, 'goblin'), run), null)
  run = event(run, 'ANSWER', { answer: 'wrong' }); assert.equal(run.hearts, 2)
  run = event(run, 'NEXT_QUESTION'); run = event(run, 'ANSWER', { answer: 'answer' })
  assert.deepEqual(run.defeatedEnemyIds, ['goblin']); assert.equal(run.xp, 40)
  assert.equal(event(run, 'START_FOREST_ENCOUNTER', { targetId: 'goblin' }), run)
  assert.equal(approachingForestEncounter(at(run, 'wolf'), run), 'wolf')
  run = event(run, 'START_FOREST_ENCOUNTER', { targetId: 'wolf' })
  assert.equal(event(run, 'SHOW_EXPLANATION'), run)
  const wounded = event(run, 'ANSWER', { answer: 'wrong' })
  assert.equal(wounded.hearts, 1)
  const exhausted = event(event(wounded, 'NEXT_QUESTION'), 'ANSWER', { answer: 'wrong' })
  assert.notEqual(exhausted.runId, run.runId)
  assert.equal(exhausted.hearts, 3); assert.equal(exhausted.xp, 0)
  assert.deepEqual(exhausted.startedEnemyIds, []); assert.deepEqual(exhausted.defeatedEnemyIds, [])
  run = event(run, 'ANSWER', { answer: 'answer' })
  assert.deepEqual(run.defeatedEnemyIds, ['goblin', 'wolf']); assert.equal(run.xp, 40)
  for (const target of FOREST_ENEMIES) assert.ok(target.questions.length < FOREST_COLLECTIBLES[0].questions.length)
  run = event(run, 'RESET_RUN'); assert.deepEqual(run.startedEnemyIds, []); assert.deepEqual(run.defeatedEnemyIds, [])
})

test('dragon help is rejected by the reducer and the hall is physically immense with a visible princess', () => {
  let run = createForestRun()
  for (const item of FOREST_COLLECTIBLES) run = collect(run, item.id)
  run = event(run, 'BRIDGE_LOWERED'); run = event(run, 'ENTER_CASTLE'); run = event(run, 'OPEN_CHALLENGE', { targetId: 'dragon' })
  assert.equal(event(run, 'SHOW_EXPLANATION'), run)
  assert.ok(HALL.ceiling >= 40 && HALL.front - HALL.back >= 140)
  const world = createHallWorld()
  assert.ok(world.spawn.z - HALL.dragon.z > 100)
  const approach = world.move(world.spawn, { x: 0, z: -39 })
  assert.ok(approach.z < -38)
  assert.ok(hallHeight(0, -60) > 0)
  const column = world.move({ x: 20, z: 20 }, { x: 25, z: 20 })
  assert.ok(25 - column.x >= 2.65, 'column bases include player clearance')
  const scene = createCastleHallScene()
  assert.ok(scene.scene.getObjectByName('Storywood Princess'))
  assert.ok(scene.scene.getObjectByName('Storykeeper Dragon'))
  assert.ok(HALL.princess.z < HALL.dragon.z && HALL.princess.x > HALL.dragon.x + 10)
  scene.dispose()
})

test('PDF validation rejects invalid and empty files; disconnected upload sends nothing', async () => {
  const valid = new File(['%PDF-1.4\nplaceholder'], 'notes.pdf', { type: 'application/pdf' })
  assert.equal(await validateProfilePdf(valid), valid)
  for (const file of [null, new File([], 'empty.pdf'), new File(['png'], 'image.png', { type: 'image/png' }), new File(['not pdf'], 'fake.pdf')]) await assert.rejects(validateProfilePdf(file))
  await assert.rejects(validateProfilePdf(valid, 1), /no larger/)
  let calls = 0
  await assert.rejects(uploadProfilePdf(valid, { endpoint: '', fetchImpl: async () => { calls++; throw Error('must not send') } }), /not connected/)
  assert.equal(calls, 0)
})

test('PDF processing uses the authenticated study-pack contract and browser multipart boundary', async () => {
  const file = new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' })
  let sent
  const pack = { document_id: 'a'.repeat(32), name: 'notes.pdf', topic: 'Notes', status: 'processing', stage: 'indexing', error: null, practice: null, adventure: null, created_at: '', updated_at: '' }
  const api = createApiClient({ baseUrl: 'http://example.test', getToken: () => 'account-token', fetchImpl: async (url, init) => { sent = { url, ...init }; return new Response(JSON.stringify(pack), { status: 202 }) } })
  assert.deepEqual(await uploadProfilePdf(file, { api }), pack)
  assert.equal(sent.url, 'http://example.test/api/study-packs'); assert.equal(sent.headers.Authorization, 'Bearer account-token')
  assert.equal(sent.headers['Content-Type'], undefined); assert.equal(sent.body.get('file').name, 'notes.pdf')
  assert.equal(sent.body.get('practice_count'), '10')
  const empty = createApiClient({ fetchImpl: async () => new Response(null, { status: 204 }) })
  await assert.rejects(uploadProfilePdf(file, { api: empty }), (e) => e.code === 'invalid_response' && e.ambiguous)
})
