import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { createWalkFeel } from '../src/walkFeel.js'
import { createStoryAudio } from '../src/audio/storyAudio.js'
import { createMagicEffects } from '../src/magicEffects.js'
import { createForestScene, createCastleHallScene } from '../src/forestScene.js'
import { createForestView } from '../src/game/forestView.js'
import { forestHeight } from '../src/forestLayout.js'

function atEncounter(run, id) {
  const spot = run.layout.encounters.find((enemy) => enemy.id === id)
  return { x: spot.x, z: spot.z, y: forestHeight(spot.x, spot.z, run.layout) + 1.6 }
}

test('walk feel follows actual distance, settles without drift, and disables bob off the ground', () => {
  const feel = createWalkFeel()
  let steps = 0, maximum = 0
  for (let i = 0; i < 180; i++) { const next = feel.update(1 / 60, 4.2 / 60); maximum = Math.max(maximum, Math.abs(next.offsetY)); steps += Number(next.step) }
  assert.ok(maximum > 0.035 && maximum <= 0.055)
  assert.ok(steps >= 6 && steps <= 8)
  let resting
  for (let i = 0; i < 120; i++) resting = feel.update(1 / 60, 0)
  assert.equal(resting.offsetY, 0); assert.equal(resting.step, false)
  assert.equal(feel.update(1 / 60, 0.07, { grounded: false }).offsetY, 0)
  assert.equal(feel.update(1 / 60, 0.07, { active: false }).offsetY, 0)
  assert.equal(feel.update(1 / 60, 0.07, { reducedMotion: true }).offsetY, 0)
  assert.equal(feel.update(1 / 60, 12).step, false, 'respawns must not trigger a burst of footsteps')
})

class Param {
  value = 0
  setTargetAtTime(value) { this.value = value }
  setValueAtTime(value) { this.value = value }
  linearRampToValueAtTime(value) { this.value = value }
  exponentialRampToValueAtTime(value) { this.value = value }
}
class Node {
  gain = new Param(); frequency = new Param(); disconnected = false; started = false; stopped = false
  connect() {}
  disconnect() { this.disconnected = true }
  start() { this.started = true }
  stop() { this.stopped = true }
}
function audioHarness() {
  const contexts = []
  class Context {
    currentTime = 0; sampleRate = 8000; state = 'suspended'; destination = {}; nodes = []
    constructor() { contexts.push(this) }
    make() { const node = new Node(); this.nodes.push(node); return node }
    createGain() { return this.make() }
    createOscillator() { return this.make() }
    createBufferSource() { return this.make() }
    createBiquadFilter() { return this.make() }
    createBuffer(_, length) { return { getChannelData: () => new Float32Array(length) } }
    resume() { this.state = 'running'; return Promise.resolve() }
    close() { this.state = 'closed'; return Promise.resolve() }
  }
  return { contexts, sound: createStoryAudio({ Context }) }
}

test('audio requires a trusted gesture, limits repeats, mutes all branches, and disposes', () => {
  const { sound, contexts } = audioHarness()
  sound.setActive(true)
  assert.equal(sound.play('correct'), false)
  assert.equal(sound.unlock({ isTrusted: false }), false)
  assert.equal(contexts.length, 0)
  assert.equal(sound.unlock({ isTrusted: true }), true)
  assert.equal(contexts.length, 1)
  const context = contexts[0], master = context.nodes[0], ambience = context.nodes[1]
  assert.ok(master.gain.value > 0)
  assert.equal(sound.play('footstep'), true)
  assert.equal(sound.play('footstep'), false)
  assert.equal(sound.play('goblin'), true)
  assert.equal(sound.play('wolf'), true)
  assert.equal(sound.play('goblin'), false)
  context.currentTime += 0.3
  assert.equal(sound.play('footstep'), true)
  sound.setMuted(true); assert.equal(master.gain.value, 0); assert.equal(sound.play('collect'), false)
  sound.setMuted(false); assert.ok(master.gain.value > 0)
  sound.setActive(false); assert.equal(ambience.gain.value, 0); assert.equal(sound.play('footstep'), false)
  assert.equal(sound.play('correct'), true, 'question feedback can play while movement is paused')
  sound.setHidden(true); assert.equal(master.gain.value, 0); assert.equal(sound.play('correct'), false)
  sound.dispose(); sound.dispose()
  assert.equal(context.state, 'closed')
  assert.ok(context.nodes.every((node) => node.disconnected))
  assert.ok(context.nodes.filter((node) => node.started).every((node) => node.stopped))
})

test('unsupported and failed audio leave a usable silent experience', () => {
  for (const Context of [null, class { constructor() { throw new Error('Unavailable') } }]) {
    const sound = createStoryAudio({ Context })
    assert.equal(sound.unlock({ isTrusted: true }), false)
    sound.setMuted(true); sound.setEnvironment('castle'); sound.setActive(true)
    assert.equal(sound.play('dragon'), false)
    sound.dispose()
  }
})

test('particle pool is bounded, reduced motion is stationary, and resources dispose once', () => {
  const scene = new THREE.Scene(), effects = createMagicEffects(scene, 12)
  const points = scene.children[0], position = points.geometry.attributes.position
  let disposed = 0
  for (const resource of [points.geometry, points.material, points.material.map]) resource.addEventListener('dispose', () => disposed++)
  for (let i = 0; i < 30; i++) effects.burst({ x: 0, y: 2, z: 0 }, { count: 40, reducedMotion: true })
  assert.equal(position.count, 12)
  const before = [...position.array]
  effects.update(0.1, true)
  assert.deepEqual([...position.array], before)
  effects.update(1, true)
  assert.ok(points.geometry.attributes.color.array.every((value) => value === 0))
  effects.dispose(); effects.dispose(); effects.update(1)
  assert.equal(disposed, 3); assert.equal(scene.children.length, 0)
})

