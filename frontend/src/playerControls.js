import * as THREE from 'three'

export const EYE_HEIGHT = 1.6
const MOVE_SPEED = 4.2
const LOOK_SPEED = 0.0022
const PITCH_LIMIT = Math.PI / 2 - 0.08

// Owns player input and pointer lock, without depending on React or a particular scene.
export function createPlayerControls({ canvas, camera, constrainMovement, motion, onRespawn, onInteract, onPause, onLockChange }) {
  const doc = canvas.ownerDocument
  const win = doc.defaultView
  const keys = { w: false, a: false, s: false, d: false, shift: false }
  let jumpQueued = false
  let active = false
  let locked = doc.pointerLockElement === canvas
  let dragging = false
  let capturedPointerId = null
  let disposed = false
  let lockRequest = null

  const clearKeys = () => {
    Object.keys(keys).forEach((key) => { keys[key] = false })
    jumpQueued = false
  }
  const releaseDrag = () => {
    dragging = false
    if (capturedPointerId !== null && canvas.hasPointerCapture(capturedPointerId)) {
      canvas.releasePointerCapture(capturedPointerId)
    }
    capturedPointerId = null
  }
  const setActive = (nextActive, { requestLock = true } = {}) => {
    if (disposed) return
    const wasActive = active
    active = nextActive
    clearKeys()
    releaseDrag()
    if (active) {
      canvas.focus()
      if (!wasActive && requestLock) lockMouse()
    }
    else if (doc.pointerLockElement === canvas) doc.exitPointerLock()
  }
  const suspend = (callback) => {
    setActive(false)
    callback()
  }
  const onKeyDown = (event) => {
    if (!active || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName) || event.target.isContentEditable) return
    const key = event.key.toLowerCase()
    if (key in keys) { keys[key] = true; event.preventDefault() }
    if (motion && (event.code === 'Space' || key === ' ')) {
      event.preventDefault()
      if (!event.repeat) jumpQueued = true
    }
    if (key === 'e' && !event.repeat) onInteract()
    if (key === 'escape') suspend(onPause)
  }
  const onKeyUp = (event) => {
    const key = event.key.toLowerCase()
    if (key in keys) keys[key] = false
  }
  const onBlur = () => {
    clearKeys()
    if (active) suspend(onPause)
  }
  const onVisibility = () => { if (doc.hidden) onBlur() }
  const onPointerMove = (event) => {
    if (!active || (!locked && !dragging)) return
    camera.rotation.y -= event.movementX * LOOK_SPEED
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - event.movementY * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT)
  }
  const onPointerDown = (event) => {
    if (!active || event.button !== 0) return
    canvas.focus()
    if (!locked) {
      dragging = true
      canvas.setPointerCapture(event.pointerId)
      capturedPointerId = event.pointerId
      lockMouse() // One recovery attempt for this click; dragging remains the fallback.
    }
  }
  const onPointerUp = () => releaseDrag()
  const onPointerLockChange = () => {
    const wasLocked = locked
    locked = doc.pointerLockElement === canvas
    lockRequest = null
    if (locked && (!active || disposed)) { doc.exitPointerLock(); return }
    if (locked) releaseDrag()
    onLockChange(locked)
    if (!locked) {
      releaseDrag()
      clearKeys()
      if (wasLocked && active) suspend(onPause)
    }
  }
  const onPointerLockError = () => {
    lockRequest = null
    if (!disposed && doc.pointerLockElement !== canvas) { locked = false; onLockChange(false) }
  }
  const listeners = [
    [win, 'keydown', onKeyDown],
    [win, 'keyup', onKeyUp],
    [win, 'pointermove', onPointerMove],
    [win, 'blur', onBlur],
    [doc, 'visibilitychange', onVisibility],
    [doc, 'pointerlockchange', onPointerLockChange],
    [doc, 'pointerlockerror', onPointerLockError],
    [canvas, 'pointerdown', onPointerDown],
    [canvas, 'pointerup', onPointerUp],
    [canvas, 'pointercancel', onPointerUp],
  ]
  listeners.forEach(([target, type, handler]) => target.addEventListener(type, handler))

  const lockMouse = () => {
    if (disposed || !active || doc.pointerLockElement === canvas || lockRequest) return
    canvas.focus()
    const attempt = {}
    lockRequest = attempt
    const failed = () => {
      if (disposed || lockRequest !== attempt) return
      onPointerLockError()
    }
    try {
      if (!canvas.requestPointerLock) { failed(); return }
      const request = canvas.requestPointerLock()
      request?.then(() => {
        if (lockRequest === attempt) lockRequest = null
        // A request may finish after a modal opened or this canvas unmounted.
        if ((disposed || !active) && doc.pointerLockElement === canvas) doc.exitPointerLock()
      }).catch(failed)
    } catch { failed() }
  }
  const update = (dt, viewState) => {
    if (disposed || !active) return
    const inputX = Number(keys.d) - Number(keys.a)
    const inputZ = Number(keys.w) - Number(keys.s)
    if (motion) {
      const respawned = motion.update(dt, { x: inputX, z: inputZ, jump: jumpQueued, sprint: keys.shift }, camera.rotation.y)
      jumpQueued = false
      camera.position.set(motion.position.x, motion.position.y + EYE_HEIGHT, motion.position.z)
      if (respawned) {
        clearKeys()
        camera.rotation.set(0.06, 0, 0)
        onRespawn?.()
      }
      return
    }
    if (!inputX && !inputZ) return
    const length = Math.hypot(inputX, inputZ)
    const nx = inputX / length
    const nz = inputZ / length
    const yaw = camera.rotation.y
    const dx = (nx * Math.cos(yaw) - nz * Math.sin(yaw)) * MOVE_SPEED * dt
    const dz = (-nx * Math.sin(yaw) - nz * Math.cos(yaw)) * MOVE_SPEED * dt
    const next = constrainMovement(camera.position.x + dx, camera.position.z + dz, viewState.unlocked, camera.position.z)
    camera.position.set(next.x, EYE_HEIGHT, next.z)
  }
  const dispose = () => {
    if (disposed) return
    setActive(false)
    disposed = true
    listeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler))
  }

  return { get active() { return active }, setActive, suspend, lockMouse, update, dispose }
}
