import test from 'node:test'
import assert from 'node:assert/strict'
import { FOREST_COLLECTIBLES, FOREST_DRAGON, FILLER } from '../src/game/forestContent.js'
import { createForestRun, forestRunReducer, forestTurnToken, activeForestChallenge, FOREST_RULES } from '../src/game/forestRun.js'
import { createForestWorld, forestHeight, nearbyForestTarget, FOREST_SPAWN } from '../src/forestLayout.js'
import { createPlayerMotion } from '../src/playerMotion.js'
import { createForestScene, createCastleHallScene } from '../src/forestScene.js'

const event = (run, type, fields = {}) => forestRunReducer(run, { type, runId: run.runId, token: forestTurnToken(run), ...fields })
function collect(run, item) {
  run = event(run, 'OPEN_CHALLENGE', { targetId: item.id })
  for (let i = 0; i < 3; i++) {
    run = event(run, 'ANSWER', { answer: ' answer ' })
    if (i < 2) run = event(run, 'NEXT_QUESTION')
  }
  return run
}

test('exactly five distinct items have exactly fifteen centralized filler questions', () => {
  assert.equal(FOREST_COLLECTIBLES.length, 5)
  const questions = FOREST_COLLECTIBLES.flatMap((item) => item.questions)
  assert.equal(questions.length, 15)
  assert.equal(new Set(questions.map((q) => q.id)).size, 15)
  for (const item of FOREST_COLLECTIBLES) {
    assert.equal(item.questions.length, 3)
    for (const q of item.questions) { assert.equal(q.question, '*filler question*'); assert.deepEqual(q.answers, ['answer']); assert.equal(q.explanation, 'filler explanation') }
  }
  assert.equal(FILLER.question, '*filler question*')
  assert.equal(FOREST_RULES.difficultyId, 'medium')
})

test('three correct answers are required; rewards/checkpoints and stale submissions are deduplicated', () => {
  let run = createForestRun()
  run = event(run, 'OPEN_CHALLENGE', { targetId: 'trident' })
  const duplicate = { type: 'ANSWER', runId: run.runId, token: forestTurnToken(run), answer: 'answer' }
  run = forestRunReducer(run, duplicate)
  assert.equal(run.xp, 0)
  assert.equal(run.collectedIds.length, 0)
  assert.equal(forestRunReducer(run, duplicate), run)
  run = event(run, 'NEXT_QUESTION')
  assert.equal(forestRunReducer(run, duplicate), run)
  run = event(run, 'ANSWER', { answer: 'ANSWER' }); run = event(run, 'NEXT_QUESTION')
  run = event(run, 'ANSWER', { answer: 'answer' })
  assert.deepEqual(run.collectedIds, ['trident'])
  assert.equal(run.xp, FOREST_RULES.itemXp)
  assert.equal(run.checkpoint.id, 'trident')
  assert.equal(run.checkpoints.length, 2)
  assert.equal(event(run, 'ANSWER', { answer: 'answer' }), run)
  assert.equal(event(run, 'OPEN_CHALLENGE', { targetId: 'trident' }), run)
})

test('wrong answers cost one of three hearts, do not advance, and closing/switching cannot heal', () => {
  let run = event(createForestRun(), 'OPEN_CHALLENGE', { targetId: 'cloak' })
  assert.equal(event(run, 'ANSWER', { answer: '   ' }), run)
  run = event(run, 'ANSWER', { answer: 'incorrect' })
  assert.equal(run.hearts, 2); assert.equal(activeForestChallenge(run).index, 0); assert.equal(run.xp, 0)
  const duplicate = event(run, 'ANSWER', { answer: 'incorrect' })
  assert.equal(duplicate, run)
  run = event(run, 'OPEN_CHALLENGE', { targetId: 'slipper' })
  run = event(run, 'OPEN_CHALLENGE', { targetId: 'cloak' })
  assert.equal(run.hearts, 2); assert.equal(activeForestChallenge(run).feedback.correct, false)
  run = event(run, 'NEXT_QUESTION')
  assert.equal(activeForestChallenge(run).index, 0)
})

test('third wrong answer performs a full new run, overriding every checkpoint and old event', () => {
  let run = collect(createForestRun(), FOREST_COLLECTIBLES[0])
  const oldRunId = run.runId
  run = event(run, 'OPEN_CHALLENGE', { targetId: 'cloak' })
  for (let i = 0; i < 3; i++) {
    run = event(run, 'ANSWER', { answer: 'wrong' })
    if (i < 2) run = event(run, 'NEXT_QUESTION')
  }
  assert.notEqual(run.runId, oldRunId)
  assert.equal(run.hearts, 3); assert.equal(run.xp, 0); assert.deepEqual(run.collectedIds, [])
  assert.deepEqual(run.challenges, {}); assert.equal(run.bridgeState, 'raised'); assert.equal(run.stage, 'forest')
  assert.equal(run.spawnId, 'start'); assert.equal(run.checkpoint.id, 'start'); assert.equal(run.checkpoints.length, 1)
  assert.equal(forestRunReducer(run, { type: 'BRIDGE_LOWERED', runId: oldRunId }), run)
})

