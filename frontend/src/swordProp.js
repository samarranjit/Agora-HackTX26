import * as THREE from 'three'

export function createSwordProp(camera) {
  const sword = new THREE.Group()
  sword.position.set(0.48, -0.48, -0.85)
  sword.rotation.z = -0.3
  sword.scale.setScalar(0.72)
  const material = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false })
  const silver = material(0xdce8f2)
  const shade = material(0x8fa6c2)
  const gold = material(0xe3b96f)
  const grip = material(0x4c3268)
  const gem = material(0xae83dc)
  const add = (geometry, surface, x, y, z = 0) => {
    const mesh = new THREE.Mesh(geometry, surface)
    mesh.position.set(x, y, z)
    mesh.renderOrder = 1000
    mesh.frustumCulled = false
    sword.add(mesh)
    return mesh
  }
  const blade = new THREE.Shape()
  blade.moveTo(-0.065, 0)
  blade.lineTo(0.065, 0)
  blade.lineTo(0.05, 0.52)
  blade.lineTo(0, 0.68)
  blade.lineTo(-0.05, 0.52)
  blade.closePath()
  add(new THREE.ShapeGeometry(blade), silver, 0, 0.1)
  const facet = new THREE.Shape()
  facet.moveTo(0, 0)
  facet.lineTo(0.065, 0)
  facet.lineTo(0.05, 0.52)
  facet.lineTo(0, 0.68)
  facet.closePath()
  add(new THREE.ShapeGeometry(facet), shade, 0, 0.1, 0.002)
  add(new THREE.BoxGeometry(0.32, 0.055, 0.07), gold, 0, 0.08)
  add(new THREE.OctahedronGeometry(0.075), gem, 0, 0.08, 0.04)
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), grip, 0, -0.06)
  for (const y of [-0.13, -0.08, -0.03]) add(new THREE.TorusGeometry(0.036, 0.007, 4, 8), gold, 0, y).rotation.x = Math.PI / 2
  add(new THREE.OctahedronGeometry(0.055), gold, 0, -0.2)
  camera.add(sword)
  return sword
}
