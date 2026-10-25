// Geometry and collision share these footprints. The moat has no walkable surface.
export const COURTYARD_SPAWN = Object.freeze({ x: 0, y: 0, z: 19, yaw: 0 })
export const PLAYER_RADIUS = 0.35
export const GROUND = Object.freeze({ minX: -20, maxX: 20, minZ: -10, maxZ: 24 })
export const WALLS = [
  { x: -19.7, z: 7, w: 0.6, d: 34, h: 1.35 },
  // The eastern overlook has a deliberate opening to the water.
  { x: 19.7, z: -0.5, w: 0.6, d: 19, h: 1.35 },
  { x: 19.7, z: 19.5, w: 0.6, d: 9, h: 1.35 },
  { x: 0, z: 23.7, w: 40, d: 0.6, h: 1.35 },
  { x: -12, z: -9.7, w: 16, d: 0.6, h: 1.35 },
  { x: 12, z: -9.7, w: 16, d: 0.6, h: 1.35 },
]
export const GARDEN_TOWERS = [{ x: -18, z: -7 }, { x: 18, z: -7 }]
export const BENCHES = [{ x: -9, z: 13 }, { x: 9, z: 13 }]
export const TREES = [{ x: -14, z: 17 }, { x: 14, z: 17 }, { x: -14, z: 3 }, { x: 14, z: 3 }, { x: -12, z: -5 }, { x: 12, z: -5 }]
const box = ({ x, z, w, d }) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })
export const COLLIDERS = [
  ...WALLS.map(box),
  ...GARDEN_TOWERS.map(({ x, z }) => box({ x, z, w: 3.2, d: 3.2 })),
  ...BENCHES.map(({ x, z }) => box({ x, z, w: 3.1, d: 1.05 })),
  ...TREES.map(({ x, z }) => box({ x, z, w: 1.1, d: 1.1 })),
  box({ x: 0, z: 4, w: 5.5, d: 5.5 }), // Fountain and its raised basin.
  box({ x: 0, z: -31, w: 48, d: 26 }), // Entire inaccessible palace footprint.
]

export function isSolid(x, z) {
  return COLLIDERS.some((box) => x > box.minX - PLAYER_RADIUS && x < box.maxX + PLAYER_RADIUS && z > box.minZ - PLAYER_RADIUS && z < box.maxZ + PLAYER_RADIUS)
}

export function moveInCourtyard(from, target) {
  // Short substeps and independent axes prevent tunneling and allow wall sliding.
  const steps = Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / 0.1))
  const dx = (target.x - from.x) / steps
  const dz = (target.z - from.z) / steps
  let { x, z } = from
  for (let step = 0; step < steps; step++) {
    if (!isSolid(x + dx, z)) x += dx
    if (!isSolid(x, z + dz)) z += dz
  }
  return { x, z }
}

export function courtyardGroundHeight(x, z) {
  return x >= GROUND.minX && x <= GROUND.maxX && z >= GROUND.minZ && z <= GROUND.maxZ ? 0 : null
}

export function needsCourtyardRespawn(position) {
  return position.y < -2 || Math.abs(position.x) > 32 || position.z < -18 || position.z > 32
}

export const COURTYARD_WORLD = {
  spawn: COURTYARD_SPAWN,
  move: moveInCourtyard,
  groundHeight: courtyardGroundHeight,
  needsRespawn: needsCourtyardRespawn,
}