test('all five completed stories and 100 XP are required; entry waits for animation', () => {
  let run = createForestRun()
  for (const item of FOREST_COLLECTIBLES.slice(0, -1)) run = collect(run, item)
  assert.equal(run.bridgeState, 'raised'); assert.ok(run.xp < FOREST_RULES.unlockXp)
  assert.equal(run.xp, 80)
  const missingItem = { ...run, xp: 100, bridgeState: 'lowering' }
  assert.equal(event(missingItem, 'BRIDGE_LOWERED'), missingItem)
  run = collect(run, FOREST_COLLECTIBLES.at(-1))
  assert.equal(run.xp, 100); assert.equal(run.bridgeState, 'lowering')
  assert.equal(event(run, 'ENTER_CASTLE'), run)
  run = event(run, 'BRIDGE_LOWERED'); run = event(run, 'ENTER_CASTLE')
  assert.equal(run.stage, 'castle'); assert.equal(run.checkpoint.id, 'castle'); assert.equal(run.checkpoints.length, 7)
  const xp = run.xp
  run = collect(run, FOREST_DRAGON)
  assert.equal(run.dragonDefeated, true); assert.equal(run.xp, xp); assert.equal(run.collectedIds.length, 5)
  run = event(run, 'LEAVE_CASTLE'); assert.equal(run.spawnId, 'castle-approach')
  const reset = event(run, 'RESET_RUN')
  assert.equal(reset.dragonDefeated, false); assert.equal(reset.bridgeState, 'raised'); assert.equal(reset.xp, 0)
})

test('terrain follows grounded uphill motion; closed gate and bridge sides cannot be jumped around', () => {
  const world = createForestWorld()
  const motion = createPlayerMotion(world)
  for (let i = 0; i < 180; i++) motion.update(1 / 60, { x: 0, z: 1 }, 0)
  assert.ok(motion.position.y > FOREST_SPAWN.y)
  assert.ok(Math.abs(motion.position.y - world.groundHeight(motion.position.x, motion.position.z)) < 1e-8)
  const blocked = world.move({ x: 0, z: -20 }, { x: 0, z: -34 })
  assert.ok(blocked.z >= -21.6)
  world.setBridgeOpen(true)
  assert.ok(world.move({ x: 0, z: -20 }, { x: 0, z: -34 }).z < -33)
  assert.ok(world.move({ x: 6, z: -20 }, { x: 6, z: -34 }).z > -22)
  assert.ok(world.move({ x: 0, z: -26 }, { x: 10, z: -26 }).x < 2.5)
  const run = createForestRun(), item = run.layout.collectibles[0]
  assert.equal(nearbyForestTarget({ x: item.x, y: forestHeight(item.x, item.z, run.layout) + 1.6, z: item.z }, run), item.id)
  assert.equal(nearbyForestTarget({ x: item.x, y: 40, z: item.z }, run), null)
})

test('forest and hall dispose their owned resources once; lowering signals only after visuals finish', () => {
  const run = createForestRun()
  run.bridgeState = 'lowering'; run.xp = run.rules.unlockXp
  const forest = createForestScene()
  let lowered = 0
  for (let i = 0; i < 200; i++) forest.update(1 / 60, { forestRun: run, onForestBridgeLowered: () => lowered++ })
  assert.equal(lowered, 1)
  assert.ok(forest.world.move({ x: 0, z: -20 }, { x: 0, z: -34 }).z > -22, 'React must acknowledge the completed animation before crossing')
  run.bridgeState = 'lowered'; forest.update(0, { forestRun: run })
  assert.ok(forest.world.move({ x: 0, z: -20 }, { x: 0, z: -34 }).z < -33)
  for (const handle of [forest, createCastleHallScene()]) {
    const resources = new Set()
    handle.scene.traverse((node) => { if (node.geometry) resources.add(node.geometry); if (node.material) resources.add(node.material); node.userData.ownedMaterials?.forEach((m) => resources.add(m)) })
    let disposed = 0; resources.forEach((r) => r.addEventListener('dispose', () => disposed++))
    handle.dispose(); handle.dispose(); handle.update(1, { forestRun: run })
    assert.equal(disposed, resources.size)
  }
})
