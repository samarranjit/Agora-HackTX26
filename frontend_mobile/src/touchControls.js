import * as THREE from 'three'

export const EYE_HEIGHT = 1.6
const PITCH_LIMIT = Math.PI / 2 - 0.08
// Holding the stick at its rim sprints, like Shift on the web version.
export const SPRINT_THRESHOLD = 0.93

// Touch counterpart of the web playerControls: owns input state, never progression.
// The left thumb feeds an analog stick; the right thumb rotates the camera.
export function createTouchControls({ camera, motion, onRespawn }) {
  const stick = { x: 0, z: 0 }
  let jumpQueued = false
  let active = false
  let disposed = false

  const clear = () => { stick.x = 0; stick.z = 0; jumpQueued = false }
  const setActive = (next) => {
    if (disposed) return
    active = next
    clear()
  }
  return {
    get active() { return active },
    get sprinting() { return active && Math.hypot(stick.x, stick.z) >= SPRINT_THRESHOLD },
    setActive,
    suspend(callback) { setActive(false); callback() },
    // x: right is positive. z: forward is positive. Magnitude 0..1.
    setStick(x, z) {
      if (!active) return
      const length = Math.hypot(x, z)
      const scale = length > 1 ? 1 / length : 1
      stick.x = x * scale; stick.z = z * scale
    },
    releaseStick() { stick.x = 0; stick.z = 0 },
    look(yawRadians, pitchRadians) {
      if (!active) return
      camera.rotation.y -= yawRadians
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - pitchRadians, -PITCH_LIMIT, PITCH_LIMIT)
    },
    jump() { if (active) jumpQueued = true },
    update(dt) {
      if (disposed || !active) return
      const sprint = Math.hypot(stick.x, stick.z) >= SPRINT_THRESHOLD
      const respawned = motion.update(dt, { x: stick.x, z: stick.z, jump: jumpQueued, sprint }, camera.rotation.y)
      jumpQueued = false
      camera.position.set(motion.position.x, motion.position.y + EYE_HEIGHT, motion.position.z)
      if (respawned) {
        clear()
        camera.rotation.set(0.06, 0, 0)
        onRespawn?.()
      }
    },
    dispose() { setActive(false); disposed = true },
  }
}
