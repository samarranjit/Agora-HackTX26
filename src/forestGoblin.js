import * as THREE from 'three'

// Faces the southern garden path. No assets, requests, or progression state.
export const GOBLIN_SPOT = Object.freeze({ x: 5.5, z: 14, range: 2.7 })
export function nearGoblin(position) {
  return Math.abs(position.y - 1.6) < 1.8 && Math.hypot(position.x - GOBLIN_SPOT.x, position.z - GOBLIN_SPOT.z) < GOBLIN_SPOT.range
}

export function createForestGoblin() {
  const root = new THREE.Group()
  root.name = 'Forest Goblin'
  root.position.set(GOBLIN_SPOT.x, 0, GOBLIN_SPOT.z)
  const colors = { skin: 0x78a953, inner: 0x4c793e, tunic: 0x653e76, belt: 0x543d30, gold: 0xe8bb63, white: 0xffecc7, eye: 0x211e30 }
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 })]))
  const part = (parent, geometry, material, position, scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, materials[material])
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const orb = new THREE.IcosahedronGeometry(1, 0)
  const limb = new THREE.CylinderGeometry(0.12, 0.15, 0.55, 6)
  const body = new THREE.Group()
  root.add(body)
  part(body, new THREE.CylinderGeometry(0.3, 0.46, 0.75, 7), 'tunic', [0, 0.95, 0])
  part(body, new THREE.CylinderGeometry(0.39, 0.4, 0.13, 7), 'belt', [0, 0.82, 0])
  part(body, orb, 'gold', [0, 0.83, 0.38], [0.1, 0.1, 0.05])
  for (const side of [-1, 1]) {
    part(body, limb, 'skin', [side * 0.22, 0.39, 0])
    part(body, orb, 'belt', [side * 0.23, 0.14, 0.1], [0.2, 0.15, 0.3])
    const arm = part(body, limb, 'skin', [side * 0.48, 1.01, 0])
    arm.rotation.z = side * 0.22
    part(body, orb, 'skin', [side * 0.55, 0.72, 0.02], [0.15, 0.18, 0.15])
  }
  const head = new THREE.Group()
  head.position.y = 1.6
  body.add(head)
  part(head, orb, 'skin', [0, 0, 0], [0.48, 0.42, 0.4])
  part(head, orb, 'skin', [0, -0.07, 0.4], [0.14, 0.13, 0.24])
  for (const side of [-1, 1]) {
    const ear = part(head, new THREE.ConeGeometry(0.22, 0.6, 3), 'skin', [side * 0.55, 0.1, 0])
    ear.rotation.z = -side * 1.15
    part(head, orb, 'white', [side * 0.19, 0.07, 0.32], [0.14, 0.12, 0.06])
    part(head, orb, 'eye', [side * 0.18, 0.07, 0.37], [0.055, 0.075, 0.025])
    const brow = part(head, new THREE.BoxGeometry(0.29, 0.06, 0.08), 'inner', [side * 0.19, 0.19, 0.31])
    brow.rotation.z = side * 0.22
    part(head, new THREE.ConeGeometry(0.065, 0.18, 4), 'white', [side * 0.17, -0.2, 0.3])
  }
  return { root, update(time) { body.position.y = Math.sin(time * 2) * 0.035; head.rotation.y = Math.sin(time * 0.7) * 0.13 } }
}
