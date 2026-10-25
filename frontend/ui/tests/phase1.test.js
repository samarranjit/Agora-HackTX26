import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { DIFFICULTIES, DEFAULT_DIFFICULTY_ID, getDifficulty, PLAYER_MAX_HEARTS, RELIC_XP_REWARD } from '../src/game/difficulty.js'
import { createInitialRunState, resetRunState } from '../src/game/runState.js'
import { createPlayerControls, EYE_HEIGHT } from '../src/playerControls.js'
import { createRoomScene, collide } from '../src/roomScene.js'
import { SAMPLE_MEMORIES, isCorrectAnswer } from '../src/memories.js'

test('difficulty configuration matches all required defaults and is immutable', () => {
  assert.equal(DEFAULT_DIFFICULTY_ID, 'easy')
  assert.equal(RELIC_XP_REWARD, 5)
  assert.equal(PLAYER_MAX_HEARTS, 3)
  const expected = { easy: [5, 5, 25, 3, 5], medium: [10, 7, 50, 4, 10], hard: [20, 9, 100, 5, 20] }
  assert.deepEqual(Object.keys(DIFFICULTIES), Object.keys(expected))
  for (const [id, values] of Object.entries(expected)) {
    const config = getDifficulty(id)
    assert.equal(config.id, id)
    assert.deepEqual([config.relicCount, config.floorCount, config.adventureUnlockXp, config.floorEnemyHearts, config.dragonHearts], values)
    assert.equal(config.relicCount * RELIC_XP_REWARD, config.adventureUnlockXp)
    assert.ok(Object.isFrozen(config))
  }
  assert.ok(Object.isFrozen(DIFFICULTIES))
  assert.throws(() => { DIFFICULTIES.easy.relicCount = 99 }, TypeError)
})

test('unknown and inherited difficulty IDs safely fall back to Easy', () => {
  for (const id of [undefined, null, '', 'Easy', 'extreme', 'constructor', 'toString', '__proto__', 1, {}, ['hard']]) {
    assert.equal(getDifficulty(id), DIFFICULTIES.easy)
    assert.equal(createInitialRunState(id).difficultyId, 'easy')
  }
})

test('new runs and resets own fresh mutable data and preserve only selected difficulty', () => {
  const previous = createInitialRunState('hard')
  const snapshot = structuredClone(previous)
  previous.xp = 50
  previous.collectedRelicIds.push('practice-relic')
  previous.clearedFloors.push(1)
  previous.currentFloor = 2
  previous.checkpoint.floor = 2
  previous.playerHearts = 1
  previous.bridgeState = 'lowered'
  previous.finalEncounter.status = 'defeated'
  previous.room.loaded = true
  previous.room.unlocked = true
  previous.room.discovered.push('mitochondria')
  const reset = resetRunState(previous)
  assert.deepEqual(reset, snapshot)
  assert.equal(previous.xp, 50, 'reset must not mutate its argument')
  const fresh = createInitialRunState('hard')
  for (const field of ['collectedRelicIds', 'clearedFloors', 'checkpoint', 'finalEncounter', 'room']) {
    assert.notEqual(reset[field], previous[field])
    assert.notEqual(reset[field], fresh[field])
  }
  assert.notEqual(reset.room.discovered, fresh.room.discovered)
  assert.equal(resetRunState().difficultyId, 'easy')
  for (const id of Object.keys(DIFFICULTIES)) {
    const run = createInitialRunState(id)
    assert.equal(run.playerHearts, PLAYER_MAX_HEARTS)
    assert.equal(run.finalEncounter.hearts, getDifficulty(id).dragonHearts)
    assert.equal(run.currentFloor, null)
    assert.equal(run.xp, 0)
  }
})

// Small DOM event doubles exercise the actual controller without a DOM package.
class EventTargetDouble {
  listeners = new Map()
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener) }
  emit(type, details = {}) {
    const event = { target: this, preventDefault() {}, ...details }
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
  listenerCount() { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0) }
}

