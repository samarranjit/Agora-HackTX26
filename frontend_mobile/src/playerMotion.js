export const MAX_STAMINA = 100
export const WALK_SPEED = 4.2
export const SPRINT_SPEED = 7.2
export const JUMP_SPEED = 6.5
export const GRAVITY = 18
const STAMINA_DRAIN = 26
const STAMINA_RECOVERY = 22

// Local physical state only. Respawning never receives or mutates run progress.
export function createPlayerMotion(world) {
  const position = { x: world.spawn.x, y: world.spawn.y, z: world.spawn.z }
  let verticalSpeed = 0
  let grounded = true
  let stamina = MAX_STAMINA
  let exhausted = false
  let recoveryDelay = 0
  let sprinting = false
  let respawns = 0
  const respawn = () => {
    Object.assign(position, { x: world.spawn.x, y: world.spawn.y, z: world.spawn.z })
    verticalSpeed = 0
    grounded = true
    sprinting = false
    stamina = MAX_STAMINA
    exhausted = false
    recoveryDelay = 0
    respawns++
  }
  const update = (dt, input, yaw) => {
    dt = Math.min(Math.max(dt, 0), 0.05)
    const length = Math.hypot(input.x, input.z)
    if (exhausted && stamina >= 25 && !input.sprint) exhausted = false
    sprinting = length > 0 && input.sprint && !exhausted && stamina > 0
    if (sprinting) {
      stamina = Math.max(0, stamina - STAMINA_DRAIN * dt)
      recoveryDelay = 0.6
      if (stamina === 0) exhausted = true
    } else {
      recoveryDelay = Math.max(0, recoveryDelay - dt)
      if (recoveryDelay === 0) stamina = Math.min(MAX_STAMINA, stamina + STAMINA_RECOVERY * dt)
    }
    // Analog sticks report a magnitude below 1; digital input is clamped to full speed.
    const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * Math.min(1, length)
    if (length) {
      const nx = input.x / length
      const nz = input.z / length
      const next = world.move(position, {
        x: position.x + (nx * Math.cos(yaw) - nz * Math.sin(yaw)) * speed * dt,
        z: position.z + (-nx * Math.sin(yaw) - nz * Math.cos(yaw)) * speed * dt,
      })
      position.x = next.x
      position.z = next.z
    }
    const floor = world.groundHeight(position.x, position.z)
    // Supported slopes follow the same height function as their rendered terrain.
    if (grounded && floor !== null && Math.abs(position.y - floor) < 0.45) position.y = floor
    if (floor === null || position.y > floor + 0.001) grounded = false
    if (input.jump && grounded) { verticalSpeed = JUMP_SPEED; grounded = false }
    if (!grounded) {
      verticalSpeed -= GRAVITY * dt
      position.y += verticalSpeed * dt
      if (floor !== null && position.y <= floor && verticalSpeed <= 0) {
        position.y = floor
        verticalSpeed = 0
        grounded = true
      }
    }
    if (world.needsRespawn(position)) { respawn(); return true }
    return false
  }
  return {
    position, update, respawn,
    get grounded() { return grounded },
    get stamina() { return stamina },
    get sprinting() { return sprinting },
    get exhausted() { return exhausted },
    get respawns() { return respawns },
  }
}
