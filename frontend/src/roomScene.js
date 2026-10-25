import * as THREE from 'three'
import { createMemoryObject } from './memoryObjects.js'
import { disposeScene } from './sceneResources.js'

export const ROOM_SIZE = 12
const WALL_HEIGHT = 3.5
const PLAYER_RADIUS = 0.35

export const PEDESTALS = [
  { x: -3.2, z: -3.4, radius: 0.38 },
  { x: 0, z: -3.6, radius: 0.38 },
  { x: 3.2, z: -3.4, radius: 0.38 },
]

export function createRoomScene(memories) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1714)
  scene.fog = new THREE.Fog(0x1a1714, 10, 22)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x6b5344, roughness: 0.9 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE),
    new THREE.MeshStandardMaterial({ color: 0xcbb89a, roughness: 1 }),
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = WALL_HEIGHT
  scene.add(ceiling)

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xe7d7c1,
    roughness: 0.85,
  })
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3728,
    roughness: 0.7,
  })

  const half = ROOM_SIZE / 2
  const wallThickness = 0.18

  const north = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_SIZE, WALL_HEIGHT, wallThickness),
    wallMaterial,
  )
  north.position.set(0, WALL_HEIGHT / 2, -half)
  north.castShadow = true
  north.receiveShadow = true
  scene.add(north)

  const east = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, WALL_HEIGHT, ROOM_SIZE),
    wallMaterial,
  )
  east.position.set(half, WALL_HEIGHT / 2, 0)
  east.castShadow = true
  east.receiveShadow = true
  scene.add(east)

  const west = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, WALL_HEIGHT, ROOM_SIZE),
    wallMaterial,
  )
  west.position.set(-half, WALL_HEIGHT / 2, 0)
  west.castShadow = true
  west.receiveShadow = true
  scene.add(west)

  const doorWidth = 1.5
  const doorHeight = 2.4
  const sideWidth = (ROOM_SIZE - doorWidth) / 2

  const southLeft = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, WALL_HEIGHT, wallThickness),
    wallMaterial,
  )
  southLeft.position.set(-(doorWidth / 2 + sideWidth / 2), WALL_HEIGHT / 2, half)
  southLeft.receiveShadow = true
  scene.add(southLeft)

  const southRight = southLeft.clone()
  southRight.position.x *= -1
  scene.add(southRight)

  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth, WALL_HEIGHT - doorHeight, wallThickness),
    wallMaterial,
  )
  lintel.position.set(0, doorHeight + (WALL_HEIGHT - doorHeight) / 2, half)
  scene.add(lintel)

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d2918,
    roughness: 0.6,
  })
  const frameLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, doorHeight, 0.22),
    frameMaterial,
  )
  frameLeft.position.set(-doorWidth / 2, doorHeight / 2, half)
  scene.add(frameLeft)
  const frameRight = frameLeft.clone()
  frameRight.position.x = doorWidth / 2
  scene.add(frameRight)
  const frameTop = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth + 0.12, 0.12, 0.22),
    frameMaterial,
  )
  frameTop.position.set(0, doorHeight, half)
  scene.add(frameTop)

  const doorPivot = new THREE.Group()
  doorPivot.position.set(-doorWidth / 2 + 0.04, 0, half)
  scene.add(doorPivot)
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth - 0.08, doorHeight - 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x7a3e22, roughness: 0.55 }),
  )
  door.position.set((doorWidth - 0.08) / 2, (doorHeight - 0.08) / 2, 0)
  door.castShadow = true
  doorPivot.add(door)

  // A small landing makes passing the original doorway a real finish line.
  const landing = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 3),
    new THREE.MeshStandardMaterial({ color: 0x526f62, roughness: 0.8 }),
  )
  landing.rotation.x = -Math.PI / 2
  landing.position.set(0, 0.005, half + 1.5)
  landing.receiveShadow = true
  scene.add(landing)

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.8,
      roughness: 0.3,
    }),
  )
  handle.position.set(0.55, 0, -0.06)
  door.add(handle)

  const baseboardGeo = new THREE.BoxGeometry(ROOM_SIZE, 0.12, 0.06)
  ;[-half + 0.12, half - 0.12].forEach((z) => {
    if (z > 0) {
      for (const side of [-1, 1]) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, 0.12, 0.06), trimMaterial)
        board.position.set(side * (doorWidth / 2 + sideWidth / 2), 0.06, z)
        scene.add(board)
      }
    } else {
      const board = new THREE.Mesh(baseboardGeo, trimMaterial)
      board.position.set(0, 0.06, z)
      scene.add(board)
    }
  })
  const sideBoardGeo = new THREE.BoxGeometry(0.06, 0.12, ROOM_SIZE)
  ;[-half + 0.12, half - 0.12].forEach((x) => {
    const board = new THREE.Mesh(sideBoardGeo, trimMaterial)
    board.position.set(x, 0.06, 0)
    scene.add(board)
  })

  const objects = []
  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d7b68,
    roughness: 0.55,
  })
  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0xcfc3b0,
    roughness: 0.45,
  })

  PEDESTALS.forEach((spot, index) => {
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.9, 16),
      pedestalMaterial,
    )
    column.position.set(spot.x, 0.45, spot.z)
    column.castShadow = true
    column.receiveShadow = true
    scene.add(column)

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.08, 16),
      topMaterial,
    )
    cap.position.set(spot.x, 0.94, spot.z)
    cap.castShadow = true
    cap.receiveShadow = true
    scene.add(cap)

    const memory = memories[index]
    if (memory) {
      const object = createMemoryObject(memory)
      object.position.set(spot.x, 1.4, spot.z)
      scene.add(object)
      objects.push(object)
    }
  })

  const hemi = new THREE.HemisphereLight(0xfff1dd, 0x4a3a2a, 0.7)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight(0xffe6c8, 1.05)
  sun.position.set(3.5, 6.5, 2)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 20
  sun.shadow.camera.left = -8
  sun.shadow.camera.right = 8
  sun.shadow.camera.top = 8
  sun.shadow.camera.bottom = -8
  scene.add(sun)

  const lamp = new THREE.PointLight(0xffd7a0, 18, 16, 2)
  lamp.position.set(0, WALL_HEIGHT - 0.45, 0)
  lamp.castShadow = true
  scene.add(lamp)

  const doorLight = new THREE.PointLight(0xfff3d0, 6, 8, 2)
  doorLight.position.set(0, 2.2, half - 1.2)
  scene.add(doorLight)

  let elapsed = 0
  let disposed = false
  const update = (dt, { unlocked }) => {
    if (disposed) return
    elapsed += dt
    objects.forEach((object, i) => {
      object.rotation.y = Math.sin(elapsed * 0.6 + i) * 0.35
      object.position.y = 1.4 + Math.sin(elapsed * 2 + i) * 0.045
    })
    doorPivot.rotation.y = THREE.MathUtils.damp(doorPivot.rotation.y, unlocked ? -Math.PI / 2 : 0, 5, dt)
    door.material.color.setHex(unlocked ? 0x3bde95 : 0x7a3e22)
    door.material.emissive.setHex(unlocked ? 0x124d30 : 0x000000)
    doorLight.color.setHex(unlocked ? 0x68ffb2 : 0xfff3d0)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    disposeScene(scene)
  }

  // The existing builder doubles as the scene handle; no separate adapter is needed.
  return { scene, objects, door, doorPivot, doorLight, collide, update, dispose }
}

