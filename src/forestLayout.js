import { FOREST_COLLECTIBLES } from './game/forestContent.js'

export const FOREST_BOUNDS = Object.freeze({ minX: -25, maxX: 25, minZ: -35, maxZ: 44 })
export const FOREST_PATH = Object.freeze([{ x: 0, z: 40 }, { x: -4, z: 30 }, { x: 4, z: 20 }, { x: -3, z: 8 }, { x: 4, z: -4 }, { x: 0, z: -20 }, { x: 0, z: -24 }])
export function forestHeight(x, z) {
  const t = Math.max(0, Math.min(1, (40 - z) / 62))
  return 8 * t * t * (3 - 2 * t)
}
export const FOREST_SPAWN = Object.freeze({ x: 0, y: forestHeight(0, 40), z: 40, yaw: 0 })
export const CASTLE_APPROACH = Object.freeze({ x: 0, y: 8, z: -31.4, yaw: Math.PI })
export function pathX(z) {
  for (let i = 1; i < FOREST_PATH.length; i++) {
    const a = FOREST_PATH[i - 1], b = FOREST_PATH[i]
    if (z <= a.z && z >= b.z) { const t = (a.z - z) / (a.z - b.z); return a.x + (b.x - a.x) * t }
  }
  return 0
}
const trees = []
for (let row = 0; row < 14; row++) for (let col = 0; col < 11; col++) {
  const x = -23 + col * 4.5 + Math.sin(row * 7 + col * 3) * 1.2
  const z = 37 - row * 4.1 + Math.cos(col * 5 + row) * 1.1
  const onBranch = FOREST_COLLECTIBLES.some((p) => Math.abs(z - p.z) < 1.5 && x > Math.min(p.x, pathX(p.z)) - 1 && x < Math.max(p.x, pathX(p.z)) + 1)
  if (onBranch || Math.abs(x - pathX(z)) < 4 || FOREST_COLLECTIBLES.some((p) => Math.hypot(x - p.x, z - p.z) < 3.3) || Math.hypot(x + 15, z - 29) < 4) continue
  trees.push(Object.freeze({ x, z, height: 5.5 + (row + col) % 4, birch: (row + col) % 5 === 0 }))
}
export const FOREST_TREES = Object.freeze(trees)
export const FOREST_ROCKS = Object.freeze([{ x: -17, z: 28 }, { x: -15, z: 32 }, { x: 16, z: 0 }, { x: -17, z: 11 }, { x: 18, z: 26 }, { x: -19, z: -7 }])

export function createForestWorld(spawnId = 'start') {
  let bridgeOpen = false
  let checkpoint = spawnId === 'castle-approach' ? CASTLE_APPROACH : FOREST_SPAWN
  const solid = (x, z) => {
    if (x < -24.5 || x > 24.5 || z > 43.5 || z < -34) return true
    // This barrier is independent of jumping height: the ravine has one entrance.
    if (z < -21.5 && (!bridgeOpen || Math.abs(x) > 2.45)) return true
    return FOREST_TREES.some((p) => Math.hypot(x - p.x, z - p.z) < 0.76) || FOREST_ROCKS.some((p) => Math.hypot(x - p.x, z - p.z) < 1.05)
  }
  return {
    get spawn() { return checkpoint },
    setCheckpoint(spot) { if (spot && !solid(spot.x, spot.z)) checkpoint = { x: spot.x, y: forestHeight(spot.x, spot.z), z: spot.z } },
    setBridgeOpen(value) { bridgeOpen = value },
    groundHeight: forestHeight,
    needsRespawn: (p) => !Number.isFinite(p.y) || p.y < -5 || Math.abs(p.x) > 32 || p.z > 50,
    move(from, target) {
      const steps = Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / 0.1))
      const dx = (target.x - from.x) / steps, dz = (target.z - from.z) / steps
      let { x, z } = from
      for (let i = 0; i < steps; i++) { if (!solid(x + dx, z)) x += dx; if (!solid(x, z + dz)) z += dz }
      return { x, z }
    },
  }
}

export function nearbyForestTarget(position, run) {
  let nearest = 2.6, id = null
  for (const item of FOREST_COLLECTIBLES) {
    if (run.collectedIds.includes(item.id)) continue
    const distance = Math.hypot(position.x - item.x, position.z - item.z)
    if (distance < nearest && Math.abs(position.y - forestHeight(item.x, item.z) - 1.6) < 2.4) { nearest = distance; id = item.id }
  }
  return id || (Math.abs(position.x) < 4 && position.z < -17 ? 'forest-gate' : null)
}

export function createHallWorld() {
  return {
    spawn: { x: 0, y: 0, z: 9 }, groundHeight: () => 0, needsRespawn: (p) => p.y < -5,
    move(from, target) {
      const blocked = (x, z) => Math.abs(x) > 9.4 || z < -14.5 || z > 11.5 || [-7.5, 7.5].some((cx) => [-9, -2, 5].some((cz) => Math.hypot(x - cx, z - cz) < 1)) || Math.hypot(x, z + 8) < 2.6
      const steps = Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / 0.1))
      const dx = (target.x - from.x) / steps, dz = (target.z - from.z) / steps
      let { x, z } = from
      for (let i = 0; i < steps; i++) { if (!blocked(x + dx, z)) x += dx; if (!blocked(x, z + dz)) z += dz }
      return { x, z }
    },
  }
}
