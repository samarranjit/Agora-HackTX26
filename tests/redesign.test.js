import test from 'node:test'
import assert from 'node:assert/strict'
import { generateForestLayout, createForestWorld, pathX, forestHeight, FOREST_PATH } from '../src/forestLayout.js'
import { createForestView } from '../src/game/forestView.js'

test('seeded layouts repeat within a run, vary across runs, and reserve routes for every item', () => {
  assert.deepEqual(generateForestLayout('same'), generateForestLayout('same'))
  assert.notDeepEqual(generateForestLayout('same').collectibles, generateForestLayout('different').collectibles)
  for (let seed = 0; seed < 50; seed++) {
    const layout = generateForestLayout(seed), world = createForestWorld('start', layout)
    assert.equal(layout.collectibles.length, 5)
    assert.ok(layout.encounters[0].z - layout.encounters[1].z >= 16)
    for (const item of layout.collectibles) {
      assert.ok(Math.abs(item.x) < 20 && item.z > -18 && item.z < 36)
      assert.ok(Math.hypot(item.x, item.z - 40) > 9)
      for (const other of layout.collectibles) if (other !== item) assert.ok(Math.hypot(item.x - other.x, item.z - other.z) >= 8)
      const from = { x: pathX(item.z), z: item.z }, target = { x: item.x + Math.sign(from.x - item.x) * 1.8, z: item.z }
      const reached = world.move(from, target)
      assert.ok(Math.hypot(reached.x - target.x, reached.z - target.z) < 0.02, `seed ${seed}: branch to ${item.id} must stay clear`)
      assert.ok(Number.isFinite(forestHeight(item.x, item.z, layout)))
    }
    for (let i = 1; i < FOREST_PATH.length - 1; i++) {
      const from = FOREST_PATH[i - 1], to = FOREST_PATH[i], reached = world.move(from, to)
      assert.ok(Math.hypot(reached.x - to.x, reached.z - to.z) < 0.02, 'the full main route stays clear')
    }
  }
  const first = createForestView(), reset = createForestView()
  assert.notEqual(first.layout.seed, reset.layout.seed)
})

test('pedestal bases stop normal and diagonal approaches from every side without moving interactions', () => {
  const run = createForestView({ seed: 'pedestals' }), world = createForestWorld('start', run.layout)
  for (const item of run.layout.collectibles) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    const from = { x: item.x + dx * 2.4, z: item.z + dz * 2.4 }, end = world.move(from, item)
    const distance = Math.hypot(end.x - item.x, end.z - item.z)
    assert.ok(distance >= 1.079 && distance < 2.6)
    assert.deepEqual(world.move(end, item), end, 'pushing toward the pedestal should remain stable')
  }
})
