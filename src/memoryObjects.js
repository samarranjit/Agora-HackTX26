import * as THREE from 'three'

export function createMemoryObject(memory) {
  const group = new THREE.Group()
  group.userData.memoryId = memory.id
  const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.12 })
  const body = material(memory.color)
  const gold = material(0xffd45c)
  const white = material(0xfff6e9)
  const add = (geometry, surface, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, surface)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    group.add(mesh)
    return mesh
  }

  if (memory.shape === 'power-bean') {
    const bean = add(new THREE.SphereGeometry(0.28, 24, 16), body)
    bean.scale.set(1.6, 0.85, 0.8)
    bean.rotation.z = 0.25
    for (let i = -1; i <= 1; i++) {
      const fold = add(new THREE.TorusGeometry(0.13, 0.025, 8, 16), gold, i * 0.19, 0, 0.2)
      fold.scale.x = 0.55
      const bolt = add(new THREE.ConeGeometry(0.07, 0.3, 3), gold, i * 0.22, 0.42, 0)
      bolt.rotation.z = -0.35
    }
  } else if (memory.shape === 'royal-vault') {
    add(new THREE.BoxGeometry(0.55, 0.48, 0.42), body)
    add(new THREE.TorusGeometry(0.13, 0.025, 8, 20), gold, 0, 0, 0.23)
    add(new THREE.BoxGeometry(0.46, 0.08, 0.35), gold, 0, 0.31)
    for (let i = -1; i <= 1; i++) {
      add(new THREE.ConeGeometry(0.09, 0.23, 4), gold, i * 0.16, 0.45)
    }
  } else {
    add(new THREE.SphereGeometry(0.27, 24, 16), body)
    add(new THREE.CylinderGeometry(0.21, 0.21, 0.14, 16), white, 0, 0.3)
    for (let i = -1; i <= 1; i++) {
      add(new THREE.SphereGeometry(0.13, 12, 10), white, i * 0.13, 0.4)
    }
    const skewer = add(new THREE.CylinderGeometry(0.018, 0.018, 0.65, 8), gold, 0.4, 0.1)
    skewer.rotation.z = -0.2
    const pink = material(0xff70ab)
    for (let i = -1; i <= 1; i++) {
      add(new THREE.SphereGeometry(0.085, 12, 10), pink, 0.4 + i * 0.03, 0.1 + i * 0.16)
    }
  }

  // Friendly eyes make each exhibit feel like a little character.
  const ink = material(0x272438)
  for (const x of [-0.09, 0.09]) {
    add(new THREE.SphereGeometry(0.035, 10, 8), white, x, 0.05, 0.25)
    add(new THREE.SphereGeometry(0.018, 8, 8), ink, x, 0.05, 0.28)
  }
  return group
}
