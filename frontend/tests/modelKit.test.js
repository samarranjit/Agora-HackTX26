import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTube, createGrid, createPart, V, hex } from '../src/modelKit.js'

// A tube must show its outside: with one-sided materials, faces wound inwards leave the
// camera looking at the inside of the far wall (this once flattened the dragon and princess).
function faceCounts(tube, rings, sides) {
  const pos = tube.geometry.attributes.position, index = tube.geometry.index
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3(), mid = new THREE.Vector3(), axis = new THREE.Vector3()
  let outward = 0, inward = 0
  for (let f = 0; f < rings * sides * 2; f++) {
    const i = index.getX(f * 3)
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, index.getX(f * 3 + 1)); c.fromBufferAttribute(pos, index.getX(f * 3 + 2))
    normal.subVectors(b, a).cross(c.clone().sub(a)); mid.copy(a).add(b).add(c).multiplyScalar(1 / 3)
    const ring = Math.floor(i / sides); axis.set(0, 0, 0)
    for (let s = 0; s < sides; s++) axis.add(new THREE.Vector3().fromBufferAttribute(pos, ring * sides + s))
    axis.multiplyScalar(1 / sides)
    if (normal.dot(mid.sub(axis)) > 0) outward += 1; else inward += 1
  }
  return { outward, inward }
}
const white = hex(0xffffff)
const simple = (path, extra = {}) => {
  const rings = 20, sides = 16, flat = new Float32Array(rings + 1).fill(0.3)
  const tube = createTube({ rings, sides, rx: flat, ry: flat.map((v) => v * 0.7), color: (u, v, out) => out.copy(white), ...extra })
  tube.shape(path)
  return { tube, rings, sides }
}

test('tubes face outward whichever way they run', () => {
  const runs = {
    'along +z': [[V(0, 0, 0), V(0, 0, 1), V(0, 0, 2)], undefined],
    'along -z': [[V(0, 0, 0), V(0, 0, -1), V(0, 0, -2)], undefined],
    'along +x': [[V(0, 0, 0), V(1, 0, 0), V(2, 0, 0)], undefined],
    'upwards': [[V(0, 0, 0), V(0, 1, 0), V(0, 2, 0)], V(0, 0, 1)],
    'downwards': [[V(0, 2, 0), V(0, 1, 0), V(0, 0, 0)], V(0, 0, 1)],
  }
  for (const [label, [path, reference]] of Object.entries(runs)) {
    const { tube, rings, sides } = simple(path, { reference })
    const { outward, inward } = faceCounts(tube, rings, sides)
    assert.equal(inward, 0, `${label}: ${inward} faces point inwards`)
    assert.equal(outward, rings * sides * 2)
  }
})

test('spikes point outward on every side of a tube', () => {
  const rings = 20, sides = 16
  for (const axis of ['N', '-N', 'B', '-B', 'T']) {
    const spike = { ring: 10, axis, height: 0.4, width: 0.12, sweep: axis === 'T' ? 0 : 0.5, base: white, tip: white }
    const { tube } = simple([V(0, 0, 0), V(0, 0, 1), V(0, 0, 2)], { spikes: [spike] })
    const pos = tube.geometry.attributes.position, index = tube.geometry.index, first = (rings + 1) * sides
    const centre = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3(), mid = new THREE.Vector3()
    for (let q = 0; q < 4; q++) centre.add(new THREE.Vector3().fromBufferAttribute(pos, first + q))
    centre.multiplyScalar(0.25)
    for (let f = rings * sides * 2; f < index.count / 3; f++) {
      a.fromBufferAttribute(pos, index.getX(f * 3)); b.fromBufferAttribute(pos, index.getX(f * 3 + 1)); c.fromBufferAttribute(pos, index.getX(f * 3 + 2))
      normal.subVectors(b, a).cross(c.clone().sub(a)); mid.copy(a).add(b).add(c).multiplyScalar(1 / 3)
      assert.ok(normal.dot(mid.sub(centre)) > 0, `a ${axis} spike has a face pointing inwards`)
    }
  }
})

test('a tube can be re-laid along a new path, again and again, without breaking', () => {
  const { tube } = simple([V(0, 0, 0), V(0, 0, 1), V(0, 0, 2)])
  for (let i = 0; i < 20; i++) tube.shape([V(0, 0, 0), V(Math.sin(i), i * 0.1, 1), V(0, 0.5, 2 + i * 0.1)], i % 4 === 0)
  assert.ok(Array.from(tube.geometry.attributes.position.array).every(Number.isFinite))
})

test('a grid places every vertex through the function it is given, and can be moved again', () => {
  const grid = createGrid({ cols: 6, rows: 4, color: (u, v, out) => out.setRGB(u, v, 0) })
  grid.lay((u, v, out) => out.set(u, v, 0))
  const pos = grid.geometry.attributes.position
  assert.equal(pos.count, 7 * 5)
  assert.deepEqual([pos.getX(4), pos.getY(4)], [0, 1], 'the first column ends at the top row')
  grid.lay((u, v, out) => out.set(u * 2, v * 2, 1))
  assert.deepEqual([pos.getX(4), pos.getY(4), pos.getZ(4)], [0, 2, 1])
  assert.equal(grid.geometry.index.count, 6 * 4 * 6)
})

test('merged parts keep their colours and can be welded for smooth shading', () => {
  const part = createPart()
  part.orb([0, 0, 0], [1, 1, 1], hex(0xff0000), hex(0x0000ff))
  part.orb([2, 0, 0], [0.5, 0.5, 0.5], hex(0x00ff00))
  const material = new THREE.MeshBasicMaterial({ vertexColors: true })
  const flat = part.build(material, 'flat'), part2 = createPart()
  part2.orb([0, 0, 0], [1, 1, 1], hex(0xff0000))
  const smooth = part2.build(material, 'smooth', { smooth: true })
  assert.equal(flat.name, 'flat')
  assert.ok(flat.geometry.attributes.color.count === flat.geometry.attributes.position.count)
  assert.ok(smooth.geometry.index, 'a welded part is indexed')
  assert.ok(smooth.geometry.attributes.position.count < flat.geometry.attributes.position.count / 2, 'shared vertices are merged')
})
