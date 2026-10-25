import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createStoryDragon } from '../src/storybookProps.js'
import { disposeScene } from '../src/sceneResources.js'
import { HALL, HALL_FLOOR } from '../src/forestLayout.js'

// The model that this dragon replaced, measured before it was removed.
const OLD = { triangles: 26724, length: 12.01, earLength: 1.15, torsoRatio: 0.33 }

const visible = (node) => { for (let n = node; n; n = n.parent) if (n.visible === false) return false; return true }
function measure(root) {
  let triangles = 0, vertices = 0, meshes = 0
  const colours = { red: 0, orange: 0, white: 0, all: 0 }
  root.traverse((node) => {
    if (!node.isMesh) return
    const g = node.geometry, count = g.attributes.position.count
    meshes += 1; vertices += count; triangles += (g.index ? g.index.count : count) / 3
    const c = g.attributes.color
    if (!c || !node.material.vertexColors) return
    for (let i = 0; i < c.count; i++) {
      const r = c.getX(i), gr = c.getY(i), b = c.getZ(i)
      colours.all += 1
      if (r > 0.85 && gr > 0.85 && b > 0.75) colours.white += 1
      else if (r > 0.8 && gr > 0.3 && gr < 0.75 && b < 0.35) colours.orange += 1
      else if (r > 0.35 && gr < 0.2 && b < 0.2) colours.red += 1
    }
  })
  return { triangles, vertices, meshes, colours }
}
function shownBox(root) {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3(), part = new THREE.Box3()
  root.traverse((node) => { if (node.isMesh && visible(node)) box.union(part.setFromObject(node, true)) })
  return box
}
const named = (root, name) => { let found; root.traverse((n) => { if (n.name === name) found = n }); return found }
const sample = (dragon, from, to, step, read) => { const out = []; for (let t = from; t <= to + 1e-9; t += step) { dragon.update(t, false); out.push([t, read()]) } return out }

test('the dragon has more than double the geometric detail of the model it replaced', () => {
  const { triangles, meshes } = measure(createStoryDragon().root)
  assert.ok(triangles >= OLD.triangles * 2, `${triangles} triangles against ${OLD.triangles * 2} needed`)
  assert.ok(meshes < 70, 'fixed parts are merged, so detail does not cost draw calls')
})

test('its colours are a mix of red, orange and white', () => {
  const { colours } = measure(createStoryDragon().root)
  for (const hue of ['red', 'orange', 'white']) assert.ok(colours[hue] / colours.all > 0.04, `${hue} covers too little of the dragon`)
})

test('the body is longer, with a long neck and a slimmer, stronger torso', () => {
  const dragon = createStoryDragon()
  const length = shownBox(dragon.root).getSize(new THREE.Vector3()).z
  assert.ok(length > OLD.length * 1.6, `length ${length.toFixed(1)}`)
  const torso = new THREE.Box3().setFromObject(named(dragon.root, 'dragon-torso'), true).getSize(new THREE.Vector3())
  assert.ok(torso.z > 5.5, 'a long torso')
  assert.ok(torso.x / torso.z < OLD.torsoRatio * 0.8, `slim: width is ${(torso.x / torso.z).toFixed(2)} of its length`)
  const neck = new THREE.Box3().setFromObject(named(dragon.root, 'dragon-neck'), true).getSize(new THREE.Vector3())
  assert.ok(neck.length() > 5, 'a long neck')
})

test('the ears are long and sweep back from the head', () => {
  const dragon = createStoryDragon()
  assert.equal(dragon.ears.length, 2)
  for (const ear of dragon.ears) {
    const size = new THREE.Box3().setFromObject(ear, true).getSize(new THREE.Vector3())
    assert.ok(size.z > OLD.earLength * 1.6, `ear is ${size.z.toFixed(2)} long`)
    ear.geometry.computeBoundingBox()
    assert.ok(ear.geometry.boundingBox.min.z < -1.5, 'swept back behind the skull')
  }
})

test('the wings are held wide open and beat at regular intervals', () => {
  const dragon = createStoryDragon()
  const [left, right] = dragon.wings
  dragon.update(0, false)
  assert.ok(left.rotation.z * right.rotation.z < 0, 'mirrored')
  assert.ok(Math.abs(left.rotation.z) > 0.3, 'raised and open at rest')
  const span = new THREE.Box3().setFromObject(dragon.root, true)
  const wide = new THREE.Box3().union(new THREE.Box3().setFromObject(left, true)).union(new THREE.Box3().setFromObject(right, true))
  assert.ok(wide.getSize(new THREE.Vector3()).x > 16 && span.isEmpty() === false, 'a wide span')
  const angle = () => Math.abs(left.rotation.z)
  const period = sample(dragon, 0, 5, 0.05, angle)
  const nextPeriod = sample(dragon, 5, 10, 0.05, angle)
  period.forEach(([, a], i) => assert.ok(Math.abs(a - nextPeriod[i][1]) < 1e-9, 'the pattern repeats every five seconds'))
  const beats = period.filter(([, a], i, all) => i > 0 && i < all.length - 1 && a > all[i - 1][1] && a > all[i + 1][1] && a > 0.6).length
  assert.ok(beats >= 3, `${beats} strong beats in a burst`)
  const range = (from, to) => { const a = period.filter(([t]) => t >= from && t <= to).map(([, v]) => v); return Math.max(...a) - Math.min(...a) }
  assert.ok(range(0.5, 3) > 0.5, 'a strong flap during the burst')
  assert.ok(range(3.5, 5) < 0.1, 'only a gentle sway between bursts')
})

