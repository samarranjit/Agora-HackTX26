import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createStoryPrincess } from '../src/storybookProps.js'
import { disposeScene } from '../src/sceneResources.js'
import { HALL } from '../src/forestLayout.js'

// The model this princess replaced, measured before it was removed.
const OLD = { triangles: 1056, meshes: 21, height: 2.77 }

const named = (root, name) => { let found; root.traverse((n) => { if (n.name === name) found = n }); return found }
const positions = (mesh) => Float32Array.from(mesh.geometry.attributes.position.array)
const moved = (a, b) => { let most = 0; for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs(a[i] - b[i])); return most }
function stats(root) {
  let triangles = 0, meshes = 0
  const colours = { gold: 0, pink: 0, skin: 0, blue: 0, all: 0 }
  root.traverse((node) => {
    if (!node.isMesh) return
    meshes += 1
    const g = node.geometry, count = g.attributes.position.count
    triangles += (g.index ? g.index.count : count) / 3
    const c = g.attributes.color
    if (!c) return
    for (let i = 0; i < c.count; i++) {
      const r = c.getX(i), gr = c.getY(i), b = c.getZ(i)
      colours.all += 1
      if (r > 0.8 && gr > 0.6 && b < 0.45) colours.gold += 1
      else if (r > 0.85 && gr > 0.5 && gr < 0.85 && b > 0.6) colours.pink += 1
      else if (r > 0.85 && gr > 0.65 && b > 0.5 && b < 0.8) colours.skin += 1
      else if (b > 0.6 && r < 0.45 && gr < 0.65) colours.blue += 1
    }
  })
  return { triangles, meshes, colours }
}
// Faces of a surface of revolution should point away from the body's vertical axis.
function outwardFaces(mesh) {
  const pos = mesh.geometry.attributes.position, index = mesh.geometry.index
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3(), axis = new THREE.Vector3()
  let outward = 0, inward = 0
  for (let f = 0; f < index.count / 3; f += 3) {
    a.fromBufferAttribute(pos, index.getX(f * 3)); b.fromBufferAttribute(pos, index.getX(f * 3 + 1)); c.fromBufferAttribute(pos, index.getX(f * 3 + 2))
    n.subVectors(b, a).cross(c.clone().sub(a)); mid.copy(a).add(b).add(c).multiplyScalar(1 / 3)
    axis.set(0, mid.y, 0)
    if (n.dot(mid.sub(axis)) > 0) outward += 1; else inward += 1
  }
  return { outward, inward }
}

test('the princess has far more detail than the model she replaced, and stays light', () => {
  const { triangles, meshes } = stats(createStoryPrincess().root)
  assert.ok(triangles >= OLD.triangles * 40, `${triangles} triangles`)
  assert.ok(triangles < 100000, 'detail does not run away')
  assert.ok(meshes < 50, `${meshes} draw calls`)
})

test('she stands about as tall as before, with her feet on the floor', () => {
  const princess = createStoryPrincess()
  const box = new THREE.Box3().setFromObject(princess.root, true), size = box.getSize(new THREE.Vector3())
  assert.equal(princess.root.name, 'Storywood Princess')
  assert.ok(size.y > OLD.height - 0.2 && size.y < OLD.height + 0.5, `height ${size.y.toFixed(2)}`)
  assert.ok(box.min.y > -0.05 && box.min.y < 0.05, 'standing on the floor')
  assert.ok(size.x * 1.8 < HALL.prison.halfWidth * 2 - 4, 'fits her cell')
})

test('her gown, bodice and face show their outsides', () => {
  const princess = createStoryPrincess()
  for (const name of ['princess-bodice', 'princess-skirt-under', 'princess-skirt-over', 'princess-skirt-flounce']) {
    const { outward, inward } = outwardFaces(named(princess.root, name))
    assert.equal(inward, 0, `${name} has ${inward} faces pointing inwards`)
    assert.ok(outward > 100)
  }
})

test('the palette is a pretty princess: pink gown, gold jewellery, warm skin, blue eyes', () => {
  const { colours } = stats(createStoryPrincess().root)
  for (const hue of ['pink', 'gold', 'skin', 'blue']) assert.ok(colours[hue] > 50, `no ${hue}`)
})

test('her eyes sit in her face, level with each other, in front of the skull', () => {
  const princess = createStoryPrincess()
  princess.root.updateMatrixWorld(true)
  const eyes = new THREE.Box3().setFromObject(named(princess.root, 'princess-eyes-mesh'), true)
  const face = new THREE.Box3().setFromObject(named(princess.root, 'princess-face'), true)
  const centre = eyes.getCenter(new THREE.Vector3())
  const level = (centre.y - face.min.y) / (face.max.y - face.min.y)
  assert.ok(level > 0.45 && level < 0.68, `eyes are ${Math.round(level * 100)}% of the way up the face`)
  assert.ok(Math.abs(centre.x) < 0.02, 'eyes are centred on the face')
  assert.ok(eyes.max.z > face.max.z - 0.15, 'eyes are on the front of the face')
  assert.ok(eyes.getSize(new THREE.Vector3()).x > 0.2 && eyes.getSize(new THREE.Vector3()).x < 0.45, 'a believable gap between the eyes')
})

