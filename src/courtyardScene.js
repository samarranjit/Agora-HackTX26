import * as THREE from 'three'
import { createSceneBuilder } from './scenePrimitives.js'
import { buildPalace } from './palaceArchitecture.js'
import { disposeScene } from './sceneResources.js'
import { WALLS, TREES, BENCHES, GARDEN_TOWERS, COURTYARD_WORLD } from './courtyardLayout.js'
import { createForestGoblin } from './forestGoblin.js'

export function createCourtyardScene() {
  const scene = new THREE.Scene()
  const goblin = createForestGoblin()
  scene.add(goblin.root)
  scene.background = new THREE.Color(0xc5bac7)
  scene.fog = new THREE.Fog(0xc5bac7, 54, 135)
  const colors = {
    stone: 0xe3c9ab, trim: 0xf8dfb2, shadowStone: 0xb59994, foundation: 0x756d87,
    roof: 0x394777, royal: 0x702c70, gold: 0xe4b662, iron: 0x393c50,
    window: 0xffce83, gateDark: 0x262438, grass: 0x72927b, lawn: 0x4f7865,
    path: 0xd4bd9c, pathLight: 0xe8d4b1, wood: 0x614448, woodLight: 0x946352,
    leaves: 0x3b6864, leavesLight: 0x5a8e78, flower: 0xd989a0,
    water: 0x3b7f94, ripple: 0x8bc3c7, distant: 0x8896ad, cloud: 0xe9d7cd,
  }
  const materials = Object.fromEntries(Object.entries(colors).map(([name, color]) => [name,
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, side: name === 'royal' ? THREE.DoubleSide : THREE.FrontSide,
      ...(name === 'window' ? { emissive: color, emissiveIntensity: 0.4 } : {}),
    }),
  ]))
  const { put, flush } = createSceneBuilder(scene, materials)

  // A vertex-colored sky and a few low-poly clouds, with no texture downloads or sky shader.
  const skyGeometry = new THREE.SphereGeometry(180, 24, 12)
  const skyColors = []
  const positions = skyGeometry.getAttribute('position')
  const upper = new THREE.Color(0x748dbb)
  const horizon = new THREE.Color(0xf2d5b9)
  for (let i = 0; i < positions.count; i++) {
    const color = horizon.clone().lerp(upper, Math.max(0, Math.min(1, positions.getY(i) / 130)))
    skyColors.push(color.r, color.g, color.b)
  }
  skyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3))
  scene.add(new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })))
  const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe6b0, fog: false }))
  sunOrb.position.set(-60, 50, -110)
  scene.add(sunOrb)
  for (let i = 0; i < 10; i++) {
    const x = -100 + i * 23
    const y = 22 + (i % 3) * 5
    put('orb', 'cloud', [x, y, -95 - (i % 2) * 15], [12, 2, 4], [0, 0, 0], false)
    put('cone', 'distant', [x, 4, -105], [16, 22 + (i % 3) * 14, 13], [0, 0.3 * i, 0], false)
  }
  // Continue the horizon around the island so the moat overlooks feel part of a world.
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI * 2 / 24
    const x = Math.cos(angle) * (83 + i % 3 * 7)
    const z = Math.sin(angle) * (83 + i % 4 * 6) - 6
    put('cone', 'distant', [x, 4, z], [12 + i % 4 * 3, 17 + i % 5 * 5, 12], [0, i, 0], false)
    if (i % 3 === 0) put('orb', 'cloud', [x * 0.9, 25 + i % 4 * 3, z], [10, 1.4, 3], [0, angle, 0], false)
  }
  for (let i = 0; i < 30; i++) {
    const angle = i * Math.PI * 2 / 30
    const x = Math.cos(angle) * 49
    const z = Math.sin(angle) * 60 - 6
    put('cone', 'leaves', [x, 0, z], [2.4, 8 + i % 4, 2.4], [0, i, 0], false)
  }
  put('box', 'lawn', [0, -3.5, -15], [310, 1, 310], [0, 0, 0], false)
  put('box', 'water', [0, -1.15, -9], [68, 0.12, 88], [0, 0, 0], false)
  put('box', 'foundation', [0, -1.5, 7], [40, 3, 34])
  put('box', 'grass', [0, -0.02, 7], [40, 0.04, 34])
  put('box', 'path', [0, 0.012, 7], [6.5, 0.025, 34], [0, 0, 0], false)
  put('box', 'path', [0, 0.014, 4], [34, 0.025, 4.2], [0, 0, 0], false)
  for (const x of [-9, 9]) put('box', 'path', [x, 0.01, 7], [2.5, 0.025, 27], [0, 0, 0], false)
  for (const x of [-3.45, 3.45]) put('box', 'pathLight', [x, 0.03, 7], [0.14, 0.06, 34], [0, 0, 0], false)
  for (let z = -8; z < 24; z += 2) {
    put('box', 'pathLight', [0, 0.028, z], [5.9, 0.025, 0.045], [0, 0, 0], false)
  }
  WALLS.forEach(({ x, z, w, d, h }) => {
    put('box', 'stone', [x, h / 2, z], [w, h, d])
    put('box', 'trim', [x, h, z], [w + 0.16, 0.18, d + 0.16])
  })
  for (const x of [-19.7, 19.7]) for (const z of [-9, -3, 3, 17, 23]) {
    put('box', 'trim', [x, 1, z], [0.95, 2, 0.95])
    put('gem', 'gold', [x, 2.2, z], [0.35, 0.45, 0.35])
  }
  for (const { x, z } of GARDEN_TOWERS) {
    put('cylinder', 'stone', [x, 3, z], [1.6, 6, 1.6])
    put('cylinder', 'trim', [x, 5.9, z], [1.85, 0.35, 1.85])
    put('cone', 'roof', [x, 7.6, z], [2.3, 3.4, 2.3])
    put('gem', 'gold', [x, 9.4, z], [0.22, 0.5, 0.22])
    put('window', 'window', [x, 3, z + 1.61], [0.7, 0.9, 1], [0, 0, 0], false)
  }
  for (const { x, z } of TREES) {
    put('tapered', 'wood', [x, 1.7, z], [0.42, 3.4, 0.42])
    put('orb', 'leaves', [x, 4, z], [2.1, 2.4, 2], [0, x * 0.1, 0])
    put('orb', 'leavesLight', [x - 0.4, 5.2, z], [1.65, 1.5, 1.6], [0, z, 0])
    put('cylinder', 'trim', [x, 0.2, z], [0.7, 0.4, 0.7])
  }
  for (const { x, z } of BENCHES) {
    put('box', 'woodLight', [x, 0.65, z], [3.1, 0.18, 1.05])
    put('box', 'woodLight', [x, 1.05, z + 0.4], [3.1, 0.65, 0.12])
    for (const side of [-1, 1]) put('box', 'stone', [x + side * 1.05, 0.3, z], [0.3, 0.6, 0.85])
  }
  // A shallow ornamental fountain is a courtyard landmark, not an interaction target.
  put('cylinder', 'shadowStone', [0, 0.18, 4], [2.8, 0.36, 2.8])
  put('cylinder', 'trim', [0, 0.4, 4], [2.6, 0.45, 2.6])
  put('cylinder', 'water', [0, 0.64, 4], [2.35, 0.035, 2.35], [0, 0, 0], false)
  put('ring', 'trim', [0, 0.7, 4], [2.48, 2.48, 1.4], [Math.PI / 2, 0, 0])
  put('tapered', 'stone', [0, 1.2, 4], [0.42, 1.5, 0.42])
  put('cone', 'trim', [0, 1.9, 4], [1.15, 0.35, 1.15], [Math.PI, 0, 0])
  put('gem', 'gold', [0, 2.7, 4], [0.4, 0.7, 0.4])
  for (let i = 0; i < 26; i++) {
    const angle = i * 2.4
    const radius = 0.75 + (i % 5) * 0.22
    put('gem', 'ripple', [Math.cos(angle) * radius, 0.72 + (i % 3) * 0.22, 4 + Math.sin(angle) * radius], [0.03, 0.1, 0.03], [0, 0, 0], false)
  }
  // Garden borders and little flowers are instances, including the illustrated flag motifs.
  for (const side of [-1, 1]) {
    for (const z of [0, 10, 20]) for (let i = 0; i < 9; i++) {
      const x = side * (5 + i * 0.45)
      put('orb', 'leaves', [x, 0.25, z], [0.4, 0.35, 0.4], [0, i, 0])
      put('gem', i % 2 ? 'flower' : 'trim', [x, 0.6, z], [0.1, 0.13, 0.1], [0, 0, 0], false)
    }
    for (const z of [10, -4]) {
      put('cylinder', 'iron', [side * 16, 3.2, z], [0.07, 6.4, 0.07])
      put('box', 'gold', [side * 15.3, 6.1, z], [1.8, 0.1, 0.1])
      put('banner', 'royal', [side * 15.3, 4.9, z], [1.4, 2.3, 1], [0, 0, 0], false)
      put('gem', 'gold', [side * 15.3, 5, z + 0.035], [0.32, 0.45, 0.055], [0, 0, 0], false)
    }
  }
  buildPalace(put)
  // Warm sculpted flames avoid a shadow-casting light at every torch.
  const flames = new THREE.Group()
  const flameGeo = new THREE.OctahedronGeometry(1)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffad59, toneMapped: false })
  for (const [x, z] of [[-4.4, -8], [4.4, -8], [-4, -17], [4, -17], [-7, 17], [7, 17]]) {
    put('tapered', 'iron', [x, 1.2, z], [0.14, 2.4, 0.14])
    put('cone', 'gold', [x, 2.35, z], [0.35, 0.4, 0.35], [Math.PI, 0, 0])
    const flame = new THREE.Mesh(flameGeo, flameMat)
    flame.position.set(x, 2.85, z)
    flame.scale.set(0.22, 0.55, 0.22)
    flames.add(flame)
  }
  scene.add(flames)
  const torchGlow = new THREE.PointLight(0xffaa55, 16, 12, 2)
  torchGlow.position.set(0, 4, -15)
  scene.add(torchGlow)
  for (let i = 0; i < 85; i++) {
    const x = ((i * 17) % 66) - 33
    const z = ((i * 31) % 86) - 52
    if (Math.abs(x) < 24 && z > -44 && z < 25 && !(z > -18 && z < -10)) continue
    put('box', 'ripple', [x, -1.075, z], [1 + i % 3, 0.015, 0.045], [0, 0.15, 0], false)
  }
  flush()
  scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x89717a, 1.65))
  const sun = new THREE.DirectionalLight(0xffd6a0, 2.4)
  sun.position.set(-32, 55, 25)
  sun.target.position.set(0, 0, -8)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 45, bottom: -40, near: 1, far: 145 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.06
  scene.add(sun, sun.target)

  let elapsed = 0
  let disposed = false
  return {
    scene, world: COURTYARD_WORLD, spawn: COURTYARD_WORLD.spawn,
    update(dt) {
      if (disposed) return
      elapsed += dt
      goblin.update(elapsed)
      flames.children.forEach((flame, i) => { flame.scale.y = 0.5 + Math.sin(elapsed * 7 + i) * 0.07; flame.rotation.y = elapsed * 0.7 + i })
    },
    dispose() { if (!disposed) { disposed = true; disposeScene(scene) } },
  }
}
