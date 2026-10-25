import * as THREE from 'three'
import { createSceneBuilder } from './scenePrimitives.js'
import { buildPalace } from './palaceArchitecture.js'
import { disposeScene } from './sceneResources.js'
import { createFairytaleItem, createStoryDragon } from './storybookProps.js'
import { FOREST_COLLECTIBLES } from './game/forestContent.js'
import { createForestWorld, createHallWorld, FOREST_PATH, FOREST_TREES, FOREST_ROCKS, forestHeight, pathX } from './forestLayout.js'

function palette() {
  const colors = { stone: 0xe3c9ab, trim: 0xf8dfb2, shadowStone: 0xb59994, foundation: 0x756d87, roof: 0x394777, royal: 0x702c70, gold: 0xe4b662, iron: 0x393c50, window: 0xffce83, gateDark: 0x262438, grass: 0x59795f, lawn: 0x406554, path: 0xccb68e, wood: 0x634b44, woodLight: 0x987357, leaves: 0x365d56, leavesLight: 0x67866a, birch: 0xd9cbb2, flower: 0xbb8bb7, water: 0x6ca9ae, ripple: 0xb7d6cb, distant: 0x80989a }
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
function terrain(scene, material) {
  const geometry = new THREE.PlaneGeometry(56, 68, 56, 68)
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, 11)
  const positions = geometry.getAttribute('position')
  const colors = []
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i)
    positions.setY(i, forestHeight(x, z))
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
    for (const side of [-1, 1]) { const x = p.x + tangent.z * side * 1.9, z = p.z - tangent.x * side * 1.9; vertices.push(x, forestHeight(x, z) + 0.045, z) }
    if (i < 160) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
  }
  const ribbon = new THREE.BufferGeometry(); ribbon.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); ribbon.setIndex(indices); ribbon.computeVertexNormals()
  const path = new THREE.Mesh(ribbon, material); path.receiveShadow = true; scene.add(path)
}

export function createForestScene({ spawnId = 'start' } = {}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xc3cfcd); scene.fog = new THREE.Fog(0xc3cfcd, 75, 165)
  const materials = palette(), builder = createSceneBuilder(scene, materials), { put } = builder
  scene.userData.ownedMaterials = Object.values(materials)
  const world = createForestWorld(spawnId)
  terrain(scene, materials.path)
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
  for (const [i, tree] of FOREST_TREES.entries()) {
    const y = forestHeight(tree.x, tree.z)
    put('tapered', tree.birch ? 'birch' : 'wood', [tree.x, y + tree.height * 0.33, tree.z], [0.35, tree.height * 0.66, 0.35])
    put(i % 3 ? 'cone' : 'orb', i % 2 ? 'leaves' : 'leavesLight', [tree.x, y + tree.height * 0.75, tree.z], [2.05, tree.height * 0.65, 2.05], [0, i, 0])
    if (i % 3 === 0) put('cone', 'leaves', [tree.x, y + tree.height * 0.95, tree.z], [1.5, tree.height * 0.5, 1.5])
  }
  FOREST_ROCKS.forEach((p, i) => put('orb', 'shadowStone', [p.x, forestHeight(p.x, p.z) + 0.4, p.z], [1, 0.8, 1.1], [0, i, 0]))
  for (let i = 0; i < 130; i++) {
    const x = -23 + (i * 17.3 % 46), z = -17 + (i * 11.7 % 56), y = forestHeight(x, z)
    if (Math.abs(x - pathX(z)) < 1.6 || FOREST_COLLECTIBLES.some((p) => Math.hypot(x - p.x, z - p.z) < 1.25)) continue
    put('orb', i % 2 ? 'leavesLight' : 'lawn', [x, y + 0.25, z], [0.55, 0.45, 0.5], [0, i, 0])
    if (i % 4 === 0) put('gem', 'flower', [x + 0.3, y + 0.7, z], [0.13, 0.2, 0.13], [0, i, 0], false)
  }
  for (let i = 0; i < 18; i++) {
    const angle = i * Math.PI * 2 / 18
    put('cone', 'distant', [Math.sin(angle) * 90, 0, -25 + Math.cos(angle) * 105], [16, 18 + i % 4 * 6, 16], [0, i, 0], false)
  }
  // A shallow secluded pond, an arch, a nest shelter and mushroom rings identify the clearings.
  put('orb', 'water', [-15, forestHeight(-15, 29) + 0.05, 29], [2.4, 0.09, 1.3], [0, 0, 0], false)
  put('arch', 'stone', [-13, forestHeight(-13, 9), 8.2], [1.15, 1.15, 0.4])
  put('box', 'wood', [13, forestHeight(13, -3) + 1.9, -3.8], [2.7, 0.15, 1.6], [0, 0, -0.15])
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI * 2 / 10, x = -10 + Math.cos(angle) * 2, z = -14 + Math.sin(angle) * 2, y = forestHeight(x, z)
    put('cylinder', 'trim', [x, y + 0.22, z], [0.06, 0.44, 0.06])
    put('orb', 'flower', [x, y + 0.48, z], [0.33, 0.18, 0.33])
  }
  const items = FOREST_COLLECTIBLES.map((definition) => {
    const y = forestHeight(definition.x, definition.z)
    put('cylinder', 'shadowStone', [definition.x, y + 0.17, definition.z], [0.72, 0.34, 0.72])
    // Branching stepping stones and one warm lantern are clues from the main path.
    const start = { x: pathX(definition.z), z: definition.z }
    for (let i = 1; i <= 4; i++) { const t = i / 5, x = start.x + (definition.x - start.x) * t, z = start.z + (definition.z - start.z) * t; put('orb', 'trim', [x, forestHeight(x, z) + 0.04, z], [0.35, 0.06, 0.27], [0, t, 0]) }
    put('cylinder', 'wood', [start.x + Math.sign(definition.x) * 2.6, forestHeight(start.x, start.z) + 0.7, start.z], [0.07, 1.4, 0.07])
    put('gem', 'window', [start.x + Math.sign(definition.x) * 2.6, forestHeight(start.x, start.z) + 1.55, start.z], [0.18, 0.28, 0.18])
    const item = createFairytaleItem(definition.id); item.position.set(definition.x, y + 1.25, definition.z); scene.add(item)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 5, 24), new THREE.MeshStandardMaterial({ color: definition.color, emissive: definition.color, emissiveIntensity: 0.55, roughness: 0.7 }))
    halo.position.set(definition.x, y + 0.4, definition.z); halo.rotation.x = Math.PI / 2; scene.add(halo)
    return { definition, item, halo, y }
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
  let elapsed = 0, announced = false, disposed = false
  return {
    scene, world, get spawn() { return world.spawn },
    update(dt, { forestRun, onForestBridgeLowered } = {}) {
      if (disposed) return
      elapsed += dt
      items.forEach(({ definition, item, halo, y }) => {
        const collected = forestRun?.collectedIds.includes(definition.id)
        item.visible = !collected; item.position.y = y + 1.25 + Math.sin(elapsed * 1.7) * 0.08; item.rotation.y = Math.sin(elapsed * 0.4) * 0.25
        halo.material.emissiveIntensity = collected ? 0.1 : 0.5 + Math.sin(elapsed * 2) * 0.12
      })
      if (forestRun && forestRun.bridgeState !== 'raised') {
        bridge.rotation.x = forestRun.bridgeState === 'lowered' ? 0 : Math.min(0, bridge.rotation.x + dt * 0.65)
        gate.position.y = forestRun.bridgeState === 'lowered' ? 16 : Math.min(16, gate.position.y + dt * 3.4)
        if (bridge.rotation.x === 0 && gate.position.y === 16 && !announced) { announced = true; onForestBridgeLowered?.() }
      }
      world.setBridgeOpen(forestRun?.bridgeState === 'lowered')
      if (forestRun?.checkpoint?.position) world.setCheckpoint(forestRun.checkpoint.position)
    },
    dispose() { if (!disposed) { disposed = true; disposeScene(scene) } },
  }
}