test('she blinks on a regular beat and keeps her eyes open when motion is reduced', () => {
  const princess = createStoryPrincess()
  princess.update(0, false)
  assert.equal(princess.eyes.scale.y, 1)
  princess.update(0.08, false)
  assert.ok(princess.eyes.scale.y < 0.2, 'closed mid-blink')
  princess.update(1.5, false)
  assert.equal(princess.eyes.scale.y, 1)
  princess.update(3.9 + 0.08, false)
  assert.ok(princess.eyes.scale.y < 0.2, 'blinks again every 3.9 seconds')
})

test('her head turns gently to look around and tilts with a smile', () => {
  const princess = createStoryPrincess()
  const yaws = []
  for (let t = 0; t < 30; t += 0.2) { princess.update(t, false); yaws.push(princess.head.rotation.y) }
  assert.ok(Math.min(...yaws) < -0.12 && Math.max(...yaws) > 0.12, 'looks both ways')
  assert.ok(Math.max(...yaws.map(Math.abs)) < 0.45, 'never swings wildly')
})

test('her long hair sways but stays attached at the head', () => {
  const princess = createStoryPrincess()
  princess.update(1, false)
  const before = princess.locks.map(positions)
  princess.update(2.3, false)
  const swayed = princess.locks.map((lock, i) => moved(before[i], positions(lock)))
  assert.ok(swayed.filter((d) => d > 0.005).length >= princess.locks.length - 1, 'every lock moves')
  assert.ok(Math.max(...swayed) < 0.6, 'but not far')
  for (const lock of princess.locks) {
    const p = lock.geometry.attributes.position
    let top = -Infinity; for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i))
    assert.ok(top > 2.35 && top < 2.75, 'each lock starts at the scalp')
  }
})

test('her hands rest clasped at the waist, then part and swing when she walks', () => {
  const princess = createStoryPrincess()
  const handGap = () => {
    princess.root.updateMatrixWorld(true)
    const [l, r] = [named(princess.root, 'princess-hand-left'), named(princess.root, 'princess-hand-right')]
    return { gap: l.getWorldPosition(new THREE.Vector3()).distanceTo(r.getWorldPosition(new THREE.Vector3())), height: l.getWorldPosition(new THREE.Vector3()).y }
  }
  princess.update(0.5, false)
  const still = handGap()
  assert.ok(still.gap < 0.3 && still.height > 1 && still.height < 1.5, `clasped at ${still.height.toFixed(2)}, ${still.gap.toFixed(2)} apart`)
  princess.update(0.2, true)
  assert.ok(handGap().gap > still.gap + 0.2, 'the hands part when she walks')
})

test('the gown sways when she walks and ripples gently when she stands', () => {
  const princess = createStoryPrincess()
  const skirt = named(princess.root, 'princess-skirt-under')
  princess.update(0, false)
  const rest = positions(skirt)
  princess.update(0.2, true)
  const stepping = positions(skirt)
  assert.ok(moved(rest, stepping) > 0.03, 'a walking step swings the hem')
  princess.update(0, false)
  assert.ok(moved(rest, positions(skirt)) < 1e-4, 'back to rest, exactly, at time zero')
  princess.update(1.5, false)
  assert.ok(moved(rest, positions(skirt)) > 0.001, 'standing still she still breathes and sways')
})

test('she wears a jewelled tiara on her head, a pearl necklace and earrings', () => {
  const princess = createStoryPrincess()
  princess.root.updateMatrixWorld(true)
  const gold = new THREE.Box3().setFromObject(named(princess.root, 'princess-tiara-gold'), true)
  const gems = new THREE.Box3().setFromObject(named(princess.root, 'princess-tiara-gems'), true)
  const jewels = new THREE.Box3().setFromObject(named(princess.root, 'princess-jewels'), true)
  assert.ok(gold.max.y > 2.62 && gems.max.y > 2.7, 'the tiara peaks crown the top of her head')
  assert.ok(gems.min.y < 2.25, 'pearl earrings hang by her ears')
  assert.ok(jewels.max.y > 1.95 && jewels.min.y < 2.0, 'a necklace sits at her collar with a pendant below')
})

test('every frame of a long walk and a long wait stays finite', () => {
  const princess = createStoryPrincess()
  for (let t = 0; t < 20; t += 0.05) { princess.update(t, true); princess.update(t, false) }
  princess.root.traverse((node) => { if (node.isMesh) assert.ok(Array.from(node.geometry.attributes.position.array).every(Number.isFinite), `${node.name} has an invalid vertex`) })
})

test('every material is owned by the princess and disposal releases her', () => {
  const princess = createStoryPrincess()
  const owned = new Set(princess.root.userData.ownedMaterials)
  princess.root.traverse((node) => { if (node.isMesh) assert.ok(owned.has(node.material), `${node.name} uses a material that would leak`) })
  const scene = new THREE.Scene(); scene.add(princess.root)
  assert.doesNotThrow(() => disposeScene(scene))
})
