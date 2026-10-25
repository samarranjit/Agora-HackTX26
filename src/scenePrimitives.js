import * as THREE from 'three'

function archWindow() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.5, 0)
  shape.lineTo(0.5, 0)
  shape.lineTo(0.5, 1.5)
  shape.absarc(0, 1.5, 0.5, 0, Math.PI, false)
  shape.closePath()
  return new THREE.ShapeGeometry(shape, 10)
}

function archFrame() {
  const shape = new THREE.Shape()
  shape.moveTo(-1.3, 0)
  shape.lineTo(1.3, 0)
  shape.lineTo(1.3, 1.7)
  shape.absarc(0, 1.7, 1.3, 0, Math.PI, false)
  shape.closePath()
  const hole = new THREE.Path()
  hole.moveTo(-1, 0.02)
  hole.lineTo(-1, 1.7)
  hole.absarc(0, 1.7, 1, Math.PI, 0, true)
  hole.lineTo(1, 0.02)
  hole.closePath()
  shape.holes.push(hole)
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 12 })
}

function pennant() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.5, 0.5)
  shape.lineTo(0.5, 0.5)
  shape.lineTo(0.5, -0.3)
  shape.lineTo(0, -0.5)
  shape.lineTo(-0.5, -0.3)
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

// Repeated details become instances grouped by material and geometry, not hundreds of draw calls.
export function createSceneBuilder(scene, materials) {
  const factories = {
    box: () => new THREE.BoxGeometry(1, 1, 1),
    cylinder: () => new THREE.CylinderGeometry(1, 1, 1, 12),
    tapered: () => new THREE.CylinderGeometry(0.85, 1, 1, 12),
    cone: () => new THREE.ConeGeometry(1, 1, 12),
    roof: () => new THREE.ConeGeometry(1, 1, 4),
    orb: () => new THREE.IcosahedronGeometry(1, 1),
    gem: () => new THREE.OctahedronGeometry(1),
    ring: () => new THREE.TorusGeometry(1, 0.09, 6, 24),
    window: archWindow,
    arch: archFrame,
    banner: pennant,
  }
  const geometries = new Map()
  const batches = new Map()
  const transform = new THREE.Object3D()
  const put = (shape, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], shadow = true) => {
    if (!geometries.has(shape)) geometries.set(shape, factories[shape]())
    const key = `${shape}:${material}:${shadow}`
    if (!batches.has(key)) batches.set(key, { geometry: geometries.get(shape), material: materials[material], shadow, matrices: [] })
    transform.position.set(...position)
    transform.scale.set(...scale)
    transform.rotation.set(...rotation)
    transform.updateMatrix()
    batches.get(key).matrices.push(transform.matrix.clone())
  }
  const flush = () => {
    batches.forEach(({ geometry, material, shadow, matrices }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
      mesh.castShadow = shadow
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      scene.add(mesh)
    })
    batches.clear()
  }
  return { put, flush }
}
