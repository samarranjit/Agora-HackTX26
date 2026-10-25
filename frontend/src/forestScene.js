import * as THREE from 'three'
import { createSceneBuilder } from './scenePrimitives.js'
import { buildPalace } from './palaceArchitecture.js'
import { disposeScene } from './sceneResources.js'
import { createFairytaleItem, createStoryDragon, createBigBadWolf, createStoryPrincess } from './storybookProps.js'
import { FOREST_COLLECTIBLES } from './game/forestContent.js'
import { createForestWorld, createHallWorld, FOREST_PATH, DEFAULT_FOREST_LAYOUT, forestHeight, pathX, HALL, hallHeight } from './forestLayout.js'
import { createMagicEffects } from './magicEffects.js'
import { createForestGoblin } from './forestGoblin.js'

function palette() {
  const colors = { stone: 0xe3c9ab, trim: 0xf8dfb2, shadowStone: 0xb59994, foundation: 0x756d87, roof: 0x394777, royal: 0x702c70, gold: 0xe4b662, iron: 0x393c50, window: 0xffce83, gateDark: 0x262438, grass: 0x59795f, lawn: 0x406554, path: 0xccb68e, wood: 0x634b44, woodLight: 0x987357, leaves: 0x365d56, leavesLight: 0x67866a, leavesGold: 0x8a956d, birch: 0xd9cbb2, flower: 0xbb8bb7, water: 0x6ca9ae, ripple: 0xb7d6cb, distant: 0x80989a }
  return Object.fromEntries(Object.entries(colors).map(([name, color]) => [name, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, side: name === 'royal' ? THREE.DoubleSide : THREE.FrontSide, ...(name === 'window' ? { emissive: color, emissiveIntensity: 0.65 } : {}) })]))
}
function daylight(scene) {
  scene.add(new THREE.HemisphereLight(0xe2e2f4, 0x65765e, 2))
  const sun = new THREE.DirectionalLight(0xffdaac, 2.7)
  sun.position.set(-25, 55, 25); sun.target.position.set(0, 5, -8); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 65, bottom: -65, near: 1, far: 160 })
  sun.shadow.normalBias = 0.05; sun.shadow.bias = -0.0003
  scene.add(sun, sun.target)
}
function terrain(scene, material, layout) {
  const geometry = new THREE.PlaneGeometry(56, 68, 56, 68)
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, 11)
  const positions = geometry.getAttribute('position')
  const colors = []
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i)
    positions.setY(i, forestHeight(x, z, layout))
    const color = new THREE.Color(0x6b8964).lerp(new THREE.Color(0x47755c), (Math.sin(x * 0.7 + z * 0.4) + 1) * 0.32)
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))
  mesh.receiveShadow = true; scene.add(mesh)
  // Terrain-following ribbon, with samples dense enough to share collision heights.
  const curve = new THREE.CatmullRomCurve3(FOREST_PATH.map((p) => new THREE.Vector3(p.x, 0, p.z)))
  const vertices = [], indices = []
  for (let i = 0; i <= 160; i++) {
    const p = curve.getPoint(i / 160), tangent = curve.getTangent(i / 160)
    for (const side of [-1, 1]) { const x = p.x + tangent.z * side * 1.9, z = p.z - tangent.x * side * 1.9; vertices.push(x, forestHeight(x, z, layout) + 0.045, z) }
    if (i < 160) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
  }
  const ribbon = new THREE.BufferGeometry(); ribbon.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); ribbon.setIndex(indices); ribbon.computeVertexNormals()
  const path = new THREE.Mesh(ribbon, material); path.receiveShadow = true; scene.add(path)
}

