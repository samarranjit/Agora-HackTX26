import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createPlayerControls, EYE_HEIGHT } from '../src/playerControls.js'
import { createRoomScene, collide } from '../src/roomScene.js'

const SCENE_ITEMS = ['power-bean', 'royal-vault', 'protein-chef'].map((shape, i) => ({id: 'visual-' + i, shape, color: 0x66aacc}))

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
  let requests = 0
  const requestPointerLock = canvas.requestPointerLock
  canvas.requestPointerLock = () => { requests++; return requestPointerLock() }
  const lockStates = []
  const mount = () => createPlayerControls({
    canvas, camera,
    constrainMovement: (x, z) => ({ x, z }),
    onInteract: () => interactions++,
    onPause: () => pauses++,
    onLockChange: (locked) => lockStates.push(locked),
  })
  return { win, doc, canvas, camera, captures, lockStates, mount, get pauses() { return pauses }, get interactions() { return interactions }, get requests() { return requests } }
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
  h.canvas.requestPointerLock = () => { throw Error('Pointer lock unavailable') }
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
  h.canvas.requestPointerLock = () => Promise.reject(new Error('denied'))
  controls.setActive(true)
  controls.lockMouse()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(controls.active, true)
  h.canvas.emit('pointerdown', { button: 0, pointerId: 2 })
  const yaw = h.camera.rotation.y
  h.win.emit('pointermove', { movementX: 100, movementY: 0 })
  assert.ok(h.camera.rotation.y < yaw, 'drag fallback still works')
  controls.dispose()
})

test('start and intentional resume request lock once, and suspending for UI releases it without moving the camera', () => {
  const h = createControllerHarness(), controls = h.mount()
  assert.equal(h.requests, 0)
  controls.setActive(true)
  assert.equal(h.doc.pointerLockElement, h.canvas); assert.equal(h.requests, 1)
  controls.lockMouse(); controls.setActive(true)
  assert.equal(h.requests, 1, 'an already locked canvas is not requested again')
  h.win.emit('pointermove', { movementX: 37, movementY: -12 })
  const position = h.camera.position.clone(), rotation = h.camera.rotation.clone()
  h.win.emit('keydown', { key: 'w' })
  controls.suspend(() => assert.equal(h.doc.pointerLockElement, null, 'release precedes opening the menu/question'))
  assert.equal(h.pauses, 0, 'intentional release must not open a second pause overlay')
  controls.setActive(true)
  assert.equal(h.requests, 2); assert.equal(h.doc.pointerLockElement, h.canvas)
  controls.update(1, {})
  assert.deepEqual(h.camera.position, position); assert.ok(h.camera.rotation.equals(rotation))
  h.doc.exitPointerLock()
  assert.equal(h.pauses, 1); assert.equal(h.requests, 2, 'browser Escape is not fought with a retry loop')
  controls.setActive(true); assert.equal(h.requests, 3)
  controls.dispose()
})

test('pending requests are deduplicated, late modal acquisition releases, and error recovery waits for a click', async () => {
  const h = createControllerHarness()
  let finish, requests = 0
  h.canvas.requestPointerLock = () => { requests++; return new Promise((resolve) => { finish = resolve }) }
  const controls = h.mount()
  controls.setActive(true); controls.lockMouse(); controls.lockMouse()
  assert.equal(requests, 1)
  controls.setActive(false)
  h.doc.pointerLockElement = h.canvas; h.doc.emit('pointerlockchange'); finish()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.doc.pointerLockElement, null); assert.equal(h.pauses, 0)
  h.canvas.requestPointerLock = () => { requests++ } // Legacy event-based API.
  controls.setActive(true); controls.lockMouse(); assert.equal(requests, 2)
  h.doc.emit('pointerlockerror')
  assert.equal(controls.active, true); assert.equal(requests, 2)
  h.canvas.emit('pointerdown', { button: 0, pointerId: 4 })
  assert.equal(requests, 3)
  controls.dispose()
})

test('a new canvas can defer its initial lock through a development remount without locking the discarded canvas', async () => {
  const h = createControllerHarness()
  const discarded = h.mount()
  discarded.setActive(true, { requestLock: false })
  queueMicrotask(() => discarded.lockMouse())
  discarded.dispose()
  const current = h.mount()
  current.setActive(true, { requestLock: false })
  queueMicrotask(() => current.lockMouse())
  assert.equal(h.requests, 0)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.requests, 1); assert.equal(h.doc.pointerLockElement, h.canvas)
  current.dispose()
  assert.equal(h.win.listenerCount() + h.doc.listenerCount() + h.canvas.listenerCount(), 0)
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
  const room = createRoomScene(SCENE_ITEMS)
  assert.deepEqual(room.objects.map((object) => object.userData.memoryId), SCENE_ITEMS.map((memory) => memory.id))
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

test('existing wall, pedestal and door collisions remain intact', () => {
  assert.ok(collide(0, 7, false, 5.5).z < 6)
  assert.equal(collide(0, 7, true, 5.5).z, 7)
  assert.ok(collide(2, 7, true, 5.5).z < 6)
  const position = collide(-3.1, -3.4)
  assert.ok(Math.hypot(position.x + 3.2, position.z + 3.4) >= 0.729)
})