test('it spews fire only occasionally and on a schedule', () => {
  const dragon = createStoryDragon()
  dragon.update(0, false)
  assert.equal(dragon.state.heat, 0, 'no fire in the resting pose used for reduced motion')
  assert.equal(dragon.breath.visible, false)
  const heat = sample(dragon, 0, 33, 0.05, () => dragon.state.heat)
  const hot = heat.filter(([, h]) => h > 0.05)
  assert.ok(hot.length / heat.length > 0.08 && hot.length / heat.length < 0.25, 'fire is an occasional event')
  const starts = heat.filter(([, h], i) => h > 0.05 && (i === 0 || heat[i - 1][1] <= 0.05)).map(([t]) => t)
  assert.equal(starts.length, 3)
  assert.ok(Math.abs(starts[1] - starts[0] - 11) < 0.1 && Math.abs(starts[2] - starts[1] - 11) < 0.1, 'every eleven seconds')
  const peak = heat.reduce((best, entry) => (entry[1] > best[1] ? entry : best))
  dragon.update(peak[0], false)
  assert.equal(dragon.breath.visible, true)
  assert.ok(dragon.breath.children.some((c) => c.isLight && c.intensity > 50), 'the fire lights the hall')
  const mouth = dragon.mouth(new THREE.Vector3())
  assert.ok(Number.isFinite(mouth.x + mouth.y + mouth.z) && mouth.y > 1, 'embers can start at the mouth')
})

test('it looks around', () => {
  const dragon = createStoryDragon()
  const facing = new THREE.Vector3()
  const xs = sample(dragon, 0, 40, 0.1, () => facing.set(0, 0, 1).applyQuaternion(dragon.head.quaternion).x).map(([, x]) => x)
  assert.ok(Math.min(...xs) < -0.3 && Math.max(...xs) > 0.3, 'the head turns both ways')
})

test('when defeated it is calm: no fire, no flapping, head bowed', () => {
  const dragon = createStoryDragon()
  dragon.update(0, false)
  const rested = dragon.head.position.y
  for (const time of [1.2, 8.8, 9.3]) {
    dragon.update(time, true)
    assert.equal(dragon.state.heat, 0)
    assert.equal(dragon.state.flapEnv, 0)
    assert.equal(dragon.breath.visible, false)
  }
  assert.ok(dragon.head.position.y < rested - 0.5, 'head lowered')
  assert.ok(dragon.root.rotation.x < 0)
})

test('in the hall it stays on the floor and inside the walls through every animation', () => {
  const dragon = createStoryDragon()
  const placed = new THREE.Group()
  placed.position.set(HALL.dragon.x, HALL_FLOOR, HALL.dragon.z); placed.scale.setScalar(HALL.dragon.scale); placed.add(dragon.root)
  const low = new THREE.Vector3(1e9, 1e9, 1e9), high = new THREE.Vector3(-1e9, -1e9, -1e9)
  for (let t = 0; t <= 23; t += 0.25) {
    dragon.update(t, false)
    const box = shownBox(placed)
    low.min(box.min); high.max(box.max)
  }
  assert.ok(low.y > HALL_FLOOR - 0.2, `lowest point ${low.y - HALL_FLOOR}`)
  assert.ok(low.x > -HALL.halfWidth && high.x < HALL.halfWidth && low.z > HALL.back && high.y < HALL_FLOOR + HALL.ceiling)
})

test('its collision circle reaches past the chest and front paws', () => {
  const dragon = createStoryDragon()
  const legs = new THREE.Box3().setFromObject(named(dragon.root, 'dragon-legs'), true)
  assert.ok(Math.max(legs.max.z, -legs.min.z) * HALL.dragon.scale <= HALL.dragon.radius + 1, 'nobody can stand inside a leg')
})

test('every material is owned by the dragon and disposal releases the scene', () => {
  const dragon = createStoryDragon()
  const owned = new Set(dragon.root.userData.ownedMaterials)
  dragon.root.traverse((node) => { if (node.isMesh) assert.ok(owned.has(node.material), `${node.name || node.geometry.type} uses a material that would leak`) })
  const scene = new THREE.Scene(); scene.add(dragon.root)
  assert.doesNotThrow(() => disposeScene(scene))
})
