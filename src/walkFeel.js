// Presentation only: physical position, collisions and interaction distances stay untouched.
export function createWalkFeel() {
  let phase = 0, amplitude = 0, stride = 0
  return {
    update(dt, distance, { grounded = true, active = true, reducedMotion = false } = {}) {
      dt = Math.min(0.05, Math.max(0, dt))
      const walking = active && grounded && distance > 0.0001 && distance < 0.8 && dt > 0
      let step = false
      if (walking) {
        phase = (phase + distance * Math.PI * 2 / 1.8) % (Math.PI * 2)
        stride += distance
        if (stride >= 1.8) { stride %= 1.8; step = true }
      } else stride = 0
      const target = walking ? Math.min(0.025, 0.012 + distance / dt * 0.002) : 0
      amplitude += (target - amplitude) * (1 - Math.exp(-dt * 18))
      if (!grounded || !active || reducedMotion) return { offsetY: 0, step }
      return { offsetY: amplitude < 0.00005 ? 0 : Math.sin(phase * 2) * amplitude, step }
    },
  }
}