test('all item visuals spin with distinct float phases; collection is visual only and does not replay', () => {
  const handle = createForestScene(), run = createForestView()
  const items = handle.scene.children.filter((node) => node.name.startsWith('fairytale-'))
  assert.equal(items.length, 5)
  handle.update(0, { forestRun: run })
  const initial = items.map((item) => ({ x: item.position.x, z: item.position.z, rotation: item.rotation.y, y: item.position.y }))
  handle.update(0.5, { forestRun: run })
  for (const [i, item] of items.entries()) { assert.equal(item.position.x, initial[i].x); assert.equal(item.position.z, initial[i].z); assert.ok(item.rotation.y > initial[i].rotation) }
  const frozen = items.map((item) => item.rotation.y)
  handle.update(0, { forestRun: run, reducedMotion: true })
  const reduced = items.map((item) => item.position.y)
  handle.update(1, { forestRun: run, reducedMotion: true })
  assert.deepEqual(items.map((item) => item.position.y), reduced)
  assert.notDeepEqual(frozen, items.map((item) => item.rotation.y))
  const completed = { ...run, collectedIds: ['trident'], xp: 20 }
  handle.update(0.05, { forestRun: completed }); handle.update(1, { forestRun: completed })
  assert.equal(items[0].visible, false)
  const particles = handle.scene.getObjectByName('Storywood sparkles')
  assert.ok(particles.geometry.attributes.color.array.every((value) => value === 0))
  assert.equal(completed.xp, 20); assert.deepEqual(run.collectedIds, [])
  handle.dispose()
})

test('a defeated goblin or wolf stays visible while burning, then is gone', () => {
  const run = { ...createForestView({ seed: 'flames' }), summonableEnemyIds: ['goblin', 'wolf'] }
  const handle = createForestScene({ layout: run.layout })
  const appeared = []
  handle.update(0.1, { forestRun: run, onGuardianAppear: (id) => appeared.push(id) })
  const goblin = handle.scene.getObjectByName('Forest Goblin')
  const wolf = handle.scene.getObjectByName('Big Bad Wolf')
  assert.equal(goblin.visible, false)
  assert.equal(wolf.visible, false)
  assert.deepEqual(appeared, [])
  handle.update(0.1, { forestRun: run, playerPosition: atEncounter(run, 'goblin'), onGuardianAppear: (id) => appeared.push(id) })
  assert.equal(goblin.visible, true)
  assert.equal(wolf.visible, false)
  assert.deepEqual(appeared, ['goblin'])
  handle.update(0.1, { forestRun: run, playerPosition: atEncounter(run, 'goblin'), onGuardianAppear: (id) => appeared.push(id) })
  handle.update(0.1, { forestRun: run, playerPosition: atEncounter(run, 'wolf'), onGuardianAppear: (id) => appeared.push(id) })
  assert.equal(wolf.visible, true)
  assert.deepEqual(appeared, ['goblin', 'wolf'])
  const burning = { ...run, defeatedEnemyIds: ['goblin'] }
  handle.update(0.04, { forestRun: burning, playerPosition: atEncounter(run, 'wolf') })
  assert.equal(goblin.visible, true, 'the goblin burns instead of vanishing')
  const sparks = handle.scene.getObjectByName('Storywood sparkles')
  assert.ok(sparks.geometry.attributes.color.array.some((value) => value > 0))
  handle.update(2, { forestRun: burning, playerPosition: atEncounter(run, 'wolf') })
  assert.equal(goblin.visible, false)
  handle.update(0.05, { forestRun: { ...burning, defeatedEnemyIds: ['goblin', 'wolf'] }, reducedMotion: true, playerPosition: atEncounter(run, 'wolf') })
  handle.update(0.35, { forestRun: { ...burning, defeatedEnemyIds: ['goblin', 'wolf'] }, reducedMotion: true, playerPosition: atEncounter(run, 'wolf') })
  assert.equal(wolf.visible, false)
  handle.dispose()
})

test('dragon completion sparkles are emitted once, expire, and do not change progress', () => {
  const handle = createCastleHallScene(), run = createForestView()
  handle.update(1, { forestRun: run }) // Finish the entrance cue.
  const victory = { ...run, stage: 'castle', dragonDefeated: true, xp: 100 }
  handle.update(0, { forestRun: victory })
  const points = handle.scene.getObjectByName('Storywood sparkles')
  assert.ok(points.geometry.attributes.color.array.some((v) => v > 0))
  handle.update(1, { forestRun: victory })
  handle.update(0.05, { forestRun: victory })
  assert.ok(points.geometry.attributes.color.array.every((v) => v === 0))
  assert.equal(victory.xp, 100)
  handle.dispose(); handle.dispose()
})

test('paused HUD keeps the XP bar at the bottom left', async () => {
  const forest = await readFile(new URL('../src/forest.css', import.meta.url), 'utf8')
  const adventure = await readFile(new URL('../src/adventure.css', import.meta.url), 'utf8')
  assert.doesNotMatch(forest, /\.hud-paused \.adventure-vitals/)
  assert.match(adventure, /\.adventure-vitals \{[^}]*left: 28px;[^}]*bottom: 26px/)
})
