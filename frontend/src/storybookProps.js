import * as THREE from 'three'

function sculptor(root, colors, { orb = 1, sides = 8 } = {}) {
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.72 })]))
  root.userData.ownedMaterials = Object.values(materials)
  const sphere = orb >= 2 ? new THREE.SphereGeometry(1, 24, 18) : new THREE.IcosahedronGeometry(1, orb)
  return (shape, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], parent = root) => {
    const geometry = shape === 'orb' ? sphere : shape === 'cone' ? new THREE.ConeGeometry(1, 1, sides) : shape === 'ring' ? new THREE.TorusGeometry(1, 0.14, 8, 24) : shape === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 1, sides) : new THREE.BoxGeometry(1, 1, 1)
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

// The Storykeeper Dragon lives in its own module: it is a much larger, bending model.
export { createStoryDragon } from './dragonModel.js'

export function createBigBadWolf() {
  const root = new THREE.Group(); root.name = 'Big Bad Wolf'
  const put = sculptor(root, {
    fur: 0x9aa3ad, dusk: 0x7b848f, mane: 0x5e666f, belly: 0xc0c6ce,
    muscle: 0x8b949e, scar: 0x8a2230, gum: 0x54141c, teeth: 0xf4ebd4,
    claw: 0xe4d6bc, nose: 0x2a2e34, eye: 0xf7f4ec, slit: 0x1a1c22,
  }, { orb: 2, sides: 16 })
  const body = new THREE.Group(); root.add(body)
  put('orb', 'fur', [0, 1.28, 0.05], [0.58, 0.5, 2.05], [0.08, 0, 0], body)
  put('orb', 'belly', [0, 1.02, 0.18], [0.36, 0.28, 1.55], [0.14, 0, 0], body)
  put('orb', 'muscle', [0, 1.38, 0.72], [0.52, 0.38, 0.55], [0.28, 0, 0], body)
  put('orb', 'mane', [0, 1.52, 0.15], [0.42, 0.32, 0.85], [0.18, 0, 0], body)
  for (let i = 0; i < 5; i++) {
    put('cone', 'mane', [0, 1.68 - i * 0.04, 0.55 - i * 0.38], [0.07 + i * 0.01, 0.38 - i * 0.03, 0.07], [0.6 + i * 0.08, 0, 0], body)
  }
  put('orb', 'scar', [0.16, 1.36, 0.62], [0.05, 0.03, 0.38], [0.35, 0.25, 0.15], body)
  for (const side of [-1, 1]) {
    put('orb', 'muscle', [side * 0.42, 1.42, 0.78], [0.28, 0.26, 0.32], [0.15, 0, 0], body)
    put('orb', 'muscle', [side * 0.34, 1.22, 0.12], [0.16, 0.14, 0.28], [0, 0, 0], body)
    put('orb', 'muscle', [side * 0.4, 1.4, -0.82], [0.32, 0.3, 0.38], [-0.1, 0, 0], body)
    put('cylinder', 'muscle', [side * 0.36, 0.92, 0.98], [0.15, 0.62, 0.16], [0.22, 0, side * 0.06], body)
    put('cylinder', 'fur', [side * 0.4, 0.42, 1.12], [0.09, 0.72, 0.1], [0.12, 0, side * 0.04], body)
    put('orb', 'dusk', [side * 0.42, 0.12, 1.28], [0.14, 0.09, 0.26], [0, 0, 0], body)
    for (const x of [-0.07, 0, 0.07]) put('cone', 'claw', [side * 0.42 + x, 0.05, 1.46], [0.032, 0.17, 0.032], [1.25, 0, 0], body)
    put('cylinder', 'muscle', [side * 0.34, 0.9, -0.88], [0.17, 0.68, 0.18], [-0.16, 0, -side * 0.05], body)
    put('cylinder', 'fur', [side * 0.38, 0.4, -0.68], [0.1, 0.74, 0.11], [-0.08, 0, -side * 0.04], body)
    put('orb', 'dusk', [side * 0.4, 0.11, -0.5], [0.15, 0.09, 0.28], [0, 0, 0], body)
    for (const x of [-0.07, 0, 0.07]) put('cone', 'claw', [side * 0.4 + x, 0.05, -0.32], [0.032, 0.15, 0.032], [1.15, 0, 0], body)
  }
  const head = new THREE.Group(); head.position.set(0, 1.72, 1.62); body.add(head)
  put('orb', 'fur', [0, 0.06, 0], [0.58, 0.5, 0.52], [0, 0, 0], head)
  put('orb', 'mane', [0, 0.36, -0.16], [0.52, 0.32, 0.38], [-0.35, 0, 0], head)
  for (const side of [-1, 1]) put('orb', 'fur', [side * 0.32, 0.02, 0.18], [0.2, 0.18, 0.2], [0, 0, 0], head)
  put('orb', 'fur', [0, -0.02, 0.36], [0.4, 0.26, 0.34], [0, 0, 0], head)
  put('cylinder', 'dusk', [0, -0.05, 0.78], [0.22, 0.7, 0.13], [Math.PI / 2, 0, 0], head)
  put('orb', 'dusk', [0, -0.05, 1.1], [0.2, 0.12, 0.14], [0, 0, 0], head)
  put('box', 'nose', [0, 0.01, 1.22], [0.18, 0.09, 0.05], [0, 0, 0], head)
  put('orb', 'scar', [0.14, 0.04, 0.7], [0.035, 0.02, 0.36], [0.1, 0.3, 0.08], head)
  for (const side of [-1, 1]) {
    const ear = put('cone', 'mane', [side * 0.38, 0.62, -0.12], [0.16, 0.78, 0.11], [0.15, 0, -side * 0.55], head)
    ear.rotation.x = -0.55
    put('cone', 'scar', [side * 0.38, 0.54, -0.02], [0.06, 0.36, 0.04], [0.2, 0, -side * 0.55], head)
    const eye = put('orb', 'eye', [side * 0.26, 0.14, 0.4], [0.15, 0.12, 0.07], [0, 0, 0], head)
    eye.material.emissive.setHex(0xfff6e8)
    eye.material.emissiveIntensity = 0.85
    put('orb', 'slit', [side * 0.26, 0.14, 0.46], [0.025, 0.1, 0.025], [0, 0, 0], head)
    put('orb', 'mane', [side * 0.24, 0.24, 0.32], [0.12, 0.05, 0.06], [0, 0, side * 0.2], head)
    put('cone', 'teeth', [side * 0.14, -0.18, 0.95], [0.04, 0.2, 0.04], [2.85, 0, side * 0.08], head)
    put('cone', 'teeth', [side * 0.18, -0.16, 0.72], [0.035, 0.16, 0.035], [2.9, 0, side * 0.14], head)
  }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.18, 0.38); head.add(jaw)
  put('cylinder', 'dusk', [0, -0.06, 0.5], [0.18, 0.68, 0.07], [1.68, 0, 0], jaw)
  put('orb', 'dusk', [0, -0.05, 0.82], [0.16, 0.07, 0.1], [0, 0, 0], jaw)
  put('orb', 'gum', [0, 0.03, 0.5], [0.26, 0.045, 0.48], [0, 0, 0], jaw)
  for (const side of [-1, 1]) {
    put('cone', 'teeth', [side * 0.12, 0.06, 0.7], [0.038, 0.18, 0.038], [0.12, 0, side * 0.08], jaw)
    put('cone', 'teeth', [side * 0.16, 0.04, 0.5], [0.03, 0.14, 0.03], [0.16, 0, side * 0.12], jaw)
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.15, -1.85); body.add(tail)
  put('cone', 'mane', [0, 0.04, -0.95], [0.16, 2.05, 0.16], [-1.25, 0, 0], tail)
  put('cone', 'fur', [0, -0.18, -1.7], [0.1, 0.85, 0.1], [-1.45, 0, 0], tail)
  return {
    root,
    update(time) {
      const growl = 0.5 + 0.5 * Math.sin(time * 1.65)
      body.position.y = Math.sin(time * 2.1) * 0.025
      head.rotation.y = Math.sin(time * 0.42) * 0.07
      head.rotation.x = -0.16 + Math.sin(time * 1.05) * 0.045
      jaw.rotation.x = 0.22 + growl * 0.2
      tail.rotation.y = Math.sin(time * 1.25) * 0.1
      tail.rotation.x = 0.15 + Math.sin(time * 1.9) * 0.06
    },
  }
}

