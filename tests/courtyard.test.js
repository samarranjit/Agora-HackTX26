import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlayerMotion, MAX_STAMINA, WALK_SPEED, SPRINT_SPEED } from '../src/playerMotion.js'
import { COURTYARD_WORLD, COURTYARD_SPAWN, COLLIDERS, moveInCourtyard, courtyardGroundHeight, isSolid } from '../src/courtyardLayout.js'
import { createCourtyardScene } from '../src/courtyardScene.js'
import { createInitialRunState } from '../src/game/runState.js'

const idle = { x: 0, z: 0, sprint: false, jump: false }
const flatWorld = { ...COURTYARD_WORLD, move: (_, target) => target, groundHeight: () => 0, needsRespawn: () => false }
function advance(motion, seconds, input = idle) {
  for (let i = 0; i < Math.round(seconds * 60); i++) motion.update(1 / 60, input, 0)
}

test('outdoor walking/sprinting uses normalized direction and fixed speeds', () => {
  const walk = createPlayerMotion(flatWorld)
  advance(walk, 1, { ...idle, x: 1, z: 1 })
  assert.ok(Math.abs(Math.hypot(walk.position.x, walk.position.z - COURTYARD_SPAWN.z) - WALK_SPEED) < 1e-8)
  const sprint = createPlayerMotion(flatWorld)
  advance(sprint, 1, { ...idle, z: 1, sprint: true })
  assert.ok(Math.abs(COURTYARD_SPAWN.z - sprint.position.z - SPRINT_SPEED) < 1e-8)
})

test('jump rises, rejects another airborne jump and lands on ground', () => {
  const motion = createPlayerMotion(flatWorld)
  motion.update(1 / 60, { ...idle, jump: true }, 0)
  assert.equal(motion.grounded, false)
  let highest = 0
  for (let i = 0; i < 35; i++) {
    motion.update(1 / 60, { ...idle, jump: i === 10 }, 0)
    highest = Math.max(highest, motion.position.y)
  }
  assert.ok(highest > 0.9 && highest < 1.3)
  advance(motion, 1)
  assert.equal(motion.position.y, 0)
  assert.equal(motion.grounded, true)
})

test('stamina exhausts, forces walking and recovers without toggling sprint every frame', () => {
  const motion = createPlayerMotion(flatWorld)
  advance(motion, 4, { ...idle, z: 1, sprint: true })
  assert.equal(motion.exhausted, true)
  assert.equal(motion.sprinting, false)
  const before = motion.position.z
  advance(motion, 1, { ...idle, z: 1, sprint: true })
  assert.ok(Math.abs(before - motion.position.z - WALK_SPEED) < 1e-8)
  advance(motion, 6)
  assert.equal(motion.stamina, MAX_STAMINA)
  assert.equal(motion.exhausted, false)
  motion.update(1 / 60, { ...idle, z: 1, sprint: true }, 0)
  assert.equal(motion.sprinting, true)
})

test('moat fall respawns once, clears velocity and leaves run data untouched', () => {
  const run = createInitialRunState('hard')
  run.xp = 15
  run.collectedRelicIds.push('future-progress-fixture')
  const before = structuredClone(run)
  const motion = createPlayerMotion(COURTYARD_WORLD)
  Object.assign(motion.position, { x: 21, y: 0, z: 12 }) // Eastern moat opening.
  advance(motion, 2)
  assert.equal(motion.respawns, 1)
  assert.deepEqual(motion.position, { x: COURTYARD_SPAWN.x, y: 0, z: COURTYARD_SPAWN.z })
  assert.equal(motion.grounded, true)
  advance(motion, 2)
  assert.equal(motion.respawns, 1, 'safe spawn must not retrigger the hazard')
  assert.deepEqual(run, before)
})

test('walls, fountain, towers and palace block motion without tunneling; wall sliding remains possible', () => {
  const wall = moveInCourtyard({ x: 0, z: 19 }, { x: 30, z: 19 })
  assert.ok(wall.x < 19.1 && wall.x > 18)
  const fountain = moveInCourtyard({ x: 0, z: 19 }, { x: 0, z: -8 })
  assert.ok(fountain.z >= 7.1)
  const tower = moveInCourtyard({ x: -18, z: -3 }, { x: -18, z: -8 })
  assert.ok(tower.z > -5.1)
  const keep = moveInCourtyard({ x: 0, z: -12 }, { x: 0, z: -30 })
  assert.ok(keep.z > -17.7)
  const slide = moveInCourtyard(wall, { x: wall.x + 3, z: 21 })
  assert.ok(slide.x < 19.1 && slide.z > wall.z)
  assert.equal(isSolid(COURTYARD_SPAWN.x, COURTYARD_SPAWN.z), false)
  assert.ok(COLLIDERS.length > 10)
})

test('moat is unsupported on all sides and the closed bridge is not a walkable route', () => {
  for (const [x, z] of [[21, 12], [-21, 12], [0, 25], [0, -14]]) assert.equal(courtyardGroundHeight(x, z), null)
  assert.equal(courtyardGroundHeight(0, 19), 0)
  const motion = createPlayerMotion(COURTYARD_WORLD)
  Object.assign(motion.position, { x: 0, y: 0, z: -8.8 })
  motion.update(1 / 60, { ...idle, z: 1, sprint: true, jump: true }, 0)
  advance(motion, 2, { ...idle, z: 1, sprint: true })
  assert.ok(motion.respawns >= 1, 'sprint-jump cannot cross the eight-unit moat')
})

test('courtyard uses bounded instance batches and can be disposed repeatedly', () => {
  const court = createCourtyardScene()
  let batches = 0
  court.scene.traverse((node) => { if (node.isInstancedMesh) batches++ })
  assert.ok(batches < 65, 'repeated scenery should share draw calls')
  court.update(0.1)
  court.dispose()
  court.dispose()
  court.update(0.1)
})
