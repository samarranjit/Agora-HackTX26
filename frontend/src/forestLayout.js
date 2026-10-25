import { FOREST_COLLECTIBLES } from './game/forestContent.js'

export const FOREST_BOUNDS = Object.freeze({ minX: -25, maxX: 25, minZ: -35, maxZ: 44 })
export const FOREST_PATH = Object.freeze([{ x: 0, z: 40 }, { x: -4, z: 30 }, { x: 4, z: 20 }, { x: -3, z: 8 }, { x: 4, z: -4 }, { x: 0, z: -20 }, { x: 0, z: -24 }])
export function forestHeight(x, z, layout) {
  const t = Math.max(0, Math.min(1, (40 - z) / 62))
  const edge = Math.min(1, Math.abs(x - pathX(z)) / 5) * Math.max(0, Math.min(1, (36 - z) / 8, (z + 21) / 5))
  return 8 * t * t * (3 - 2 * t) + (layout ? Math.sin(x * 0.2 + layout.terrainPhase) * Math.sin(z * 0.13 + layout.terrainPhase) * 0.3 * edge : 0)
}
export const FOREST_SPAWN = Object.freeze({ x: 0, y: forestHeight(0, 40), z: 40, yaw: 0 })
export const FOREST_ENCOUNTER_RADIUS = 7
export const FOREST_QUESTION_RADIUS = FOREST_ENCOUNTER_RADIUS / 2
export const FOREST_ENCOUNTER_ELEVATION = 3.2
export function forestEncounterRange(position, spot, layout, radius = FOREST_ENCOUNTER_RADIUS) {
  if (!position || !spot) return false
  const ground = forestHeight(spot.x, spot.z, layout)
  const feet = Number.isFinite(position.y) ? position.y : ground
  // The movement loop stores foot height; speech/tests use eye height.
  const vertical = Math.min(Math.abs(feet - ground), Math.abs(feet - ground - 1.6))
  return Math.hypot(position.x - spot.x, position.z - spot.z) < radius && vertical < FOREST_ENCOUNTER_ELEVATION
}
export const CASTLE_APPROACH = Object.freeze({ x: 0, y: 8, z: -31.4, yaw: Math.PI })
export const HALL_FLOOR = CASTLE_APPROACH.y
// Two thirds lower than standing a full floor-height above the paving.
export const CASTLE_EYE_HEIGHT = HALL_FLOOR / 3
export const FOREST_GUARDIAN_BODY = Object.freeze({
  goblin: Object.freeze({ radius: 1.2 }),
  wolf: Object.freeze({ radius: 1.2, length: 2.2 }),
})
export function guardianBlocks(x, z, body) {
  if (!body) return false
  const rx = body.radius, rz = body.length || body.radius
  const dx = (x - body.x) / rx, dz = (z - body.z) / rz
  return dx * dx + dz * dz < 1
}
export function pathX(z) {
  for (let i = 1; i < FOREST_PATH.length; i++) {
    const a = FOREST_PATH[i - 1], b = FOREST_PATH[i]
    if (z <= a.z && z >= b.z) { const t = (a.z - z) / (a.z - b.z); return a.x + (b.x - a.x) * t }
  }
  return 0
}
export function generateForestLayout(seed) {
  let state = 2166136261
  for (const c of String(seed)) state = Math.imul(state ^ c.charCodeAt(0), 16777619)
  const random = () => { state += 0x6d2b79f5; let n = Math.imul(state ^ state >>> 15, 1 | state); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296 }
  const range = (a, b) => a + random() * (b - a)
  const collectibles = [], bands = [32, 22, 12, 2, -13]
  for (const [i, item] of FOREST_COLLECTIBLES.entries()) {
    let spot
    for (let trial = 0; trial < 40; trial++) {
      const x = range(10.5, 17) * (random() < 0.5 ? -1 : 1), z = bands[i] + range(-2, 2)
      if (collectibles.every((other) => Math.hypot(x - other.x, z - other.z) >= 8)) { spot = { id: item.id, x, z }; break }
    }
    collectibles.push(spot || { id: item.id, x: i % 2 ? 14 : -14, z: bands[i] })
  }
  const encounters = [{ id: 'goblin', z: range(6, 9) }, { id: 'wolf', z: range(-13, -10) }].map((e) => ({ ...e, x: pathX(e.z) + (random() < 0.5 ? -1.5 : 1.5) }))
  const reserved = (x, z, padding = 0) => Math.abs(x - pathX(z)) < 3.7 + padding || Math.hypot(x, z - 40) < 5 + padding ||
    collectibles.some((p) => Math.hypot(x - p.x, z - p.z) < 4.2 + padding || Math.abs(z - p.z) < 1.7 + padding && x > Math.min(p.x, pathX(p.z)) - 1 - padding && x < Math.max(p.x, pathX(p.z)) + 1 + padding) ||
    encounters.some((p) => Math.hypot(x - p.x, z - p.z) < 4 + padding)
  const trees = [], rocks = [], shrubs = []
  for (let row = 0; row < 14; row++) for (let col = 0; col < 11; col++) {
    const x = -23 + col * 4.5 + range(-0.8, 0.8), z = 37 - row * 4.1 + range(-0.7, 0.7)
    if (reserved(x, z) || trees.some((p) => Math.hypot(x - p.x, z - p.z) < 4)) continue
    trees.push({ x, z, height: range(5.5, 10), birch: random() < 0.22 })
  }
  for (let trial = 0; trial < 350 && rocks.length < 10; trial++) {
    const x = range(-23, 23), z = range(-17, 36)
    if (reserved(x, z, 0.4) || trees.some((p) => Math.hypot(x - p.x, z - p.z) < 2) || rocks.some((p) => Math.hypot(x - p.x, z - p.z) < 2.5)) continue
    rocks.push({ x, z })
  }
  for (let trial = 0; trial < 500 && shrubs.length < 70; trial++) {
    const x = range(-23, 23), z = range(-17, 36)
    if (reserved(x, z, -0.5) || trees.some((p) => Math.hypot(x - p.x, z - p.z) < 1.3) || rocks.some((p) => Math.hypot(x - p.x, z - p.z) < 1.8) || shrubs.some((p) => Math.hypot(x - p.x, z - p.z) < 1.2)) continue
    shrubs.push({ x, z, size: range(0.4, 0.65) })
  }
  const freeze = (values) => Object.freeze(values.map((p) => Object.freeze(p)))
  return Object.freeze({ seed: String(seed), terrainPhase: range(0, Math.PI * 2), collectibles: freeze(collectibles), encounters: freeze(encounters), trees: freeze(trees), rocks: freeze(rocks), shrubs: freeze(shrubs) })
}
export const DEFAULT_FOREST_LAYOUT = generateForestLayout('storybook-reference')

