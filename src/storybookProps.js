import * as THREE from 'three'

function sculptor(root, colors) {
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.72 })]))
  root.userData.ownedMaterials = Object.values(materials)
  const sphere = new THREE.IcosahedronGeometry(1, 1)
  return (shape, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], parent = root) => {
    const geometry = shape === 'orb' ? sphere : shape === 'cone' ? new THREE.ConeGeometry(1, 1, 8) : shape === 'ring' ? new THREE.TorusGeometry(1, 0.14, 6, 18) : shape === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 1, 8) : new THREE.BoxGeometry(1, 1, 1)
    const mesh = new THREE.Mesh(geometry, materials[material])
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation)
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh)
    return mesh
  }
}

export function createFairytaleItem(id) {
  const root = new THREE.Group()
  const put = sculptor(root, { gold: 0xe8be70, blue: 0x93e5ed, red: 0xb53456, darkRed: 0x752844, wood: 0x6e5344, cream: 0xffebc4, purple: 0x8554af, green: 0x9ee2a4, cork: 0xbf9662 })
  if (id === 'trident') {
    put('cylinder', 'gold', [0, 0, 0], [0.055, 1.7, 0.055])
    put('box', 'gold', [0, 0.6, 0], [0.8, 0.09, 0.09])
    for (const x of [-0.36, 0, 0.36]) { put('cylinder', 'gold', [x, 0.85, 0], [0.045, 0.55, 0.045]); put('cone', 'blue', [x, 1.19, 0], [0.1, 0.25, 0.1]) }
    put('orb', 'blue', [0, 0.3, 0], [0.13, 0.2, 0.13])
  } else if (id === 'cloak') {
    put('cone', 'red', [0, 0, 0], [0.58, 1.3, 0.32])
    put('orb', 'darkRed', [0, 0.63, 0], [0.3, 0.35, 0.25])
    put('orb', 'red', [0, 0.7, 0.1], [0.28, 0.28, 0.2])
    put('orb', 'gold', [0, 0.42, 0.26], [0.075, 0.075, 0.05])
  } else if (id === 'slipper') {
    put('orb', 'blue', [0.12, -0.1, 0], [0.62, 0.18, 0.27])
    put('ring', 'blue', [-0.2, 0.05, 0], [0.26, 0.26, 0.22], [Math.PI / 2, 0, 0])
    put('box', 'blue', [-0.38, -0.34, 0], [0.1, 0.42, 0.15])
    put('orb', 'cream', [0.4, 0.08, 0], [0.12, 0.1, 0.12])
  } else if (id === 'eggs') {
    put('ring', 'wood', [0, -0.25, 0], [0.6, 0.5, 0.6], [Math.PI / 2, 0, 0])
    for (const [x, z] of [[-0.25, 0.06], [0.2, 0.16], [0, -0.23]]) put('orb', 'cream', [x, -0.1, z], [0.2, 0.29, 0.2])
  } else if (id === 'potion') {
    put('orb', 'blue', [0, -0.05, 0], [0.4, 0.48, 0.4])
    put('orb', 'purple', [0, -0.12, 0.08], [0.34, 0.3, 0.34])
    put('cylinder', 'blue', [0, 0.48, 0], [0.16, 0.4, 0.16])
    put('cylinder', 'cork', [0, 0.73, 0], [0.17, 0.15, 0.17])
    put('box', 'cream', [0, 0, 0.38], [0.28, 0.25, 0.04], [0, 0, -0.12])
    put('orb', 'green', [0.08, 0.12, 0.4], [0.07, 0.07, 0.035])
  }
  root.name = `fairytale-${id}`
  return root
}

export function createStoryDragon() {
  const root = new THREE.Group()
  root.name = 'Storykeeper Dragon'
  const put = sculptor(root, { plum: 0x695688, belly: 0xd5b48b, wing: 0xa95c7f, horn: 0xffdda1, eye: 0x241e34, gold: 0xf2c164 })
  put('orb', 'plum', [0, 1.6, 0], [1.5, 1.6, 2])
  put('orb', 'belly', [0, 1.55, 1.1], [0.9, 1.1, 0.9])
  const head = new THREE.Group(); head.position.set(0, 3, 1.3); root.add(head)
  put('orb', 'plum', [0, 0, 0], [1, 0.85, 0.85], [0, 0, 0], head)
  put('orb', 'plum', [0, -0.25, 0.8], [0.85, 0.45, 0.8], [0, 0, 0], head)
  for (const side of [-1, 1]) {
    put('cone', 'horn', [side * 0.65, 0.9, -0.1], [0.17, 1, 0.17], [0.25, 0, -side * 0.3], head)
    put('orb', 'gold', [side * 0.64, 0.15, 0.59], [0.26, 0.3, 0.12], [0, 0, 0], head)
    put('orb', 'eye', [side * 0.63, 0.14, 0.7], [0.08, 0.18, 0.05], [0, 0, 0], head)
    put('orb', 'plum', [side * 1.25, 0.55, 0.65], [0.5, 0.6, 0.8])
    for (let i = 0; i < 3; i++) put('cone', 'horn', [side * 1.25 + (i - 1) * 0.2, 0.3, 1.37], [0.09, 0.35, 0.09], [Math.PI / 2, 0, 0])
  }
  const wings = []
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(side * 1.1, 2.3, -0.2); root.add(wing)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, side * 2.8, 2.4, -0.5, side * 2.3, -0.3, -1.2, 0, 0, 0, side * 2.3, -0.3, -1.2, side * 0.5, -0.6, -1.9], 3))
    geometry.computeVertexNormals()
    const membrane = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xaa6488, side: THREE.DoubleSide, flatShading: true, roughness: 0.9 }))
    membrane.castShadow = true; wing.add(membrane); wings.push(wing)
    put('cone', 'plum', [side * 1.3, 1.2, -0.25], [0.14, 3.2, 0.14], [0, 0, -side * 0.85], wing)
  }
  const tail = new THREE.Group(); tail.position.set(0, 1, -1.5); root.add(tail)
  put('cone', 'plum', [0, -0.3, -1.4], [0.6, 3.2, 0.6], [-Math.PI / 2, 0, 0], tail)
  for (let i = 0; i < 4; i++) put('cone', 'gold', [0, 2.8 - i * 0.2, -0.2 - i * 0.48], [0.2, 0.55, 0.2])
  return { root, update(time, won = false) { head.rotation.y = Math.sin(time * 0.6) * 0.12; head.position.y = 3 + Math.sin(time * 1.5) * 0.05; wings.forEach((w, i) => { w.rotation.z = Math.sin(time * 0.8) * 0.08 * (i ? 1 : -1) }); tail.rotation.y = Math.sin(time) * 0.12; root.rotation.x = won ? -0.08 : 0 } }
}