function createControllerHarness() {
  const win = new EventTargetDouble()
  const doc = new EventTargetDouble()
  const canvas = new EventTargetDouble()
  const captures = new Set()
  const camera = new THREE.PerspectiveCamera()
  camera.rotation.order = 'YXZ'
  camera.position.y = EYE_HEIGHT
  doc.defaultView = win
  doc.pointerLockElement = null
  doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.emit('pointerlockchange') }
  canvas.ownerDocument = doc
  canvas.focus = () => {}
  canvas.setPointerCapture = (id) => captures.add(id)
  canvas.hasPointerCapture = (id) => captures.has(id)
  canvas.releasePointerCapture = (id) => captures.delete(id)
  canvas.requestPointerLock = () => {
    doc.pointerLockElement = canvas
    doc.emit('pointerlockchange')
    return Promise.resolve()
  }
  let pauses = 0
  let interactions = 0
  const lockStates = []
  const mount = () => createPlayerControls({
    canvas, camera,
    constrainMovement: (x, z) => ({ x, z }),
    onInteract: () => interactions++,
    onPause: () => pauses++,
    onLockChange: (locked) => lockStates.push(locked),
  })
  return { win, doc, canvas, camera, captures, lockStates, mount, get pauses() { return pauses }, get interactions() { return interactions } }
}

test('movement keeps its speed, diagonal normalization and yaw-relative direction', () => {
  const h = createControllerHarness()
  const controls = h.mount()
  controls.setActive(true)
  h.win.emit('keydown', { key: 'w' })
  h.win.emit('keydown', { key: 'd' })
  controls.update(1, { unlocked: false })
  assert.ok(Math.abs(Math.hypot(h.camera.position.x, h.camera.position.z) - 4.2) < 1e-10)
  controls.setActive(true) // Clear keys without moving the player.
  h.camera.position.set(0, EYE_HEIGHT, 0)
  h.camera.rotation.y = Math.PI / 2
  h.win.emit('keydown', { key: 'w' })
  controls.update(1, { unlocked: false })
  assert.ok(Math.abs(h.camera.position.x + 4.2) < 1e-10)
  assert.ok(Math.abs(h.camera.position.z) < 1e-10)
  controls.dispose()
})

test('typing, pausing and resuming cannot leave movement or interaction keys held', () => {
  const h = createControllerHarness()
  const controls = h.mount()
  controls.setActive(true)
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']) {
    h.win.emit('keydown', { key: 'w', target: { tagName } })
    h.win.emit('keydown', { key: 'e', target: { tagName } })
  }
  h.win.emit('keydown', { key: 'w', target: { isContentEditable: true } })
  controls.update(1, { unlocked: false })
  assert.equal(h.camera.position.z, 0)
  assert.equal(h.interactions, 0)
  h.win.emit('keydown', { key: 'w' })
  controls.setActive(false)
  controls.setActive(true)
  controls.update(1, { unlocked: false })
  assert.equal(h.camera.position.z, 0)
  h.win.emit('keydown', { key: 'e', repeat: true })
  assert.equal(h.interactions, 0)
  h.win.emit('keydown', { key: 'e' })
  assert.equal(h.interactions, 1)
  h.win.emit('keydown', { key: 'Escape' })
  assert.equal(controls.active, false)
  assert.equal(h.pauses, 1)
  controls.dispose()
})

test('drag-look retains pitch bounds and releases pointer capture on pause', () => {
  const h = createControllerHarness()
  const controls = h.mount()
  controls.setActive(true)
  h.win.emit('pointermove', { movementX: 100, movementY: 100 })
  assert.equal(h.camera.rotation.y, 0)
  h.canvas.emit('pointerdown', { button: 0, pointerId: 1 })
  h.win.emit('pointermove', { movementX: 100, movementY: 100000 })
  assert.ok(h.camera.rotation.y < 0)
  assert.ok(Math.abs(h.camera.rotation.x) <= Math.PI / 2 - 0.08)
  assert.equal(h.captures.size, 1)
  controls.setActive(false)
  assert.equal(h.captures.size, 0)
  const yaw = h.camera.rotation.y
  h.win.emit('pointermove', { movementX: 100, movementY: 100 })
  assert.equal(h.camera.rotation.y, yaw)
  controls.dispose()
})