export function createForestScene({ spawnId = 'start', layout = DEFAULT_FOREST_LAYOUT } = {}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xc3cfcd); scene.fog = new THREE.Fog(0xc3cfcd, 75, 165)
  scene.userData.layoutSeed = layout.seed
  const materials = palette(), builder = createSceneBuilder(scene, materials), { put } = builder
  scene.userData.ownedMaterials = Object.values(materials)
  const world = createForestWorld(spawnId, layout)
  const height = (x, z) => forestHeight(x, z, layout)
  terrain(scene, materials.path, layout)
  daylight(scene)
  // The palace builder remains shared with the preserved courtyard; only this entrance animates.
  buildPalace((shape, mat, [x, y, z], ...args) => put(shape, mat, [x, y + 8, z - 13], ...args), { closedEntrance: false })
  put('box', 'grass', [0, 7.8, -34], [52, 0.4, 8])
  put('box', 'foundation', [0, 2.5, -27], [56, 3, 10])
  put('box', 'water', [0, 4.1, -27], [56, 0.12, 8], [0, 0, 0], false)
  for (const z of [-22, -31]) for (let x = -26; x <= 26; x += 2.8) {
    if (Math.abs(x) < 3.5) continue
    put('orb', 'shadowStone', [x, 7.7, z], [1.9, 1.1, 1.3], [0, x, 0])
  }
  for (const [i, tree] of layout.trees.entries()) {
    const y = height(tree.x, tree.z)
    const canopy = 1 + Math.sin(i * 2.4) * 0.1
    put('tapered', tree.birch ? 'birch' : 'wood', [tree.x, y + tree.height * 0.33, tree.z], [0.35, tree.height * 0.66, 0.35])
    put(i % 3 ? 'cone' : 'orb', i % 7 === 0 ? 'leavesGold' : i % 2 ? 'leaves' : 'leavesLight', [tree.x, y + tree.height * 0.75, tree.z], [2.05 * canopy, tree.height * 0.65, 2.05 * canopy], [0, i, 0])
    if (i % 3 === 0) put('cone', 'leaves', [tree.x, y + tree.height * 0.95, tree.z], [1.5, tree.height * 0.5, 1.5])
  }
  layout.rocks.forEach((p, i) => put('orb', 'shadowStone', [p.x, height(p.x, p.z) + 0.4, p.z], [1, 0.8, 1.1], [0, i, 0]))
  for (const [i, shrub] of layout.shrubs.entries()) {
    const { x, z, size } = shrub, y = height(x, z)
    put('orb', i % 2 ? 'leavesLight' : 'lawn', [x, y + 0.25, z], [size, size * 0.8, size], [0, i, 0])
    if (i % 4 === 0) put('gem', 'flower', [x + 0.3, y + 0.7, z], [0.13, 0.2, 0.13], [0, i, 0], false)
  }
  for (let i = 0; i < 18; i++) {
    const angle = i * Math.PI * 2 / 18
    put('cone', 'distant', [Math.sin(angle) * 90, 0, -25 + Math.cos(angle) * 105], [16, 18 + i % 4 * 6, 16], [0, i, 0], false)
  }
  // A shallow secluded pond, an arch, a nest shelter and mushroom rings identify the clearings.
  const [trident, , slipper, eggs, potion] = layout.collectibles
  const pondX = trident.x + Math.sign(trident.x) * 2.4
  put('orb', 'water', [pondX, height(pondX, trident.z) + 0.05, trident.z], [2.4, 0.09, 1.3], [0, 0, 0], false)
  put('arch', 'stone', [slipper.x, height(slipper.x, slipper.z), slipper.z - 0.8], [1.15, 1.15, 0.4])
  put('box', 'wood', [eggs.x, height(eggs.x, eggs.z) + 2.8, eggs.z - 0.8], [2.7, 0.15, 1.6], [0, 0, -0.15])
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI * 2 / 10, x = potion.x + Math.cos(angle) * 2, z = potion.z + Math.sin(angle) * 2, y = height(x, z)
    put('cylinder', 'trim', [x, y + 0.22, z], [0.06, 0.44, 0.06])
    put('orb', 'flower', [x, y + 0.48, z], [0.33, 0.18, 0.33])
  }
  const items = layout.collectibles.map((spot, index) => {
    const definition = { ...FOREST_COLLECTIBLES.find((item) => item.id === spot.id), ...spot }
    const y = height(definition.x, definition.z)
    put('cylinder', 'shadowStone', [definition.x, y + 0.17, definition.z], [0.72, 0.34, 0.72])
    put('tapered', 'stone', [definition.x, y + 0.58, definition.z], [0.5, 0.65, 0.5])
    put('cylinder', 'trim', [definition.x, y + 0.98, definition.z], [0.68, 0.16, 0.68])
    put('ring', 'gold', [definition.x, y + 0.33, definition.z], [0.62, 0.62, 0.62], [Math.PI / 2, 0, 0])
    put('gem', 'gold', [definition.x, y + 0.65, definition.z + 0.48], [0.14, 0.19, 0.05])
    // Branching stepping stones and one warm lantern are clues from the main path.
    const start = { x: pathX(definition.z), z: definition.z }
    for (let i = 1; i <= 4; i++) { const t = i / 5, x = start.x + (definition.x - start.x) * t, z = start.z + (definition.z - start.z) * t; put('orb', 'trim', [x, height(x, z) + 0.04, z], [0.35, 0.06, 0.27], [0, t, 0]) }
    put('cylinder', 'wood', [start.x + Math.sign(definition.x) * 2.6, height(start.x, start.z) + 0.7, start.z], [0.07, 1.4, 0.07])
    put('gem', 'window', [start.x + Math.sign(definition.x) * 2.6, height(start.x, start.z) + 1.55, start.z], [0.18, 0.28, 0.18])
    const item = createFairytaleItem(definition.id); item.position.set(definition.x, y + 2, definition.z); scene.add(item)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 5, 24), new THREE.MeshStandardMaterial({ color: definition.color, emissive: definition.color, emissiveIntensity: 0.55, roughness: 0.7 }))
    halo.position.set(definition.x, y + 1.09, definition.z); halo.rotation.x = Math.PI / 2; scene.add(halo)
    return { definition, item, halo, y, phase: index * 1.37, collected: false, collectAge: 1 }
  })
  const enemies = layout.encounters.map((spot) => {
    const model = spot.id === 'goblin' ? createForestGoblin() : createBigBadWolf()
    model.root.position.set(spot.x, height(spot.x, spot.z), spot.z); scene.add(model.root)
    return { ...spot, model, defeated: false }
  })
  builder.flush()
  const bridge = new THREE.Group(); bridge.position.set(0, 8.1, -31); bridge.rotation.x = -Math.PI / 2
  const bridgeBuilder = createSceneBuilder(bridge, materials)
  bridgeBuilder.put('box', 'wood', [0, 0, 4.5], [5.6, 0.25, 9])
  for (let i = 0; i < 18; i++) bridgeBuilder.put('box', 'woodLight', [0, 0.14, 0.25 + i * 0.5], [5.5, 0.08, 0.4])
  for (const x of [-2.75, 2.75]) bridgeBuilder.put('box', 'iron', [x, 0.24, 4.5], [0.12, 0.24, 9])
  bridgeBuilder.flush(); scene.add(bridge)
  const gate = new THREE.Group(); gate.position.set(0, 8, -31)
  const gateBuilder = createSceneBuilder(gate, materials)
  for (let x = -2.8; x <= 2.8; x += 0.7) gateBuilder.put('box', 'iron', [x, 3.5, 0.2], [0.12, 7, 0.12])
  for (const y of [1.5, 3.5, 5.5]) gateBuilder.put('box', 'iron', [0, y, 0.2], [5.8, 0.12, 0.16])
  gateBuilder.flush(); scene.add(gate)
  const effects = createMagicEffects(scene)
  let elapsed = 0, announced = false, disposed = false, initialized = false, moteTime = 0
  return {
    scene, world, get spawn() { return world.spawn },
    update(dt, { forestRun, onForestBridgeLowered, playerPosition, reducedMotion = false } = {}) {
      if (disposed) return
      elapsed += dt
      items.forEach((entry) => {
        const { definition, item, halo, y, phase } = entry
        const collected = !!forestRun?.collectedIds.includes(definition.id)
        if (initialized && collected && !entry.collected) { entry.collectAge = 0; effects.burst({ x: definition.x, y: y + 2, z: definition.z }, { color: definition.color, reducedMotion }) }
        entry.collected = collected
        if (collected) {
          entry.collectAge = Math.min(1, entry.collectAge + dt)
          item.visible = entry.collectAge < 0.32 && !reducedMotion
          if (item.visible) { item.scale.setScalar(Math.max(0.05, 1 - entry.collectAge / 0.32)); item.position.y = y + 2 + entry.collectAge * 0.4 }
          halo.visible = false
          return
        }
        item.visible = true; halo.visible = true
        item.position.y = y + 2 + (reducedMotion ? 0 : Math.sin(elapsed * 1.7 + phase) * 0.065)
        item.rotation.y = reducedMotion ? phase : (elapsed * 0.42 + phase) % (Math.PI * 2)
        const near = playerPosition && Math.hypot(playerPosition.x - definition.x, playerPosition.z - definition.z) < 2.8
        const glow = near ? 1.05 : 0.45
        halo.material.emissiveIntensity += (glow - halo.material.emissiveIntensity) * (1 - Math.exp(-dt * 6))
      })
      enemies.forEach((enemy) => {
        const defeated = !!forestRun?.defeatedEnemyIds.includes(enemy.id)
        if (initialized && defeated && !enemy.defeated) effects.burst({ x: enemy.x, y: height(enemy.x, enemy.z) + 1.4, z: enemy.z }, { color: 0xd6dba8, reducedMotion })
        enemy.defeated = defeated
        enemy.model.root.visible = !!forestRun && !defeated
        if (enemy.model.root.visible) enemy.model.update(reducedMotion ? 0 : elapsed)
      })
      if (!initialized && forestRun?.bridgeState === 'lowered') announced = true
      if (forestRun) initialized = true
      moteTime += dt
      if (!reducedMotion && playerPosition && moteTime > 1.6) {
        moteTime = 0
        items.filter((entry) => !entry.collected).forEach(({ definition, y }) => effects.burst({ x: definition.x + 1, y: y + 1.2, z: definition.z }, { count: 3, color: 0xcce0b0, gentle: true }))
      }
      if (forestRun && forestRun.bridgeState !== 'raised') {
        bridge.rotation.x = forestRun.bridgeState === 'lowered' ? 0 : Math.min(0, bridge.rotation.x + dt * 0.65)
        gate.position.y = forestRun.bridgeState === 'lowered' ? 16 : Math.min(16, gate.position.y + dt * 3.4)
        if (bridge.rotation.x === 0 && gate.position.y === 16 && !announced) { announced = true; effects.burst({ x: 0, y: 8.3, z: -30 }, { count: 18, color: 0xd6bd97, reducedMotion }); onForestBridgeLowered?.() }
      }
      world.setBridgeOpen(forestRun?.bridgeState === 'lowered')
      if (forestRun?.checkpoint?.position) world.setCheckpoint(forestRun.checkpoint.position)
      effects.update(dt, reducedMotion)
    },
    dispose() { if (!disposed) { disposed = true; effects.dispose(); disposeScene(scene) } },
  }
}