export function createCastleHallScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x25263b); scene.fog = new THREE.Fog(0x25263b, 24, 65)
  const materials = palette(), { put, flush } = createSceneBuilder(scene, materials)
  scene.userData.ownedMaterials = Object.values(materials)
  put('box', 'shadowStone', [0, -0.3, -2], [20, 0.6, 28])
  put('box', 'royal', [0, 0.025, 0], [4, 0.04, 22], [0, 0, 0], false)
  for (const x of [-10, 10]) { put('box', 'stone', [x, 5, -2], [0.5, 10, 28]); for (const z of [-9, -2, 5]) { put('cylinder', 'trim', [Math.sign(x) * 7.5, 4, z], [0.65, 8, 0.65]); put('cone', 'gold', [Math.sign(x) * 7.5, 8.4, z], [0.85, 0.8, 0.85]) } }
  put('box', 'stone', [0, 5, -16], [20, 10, 0.5])
  for (const x of [-6.5, 6.5]) put('box', 'stone', [x, 5, 12], [7, 10, 0.5])
  put('box', 'roof', [0, 10, -2], [20, 0.4, 28])
  for (const x of [-5, 5]) { put('banner', 'royal', [x, 6, -15.7], [2.2, 5, 1]); put('gem', 'gold', [x, 6, -15.6], [0.6, 0.8, 0.1]) }
  put('arch', 'trim', [0, 0, 11.7], [2.5, 2.5, 0.5], [0, Math.PI, 0])
  for (const z of [-9, -2, 5]) { put('arch', 'trim', [0, 5.2, z], [6, 1.8, 0.5]); for (const x of [-8.6, 8.6]) { put('cone', 'gold', [x, 2.8, z], [0.35, 0.5, 0.35], [Math.PI, 0, 0]); put('gem', 'window', [x, 3.5, z], [0.22, 0.65, 0.22]) } }
  put('cylinder', 'shadowStone', [0, 0.15, -8], [3, 0.3, 3])
  flush()
  scene.add(new THREE.HemisphereLight(0xc0bcf0, 0x8b6e60, 1.7))
  const light = new THREE.PointLight(0xffbb77, 170, 40, 1.4); light.position.set(0, 6, 0); scene.add(light)
  const dragon = createStoryDragon(); dragon.root.position.z = -8; scene.add(dragon.root)
  let elapsed = 0, disposed = false
  const world = createHallWorld()
  return { scene, world, spawn: world.spawn, update(dt, { forestRun } = {}) { if (!disposed) { elapsed += dt; dragon.update(elapsed, forestRun?.dragonDefeated) } }, dispose() { if (!disposed) { disposed = true; disposeScene(scene) } } }
}
