import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const modules = new Map()
async function loadJsx(url) {
  if (modules.has(url.href)) return modules.get(url.href)
  let { code } = await transformWithOxc(await readFile(url, 'utf8'), url.pathname, { jsx: { runtime: 'automatic' } })
  code = code.replace(/^import\s+["'][^"']+\.css["'];?\s*$/gm, '')
  for (const spec of new Set([...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]))) {
    const target = spec.startsWith('.') ? new URL(spec, url) : new URL(import.meta.resolve(spec))
    const resolved = target.pathname.endsWith('.jsx') ? await loadJsx(target) : target.href
    code = code.replaceAll("'" + spec + "'", "'" + resolved + "'").replaceAll('"' + spec + '"', '"' + resolved + '"')
  }
  const compiled = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  modules.set(url.href, compiled); return compiled
}

const { default: CharacterSpeech } = await import(await loadJsx(new URL('../src/CharacterSpeech.jsx', import.meta.url)))
const { Encounter } = await import(await loadJsx(new URL('../src/BackendGame.jsx', import.meta.url)))

test('guardian speech is a character-anchored dialog with the server question', () => {
  const attempt = { attempt_id: 'a1', question_id: 'q1', mode: 'adventure', type: 'numeric', prompt: 'What is 3 × 4?', options: null, difficulty: 1, topic: 'Multiplication', battle: { villain_name: 'Forest Goblin', question_number: 1, question_count: 1, correct_count: 0 }, sources: null, learning_objective: null }
  const html = renderToStaticMarkup(createElement(CharacterSpeech, { title: 'Forest Goblin', anchor: { x: 62, y: 34 }, onClose() {} }, createElement(Encounter, { session: {}, state: { attempt, busy: false } })))
  assert.match(html, /guardian-speech/)
  assert.match(html, /--speech-x:\s*62%/)
  assert.match(html, /--speech-y:\s*34%/)
  assert.match(html, /Forest Goblin/)
  assert.match(html, /What is 3 × 4\?/)
  assert.match(html, /Question 1\/1/)
  assert.doesNotMatch(html, /palace-overlay/)
})

test('the dragon uses the same anchored speech dialog as the forest guardians', () => {
  const attempt = { attempt_id: 'a2', question_id: 'q2', mode: 'adventure', type: 'multiple_choice', prompt: 'Name the castle keeper.', options: [{ id: 'A', text: 'A dragon' }], difficulty: 5, topic: 'Story', battle: { villain_name: 'The Storykeeper Dragon', question_number: 1, question_count: 1, correct_count: 0 }, sources: null, learning_objective: null }
  const html = renderToStaticMarkup(createElement(CharacterSpeech, { title: 'The Storykeeper Dragon', anchor: { x: 48, y: 22 }, onClose() {} }, createElement(Encounter, { session: {}, state: { attempt, busy: false } })))
  assert.match(html, /guardian-speech/)
  assert.match(html, /The Storykeeper Dragon/)
  assert.match(html, /Name the castle keeper/)
  assert.doesNotMatch(html, /palace-overlay/)
})