export function createStoryPrincess() {
  const root = new THREE.Group(); root.name = 'Storywood Princess'
  const put = sculptor(root, { gown: 0xe2a1ca, trim: 0xffe4bd, skin: 0xf3cfb1, hair: 0x8b533f, gold: 0xf3ca70, eye: 0x3c3249 })
  put('cone', 'gown', [0, 0.75, 0], [0.75, 1.5, 0.75])
  put('orb', 'trim', [0, 1.35, 0.05], [0.35, 0.5, 0.3])
  put('orb', 'hair', [0, 2, -0.08], [0.43, 0.5, 0.35])
  put('orb', 'skin', [0, 2.02, 0.12], [0.32, 0.36, 0.25])
  for (const side of [-1, 1]) { put('orb', 'gown', [side * 0.4, 1.5, 0], [0.23, 0.22, 0.23]); put('cylinder', 'skin', [side * 0.49, 1.17, 0.07], [0.09, 0.5, 0.09], [0, 0, side * 0.14]); put('orb', 'eye', [side * 0.12, 2.05, 0.35], [0.035, 0.045, 0.025]) }
  put('cylinder', 'gold', [0, 2.37, 0], [0.36, 0.15, 0.36])
  for (let i = 0; i < 5; i++) { const angle = i * Math.PI * 2 / 5; put('cone', 'gold', [Math.sin(angle) * 0.29, 2.56, Math.cos(angle) * 0.29], [0.09, 0.35, 0.09]) }
  return root
}