export function createForestWorld(spawnId = 'start', layout = DEFAULT_FOREST_LAYOUT) {
  let bridgeOpen = false
  let checkpoint = spawnId === 'castle-approach' ? CASTLE_APPROACH : FOREST_SPAWN
  let guardians = []
  const solid = (x, z) => {
    if (x < -24.5 || x > 24.5 || z > 43.5 || z < -34) return true
    // This barrier is independent of jumping height: the ravine has one entrance.
    if (z < -21.5 && (!bridgeOpen || Math.abs(x) > 2.45)) return true
    return layout.trees.some((p) => Math.hypot(x - p.x, z - p.z) < 0.76) || layout.rocks.some((p) => Math.hypot(x - p.x, z - p.z) < 1.35) || layout.collectibles.some((p) => Math.hypot(x - p.x, z - p.z) < 1.08) || guardians.some((body) => guardianBlocks(x, z, body))
  }
  return {
    get spawn() { return checkpoint },
    setCheckpoint(spot) { if (spot && !solid(spot.x, spot.z)) checkpoint = { x: spot.x, y: forestHeight(spot.x, spot.z, layout), z: spot.z } },
    setBridgeOpen(value) { bridgeOpen = value },
    setGuardianBlockers(list) { guardians = Array.isArray(list) ? list : [] },
    groundHeight: (x, z) => forestHeight(x, z, layout),
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
  if (!position || !run?.layout) return null
  let nearest = 2.6, id = null
  for (const item of run.layout.collectibles) {
    if (run.collectedIds?.includes(item.id)) continue
    const distance = Math.hypot(position.x - item.x, position.z - item.z)
    if (distance < nearest && Math.abs(position.y - forestHeight(item.x, item.z, run.layout) - 1.6) < 2.4) { nearest = distance; id = item.id }
  }
  for (const enemy of run.layout.encounters) {
    if (!forestGuardianApproachable(run, enemy.id)) continue
    const distance = Math.hypot(position.x - enemy.x, position.z - enemy.z)
    if (distance < Math.max(nearest + 1, FOREST_QUESTION_RADIUS) && forestEncounterRange(position, enemy, run.layout, Math.max(nearest + 1, FOREST_QUESTION_RADIUS))) { nearest = distance; id = enemy.id }
  }
  return id || (Math.abs(position.x) < 4 && position.z < -17 ? 'forest-gate' : null)
}

export const forestEnemyEligible = (run, id) => run.availableTargetIds?.includes(id) === true
export function usesCharacterSpeech(id) {
  return id === 'goblin' || id === 'wolf' || id === 'dragon'
}
export function forestGuardianApproachable(run, id) {
  if (!id || run?.defeatedEnemyIds?.includes(id)) return false
  if (id === 'dragon' && run?.dragonDefeated) return false
  return run?.summonableEnemyIds?.includes(id) === true
}
export function forestGuardianAnchor(id, layout) {
  if (id === 'dragon') {
    return { x: HALL.dragon.x, y: hallGround(HALL.dragon.x, HALL.dragon.z) + 8.2, z: HALL.dragon.z + 3.2 }
  }
  const enemy = layout?.encounters?.find((spot) => spot.id === id)
  if (!enemy) return null
  return { x: enemy.x, y: forestHeight(enemy.x, enemy.z, layout) + (id === 'wolf' ? 3.55 : 2.55), z: enemy.z }
}
export function speechAnchorFromProjected(ndc) {
  if (!ndc || ndc.z < -1 || ndc.z > 1) return { x: 50, y: 18, visible: false }
  return {
    x: Math.round(Math.min(78, Math.max(22, (ndc.x * 0.5 + 0.5) * 100)) * 5) / 5,
    y: Math.round(Math.min(38, Math.max(10, (-ndc.y * 0.5 + 0.5) * 100 + 8)) * 5) / 5,
    visible: true,
  }
}
export function approachingForestEncounter(position, run) {
  if (run.stage !== 'forest') return null
  const enemy = forestEncounterAt(position, run)
  return enemy && forestGuardianApproachable(run, enemy) && !run.startedEnemyIds.includes(enemy) ? enemy : null
}
export function forestEncounterAt(position, run) {
  if (!position || !run?.layout?.encounters) return null
  return run.layout.encounters.find((enemy) => forestGuardianApproachable(run, enemy.id) && forestEncounterRange(position, enemy, run.layout, FOREST_QUESTION_RADIUS))?.id || null
}

export const HALL = Object.freeze({ halfWidth: 40, back: -76, front: 76, ceiling: 48, dragon: Object.freeze({ x: -4, z: -51, scale: 1.8, radius: 6.6, length: 10.4 }), princess: Object.freeze({ x: 0, z: -100 }), pillars: Object.freeze([-55, -30, -5, 20, 45]),
  galleries: Object.freeze([-1, 1].map((side) => Object.freeze({ side, x: side * 54, width: 28, front: 34, back: -26 }))), prison: Object.freeze({ halfWidth: 12, front: -76, back: -108, gateZ: -90 }) })
export function hallHeight(x, z) { return z < HALL.back && Math.abs(x) < HALL.prison.halfWidth ? 3 : Math.abs(x) < 17 ? Math.max(0, Math.min(3, (-z - 34) * 3 / 14)) : 0 }
export function hallGround(x, z) { return HALL_FLOOR + hallHeight(x, z) }
export const HALL_QUESTION_RADIUS = HALL.dragon.length + 2.6
export function hallEncounterAt(position, run) {
  if (!position || !forestGuardianApproachable(run, 'dragon')) return null
  return Math.hypot(position.x - HALL.dragon.x, position.z - HALL.dragon.z) < HALL_QUESTION_RADIUS ? 'dragon' : null
}
export function nearbyHallTarget(position, run, princessAt = HALL.princess) {
  if (hallEncounterAt(position, run)) return 'dragon'
  if (Math.hypot(position.x - princessAt.x, position.z - princessAt.z) < 3.4) return 'princess'
  return Math.abs(position.x) < 7 && position.z > 64 ? 'hall-exit' : null
}

export function createHallWorld() {
  let dragonDefeated = false
  let dragonGone = false
  let princessAt = { x: HALL.princess.x, z: HALL.princess.z }
  return {
    setDragonDefeated(value) { dragonDefeated = value === true },
    setDragonGone(value) { dragonGone = value === true },
    setPrincessAt(spot) { if (spot) princessAt = { x: spot.x, z: spot.z } },
    get princessAt() { return princessAt },
    spawn: { x: 0, y: hallGround(0, 66), z: 66 },
    groundHeight: hallGround,
    needsRespawn: (p) => p.y < HALL_FLOOR - 5,
    move(from, target) {
      const blocked = (x, z) => {
        const central = Math.abs(x) <= HALL.halfWidth - 1 && z >= HALL.back + 1 && z <= HALL.front - 1
        const wing = Math.abs(x) >= 38.8 && Math.abs(x) <= 67 && z > -25 && z < 33
        const prison = Math.abs(x) < 11 && z > -107 && z < -74.8
        if (!central && !wing && !prison) return true
        if (Math.abs(Math.abs(x) - 40) < 1 && (z < 5 || z > 15)) return true
        if (Math.abs(z + 76) < 1 && Math.abs(x) > 9) return true
        if (!dragonDefeated && Math.abs(z - HALL.prison.gateZ) < 0.9) return true
        return [-25, 25].some((cx) => HALL.pillars.some((cz) => Math.hypot(x - cx, z - cz) < 2.66)) || (!dragonGone && guardianBlocks(x, z, { x: HALL.dragon.x, z: HALL.dragon.z, radius: HALL.dragon.radius, length: HALL.dragon.length })) || Math.hypot(x - princessAt.x, z - princessAt.z) < 1.9
      }
      const steps = Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / 0.1))
      const dx = (target.x - from.x) / steps, dz = (target.z - from.z) / steps
      let { x, z } = from
      for (let i = 0; i < steps; i++) { if (!blocked(x + dx, z) && Math.abs(hallHeight(x + dx, z) - hallHeight(x, z)) < 0.45) x += dx; if (!blocked(x, z + dz) && Math.abs(hallHeight(x, z + dz) - hallHeight(x, z)) < 0.45) z += dz }
      return { x, z }
    },
  }
}