export function createCastleHallScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x25263b); scene.fog = new THREE.Fog(0x25263b, 85, 230)
  const materials = palette(), { put, flush } = createSceneBuilder(scene, materials)
  scene.userData.ownedMaterials = Object.values(materials)
  const floor = new THREE.PlaneGeometry(80, 152, 80, 152); floor.rotateX(-Math.PI / 2)
  const vertices = floor.attributes.position
  for (let i = 0; i < vertices.count; i++) vertices.setY(i, hallHeight(vertices.getX(i), vertices.getZ(i)))
  floor.computeVertexNormals(); const paving = new THREE.Mesh(floor, materials.shadowStone); paving.receiveShadow = true; scene.add(paving)
  for (let z = -70; z < 74; z += 2) put('box', 'royal', [0, hallHeight(0, z) + 0.035, z], [10, 0.05, 2], [z < -34 && z > -48 ? Math.atan(3 / 14) : 0, 0, 0], false)
  for (const x of [-40, 40]) {
    // Tall side arches lead into two genuinely walkable wings.
    put('box', 'stone', [x, 24, -36], [1, 48, 80])
    put('box', 'stone', [x, 24, 46], [1, 48, 60])
    put('box', 'stone', [x, 33, 10], [1, 30, 12])
    put('arch', 'gold', [x, 0, 10], [6, 9, 1], [0, Math.PI / 2, 0])
    for (const z of HALL.pillars) {
      put('cylinder', 'stone', [Math.sign(x) * 25, 17, z], [1.7, 34, 1.7])
      put('cylinder', 'trim', [Math.sign(x) * 25, 1, z], [2.3, 2, 2.3])
      put('cylinder', 'gold', [Math.sign(x) * 25, 34, z], [2.4, 1.4, 2.4])
      if (x < 0) put('arch', 'trim', [0, 31, z], [21, 5, 1.2])
      put('window', 'window', [x - Math.sign(x) * 0.6, 15, z], [4, 8, 1], [0, -Math.sign(x) * Math.PI / 2, 0], false)
      put('cone', 'gold', [Math.sign(x) * 23, 6, z], [0.6, 1, 0.6], [Math.PI, 0, 0])
      put('gem', 'window', [Math.sign(x) * 23, 7.4, z], [0.4, 1.1, 0.4])
    }
  }
  for (const x of [-25, 25]) put('box', 'stone', [x, 24, -76], [30, 48, 1])
  put('box', 'stone', [0, 33, -76], [20, 30, 1])
  put('arch', 'gold', [0, 3, -75.7], [10, 8, 1])
  for (const x of [-24, 24]) put('box', 'stone', [x, 24, 76], [32, 48, 1])
  put('box', 'stone', [0, 38, 76], [16, 20, 1])
  put('box', 'roof', [0, 48, 0], [80, 1, 152])
  put('arch', 'trim', [0, 0, 75.5], [6, 8, 1], [0, Math.PI, 0])
  put('window', 'wood', [0, 0, 76.1], [15, 13, 1], [0, Math.PI, 0], false)
  for (const x of [-16, 16]) { put('banner', 'royal', [x, 24, -75.3], [7, 20, 1]); put('gem', 'gold', [x, 25, -75.1], [1.8, 2.4, 0.15]) }
  for (const wing of HALL.galleries) {
    put('box', 'shadowStone', [wing.x, -0.3, 4], [28, 0.6, 60])
    put('box', 'roof', [wing.x, 22, 4], [28, 1, 60])
    put('box', 'stone', [wing.side * 68, 11, 4], [1, 22, 60])
    for (const z of [wing.back, wing.front]) put('box', 'stone', [wing.x, 11, z], [28, 22, 1])
    for (const z of [-15, 5, 25]) {
      put('window', 'window', [wing.side * 67.4, 9, z], [5, 9, 1], [0, -wing.side * Math.PI / 2, 0], false)
      put('banner', wing.side < 0 ? 'royal' : 'roof', [wing.x, 12, -25.4], [5, 9, 0.5])
    }
    // West library wall shelves and east observatory stars are landmarks,
    // placed beyond the playable footprint so their surfaces match collisions.
    if (wing.side < 0) for (let z = -20; z <= 28; z += 8) for (const y of [2, 5, 8]) {
      put('box', 'wood', [-68, y, z], [0.8, 0.4, 6])
      for (let i = 0; i < 5; i++) put('box', i % 2 ? 'royal' : 'gold', [-67.7, y + 1, z - 2 + i], [0.5, 1.6, 0.5])
    }
    else for (const z of [-14, 8, 28]) put('gem', 'gold', [67.6, 14, z], [0.3, 2, 1.4])
    put('box', 'royal', [wing.x, 0.04, 10], [26, 0.05, 7])
  }
  // A separate raised prison wing beyond the boss, with a real barred threshold.
  put('box', 'shadowStone', [0, 2.7, -92], [24, 0.6, 32])
  for (const x of [-12, 12]) put('box', 'stone', [x, 12, -92], [1, 18, 32])
  put('box', 'stone', [0, 12, -108], [24, 18, 1])
  put('box', 'roof', [0, 22, -92], [24, 1, 32])
  for (const z of [-82, -98]) for (const x of [-11.4, 11.4]) put('gem', 'window', [x, 9, z], [0.4, 1.8, 0.6])
  put('box', 'royal', [0, 3.04, -92], [8, 0.05, 30])
  put('box', 'gold', [0, 5, -103], [5, 4, 0.8])
  put('box', 'royal', [0, 4, -101], [3, 2, 2])
  flush()
  const prisonGate = new THREE.Group(); prisonGate.position.set(0, 3, HALL.prison.gateZ)
  const gateBuilder = createSceneBuilder(prisonGate, materials)
  for (let x = -11; x <= 11; x += 1) gateBuilder.put('box', 'iron', [x, 6, 0], [0.16, 12, 0.2])
  for (const y of [1, 6, 11]) gateBuilder.put('box', 'gold', [0, y, 0], [23, 0.2, 0.3])
  gateBuilder.flush(); scene.add(prisonGate)
  scene.add(new THREE.HemisphereLight(0xc0bcf0, 0x8b6e60, 1.9))
  const key = new THREE.DirectionalLight(0xffddad, 2); key.position.set(-15, 38, 25); key.target.position.set(0, 3, -45); key.castShadow = true
  Object.assign(key.shadow.camera, { left: -42, right: 42, top: 90, bottom: -90, near: 1, far: 180 }); key.shadow.mapSize.set(2048, 2048); key.shadow.normalBias = 0.08
  scene.add(key, key.target)
  for (const z of [40, -15, -60]) { const light = new THREE.PointLight(0xffbb77, 300, 75, 1.4); light.position.set(9, 14, z); scene.add(light) }
  const dragon = createStoryDragon(); dragon.root.position.set(HALL.dragon.x, hallHeight(HALL.dragon.x, HALL.dragon.z), HALL.dragon.z); dragon.root.scale.setScalar(HALL.dragon.scale); scene.add(dragon.root)
  const princess = createStoryPrincess(); princess.position.set(HALL.princess.x, 4, HALL.princess.z); princess.scale.setScalar(1.8); scene.add(princess)
  const effects = createMagicEffects(scene, 64)
  let elapsed = 0, disposed = false, entered = false, won = false
  const world = createHallWorld()
  return { scene, world, spawn: world.spawn, update(dt, { forestRun, reducedMotion = false } = {}) {
    if (disposed) return
    world.setDragonDefeated(forestRun?.dragonDefeated)
    // The server unlocks collision immediately; bars retract fully in the same
    // frame to avoid a visually closed gate with an already open passage.
    prisonGate.position.y = forestRun?.dragonDefeated ? 17 : 3
    elapsed += dt
    if (!entered) { entered = true; won = !!forestRun?.dragonDefeated; effects.burst({ x: HALL.dragon.x, y: 6, z: HALL.dragon.z + 3 }, { count: 12, color: 0xbba2df, reducedMotion }) }
    if (forestRun?.dragonDefeated && !won) { won = true; effects.burst({ x: HALL.dragon.x, y: 7, z: HALL.dragon.z + 3 }, { count: 30, color: 0xffda89, reducedMotion }) }
    dragon.update(reducedMotion ? 0 : elapsed, forestRun?.dragonDefeated)
    effects.update(dt, reducedMotion)
  }, dispose() { if (!disposed) { disposed = true; effects.dispose(); disposeScene(scene) } } }
}