test('lock release, blur, hidden tabs and rejected pointer lock preserve pause/fallback', async () => {
  const h = createControllerHarness()
  const controls = h.mount()
  controls.setActive(true)
  controls.lockMouse()
  await Promise.resolve()
  h.win.emit('pointermove', { movementX: 100, movementY: 0 })
  assert.ok(h.camera.rotation.y < 0)
  h.doc.exitPointerLock()
  assert.equal(controls.active, false)
  assert.equal(h.pauses, 1)
  assert.deepEqual(h.lockStates, [true, false])
  controls.setActive(true)
  h.win.emit('blur')
  assert.equal(controls.active, false)
  controls.setActive(true)
  h.doc.hidden = true
  h.doc.emit('visibilitychange')
  assert.equal(controls.active, false)
  assert.equal(h.pauses, 3)
  controls.setActive(true)
  h.canvas.requestPointerLock = () => Promise.reject(new Error('denied'))
  controls.lockMouse()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(controls.active, true)
  h.canvas.emit('pointerdown', { button: 0, pointerId: 2 })
  const yaw = h.camera.rotation.y
  h.win.emit('pointermove', { movementX: 100, movementY: 0 })
  assert.ok(h.camera.rotation.y < yaw, 'drag fallback still works')
  controls.dispose()
})

test('ten control mounts clean up all listeners and disposed controls stop handling input', () => {
  const h = createControllerHarness()
  for (let i = 0; i < 10; i++) {
    const controls = h.mount()
    controls.setActive(true)
    controls.lockMouse()
    controls.dispose()
    controls.dispose() // Safe to clean up more than once.
    assert.equal(h.win.listenerCount() + h.doc.listenerCount() + h.canvas.listenerCount(), 0)
    assert.equal(h.doc.pointerLockElement, null)
    const position = h.camera.position.clone()
    h.win.emit('keydown', { key: 'w' })
    controls.update(1, { unlocked: false })
    assert.deepEqual(h.camera.position, position)
  }
})

test('pointer-lock requests completing after dispose release the old canvas without UI updates', async () => {
  const h = createControllerHarness()
  let finishRequest
  h.canvas.requestPointerLock = () => new Promise((resolve) => { finishRequest = resolve })
  const controls = h.mount()
  controls.setActive(true)
  controls.lockMouse()
  controls.dispose()
  h.doc.pointerLockElement = h.canvas
  finishRequest()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.doc.pointerLockElement, null)
  assert.deepEqual(h.lockStates, [])
})

test('room handle keeps fact associations, animates the gate and disposes owned resources once', () => {
  const room = createRoomScene(SAMPLE_MEMORIES)
  assert.deepEqual(room.objects.map((object) => object.userData.memoryId), SAMPLE_MEMORIES.map((memory) => memory.id))
  const resources = new Set()
  const counts = new Map()
  room.scene.traverse((node) => {
    if (node.geometry) resources.add(node.geometry)
    if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => resources.add(m))
  })
  resources.forEach((resource) => {
    counts.set(resource, 0)
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1))
  })
  room.update(0.05, { unlocked: true })
  assert.ok(room.doorPivot.rotation.y < 0)
  assert.equal(room.door.material.color.getHex(), 0x3bde95)
  const lastY = room.objects[0].position.y
  room.dispose()
  room.dispose()
  room.update(1, { unlocked: false })
  assert.equal(room.objects[0].position.y, lastY, 'disposed scenes stop animating')
  counts.forEach((count) => assert.equal(count, 1))
})

test('existing wall/pedestal/door collisions and accepted answers remain intact', () => {
  assert.ok(collide(0, 7, false, 5.5).z < 6)
  assert.equal(collide(0, 7, true, 5.5).z, 7)
  assert.ok(collide(2, 7, true, 5.5).z < 6)
  const position = collide(-3.1, -3.4)
  assert.ok(Math.hypot(position.x + 3.2, position.z + 3.4) >= 0.729)
  for (const memory of SAMPLE_MEMORIES) {
    for (const answer of memory.answers) assert.ok(isCorrectAnswer(memory, '  ' + answer.toUpperCase() + '  '))
    assert.equal(isCorrectAnswer(memory, ''), false)
    assert.equal(isCorrectAnswer(memory, 'incorrect'), false)
  }
})
