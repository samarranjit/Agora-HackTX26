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
  const colors = { skin: 0x78a953, inner: 0x4c793e, tunic: 0x653e76, fold: 0x553267, belt: 0x543d30, gold: 0xe8bb63, white: 0xffecc7, eye: 0x211e30, nail: 0xd9c48a }
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.82 })]))
  root.userData.ownedMaterials = Object.values(materials)
  const part = (parent, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, materials[material])
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.rotation.set(...rotation)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const orb = new THREE.IcosahedronGeometry(1, 2)
  const limb = new THREE.CylinderGeometry(0.1, 0.14, 0.42, 12)
  const body = new THREE.Group()
  root.add(body)
  part(body, new THREE.CylinderGeometry(0.28, 0.44, 0.78, 12), 'tunic', [0, 0.98, 0])
  part(body, new THREE.CylinderGeometry(0.3, 0.32, 0.12, 12), 'fold', [0, 1.28, 0])
  part(body, new THREE.CylinderGeometry(0.38, 0.4, 0.12, 12), 'belt', [0, 0.82, 0])
  part(body, orb, 'gold', [0, 0.83, 0.4], [0.08, 0.08, 0.04])
  part(body, new THREE.TorusGeometry(0.07, 0.018, 8, 16), 'gold', [0, 0.83, 0.42], [1, 1, 1], [Math.PI / 2, 0, 0])
  for (const side of [-1, 1]) {
    part(body, new THREE.CylinderGeometry(0.12, 0.15, 0.38, 12), 'skin', [side * 0.2, 0.48, 0.02])
    part(body, new THREE.CylinderGeometry(0.09, 0.11, 0.34, 12), 'skin', [side * 0.22, 0.24, 0.06], [1, 1, 1], [0.15, 0, 0])
    part(body, orb, 'belt', [side * 0.23, 0.1, 0.16], [0.16, 0.1, 0.26])
    for (const x of [-0.05, 0.05]) part(body, new THREE.ConeGeometry(0.03, 0.1, 8), 'nail', [side * 0.23 + x, 0.05, 0.32], [1, 1, 1], [1.15, 0, 0])
    part(body, new THREE.CylinderGeometry(0.11, 0.13, 0.36, 12), 'skin', [side * 0.46, 1.12, 0.02], [1, 1, 1], [0, 0, side * 0.28])
    part(body, limb, 'skin', [side * 0.58, 0.86, 0.06], [1, 1, 1], [0.35, 0, side * 0.15])
    part(body, orb, 'skin', [side * 0.62, 0.68, 0.12], [0.13, 0.12, 0.14])
    for (const [dx, dz] of [[-0.05, 0.08], [0.05, 0.08], [0, 0.12]]) {
      part(body, new THREE.ConeGeometry(0.028, 0.12, 8), 'nail', [side * 0.62 + dx, 0.6, 0.18 + dz], [1, 1, 1], [1.1, 0, 0])
    }
  }
  const head = new THREE.Group()
  head.position.y = 1.62
  body.add(head)
  part(head, orb, 'skin', [0, 0.02, 0], [0.46, 0.4, 0.4])
  part(head, orb, 'skin', [0, -0.08, 0.32], [0.22, 0.16, 0.2])
  part(head, orb, 'skin', [0, -0.14, 0.48], [0.12, 0.1, 0.16])
  part(head, orb, 'inner', [0, 0.18, 0.02], [0.2, 0.08, 0.18])
  for (const side of [-1, 1]) {
    part(head, orb, 'skin', [side * 0.28, -0.02, 0.16], [0.16, 0.16, 0.14])
    const ear = part(head, new THREE.ConeGeometry(0.16, 0.62, 10), 'skin', [side * 0.52, 0.16, -0.02], [1, 1, 1], [0.1, 0, -side * 1.05])
    ear.rotation.x = -0.15
    part(head, new THREE.ConeGeometry(0.08, 0.36, 10), 'inner', [side * 0.5, 0.14, 0.04], [1, 1, 1], [0.15, 0, -side * 1.05])
    part(head, orb, 'white', [side * 0.17, 0.08, 0.34], [0.12, 0.11, 0.05])
    part(head, orb, 'eye', [side * 0.16, 0.08, 0.38], [0.05, 0.07, 0.025])
    part(head, new THREE.BoxGeometry(0.26, 0.045, 0.07), 'inner', [side * 0.17, 0.18, 0.32], [1, 1, 1], [0, 0, side * 0.28])
    part(head, orb, 'inner', [side * 0.06, -0.04, 0.54], [0.03, 0.025, 0.03])
    part(head, new THREE.ConeGeometry(0.05, 0.16, 8), 'white', [side * 0.1, -0.2, 0.4], [1, 1, 1], [0.2, 0, 0])
  }
  part(head, orb, 'inner', [0.18, 0.12, 0.28], [0.05, 0.045, 0.04])
  return { root, update(time) { body.position.y = Math.sin(time * 2) * 0.035; head.rotation.y = Math.sin(time * 0.7) * 0.13 } }
}