export function collide(x, z, unlocked = false, previousZ = 0) {
  const limit = ROOM_SIZE / 2 - PLAYER_RADIUS - 0.09
  // Account for both the frame and the player's width at the opening.
  const opening = 0.75 - 0.06 - PLAYER_RADIUS
  const outside = unlocked && previousZ > limit
  const xLimit = outside ? opening : limit
  let nextX = THREE.MathUtils.clamp(x, -xLimit, xLimit)
  const throughDoor = unlocked && Math.abs(nextX) <= opening
  let nextZ = THREE.MathUtils.clamp(z, -limit, throughDoor ? ROOM_SIZE / 2 + 2 : limit)

  for (const pedestal of PEDESTALS) {
    const dx = nextX - pedestal.x
    const dz = nextZ - pedestal.z
    const minDist = pedestal.radius + PLAYER_RADIUS
    const dist = Math.hypot(dx, dz)
    if (dist < minDist && dist > 0) {
      const push = minDist / dist
      nextX = pedestal.x + dx * push
      nextZ = pedestal.z + dz * push
      nextX = THREE.MathUtils.clamp(nextX, -limit, limit)
      nextZ = THREE.MathUtils.clamp(nextZ, -limit, limit)
    }
  }

  return { x: nextX, z: nextZ }
}

