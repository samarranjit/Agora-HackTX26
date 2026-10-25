import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'
import { FOREST_COLLECTIBLES, FOREST_ENEMIES, FOREST_DRAGON } from '../src/game/forestContent.js'
import { SAMPLE_MEMORIES, isCorrectAnswer } from '../src/memories.js'
import { createForestRun, forestRunReducer, forestTurnToken, activeForestChallenge } from '../src/game/forestRun.js'

// Use the project's existing JSX compiler to render actual UI with Node's test runner.
// No DOM package, server, backend fixture, or extra dependency is needed.
const modules = new Map()
async function loadJsx(url) {
  if (modules.has(url.href)) return modules.get(url.href)
  let { code } = await transformWithOxc(await readFile(url, 'utf8'), url.pathname, { jsx: { runtime: 'automatic' } })
  for (const spec of new Set([...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]))) {
    const target = spec.startsWith('.') ? new URL(spec, url) : new URL(import.meta.resolve(spec))
    const resolved = target.pathname.endsWith('.jsx') ? await loadJsx(target) : target.href
    code = code.replaceAll(`'${spec}'`, `'${resolved}'`).replaceAll(`"${spec}"`, `"${resolved}"`)
  }
  const compiled = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  modules.set(url.href, compiled)
  return compiled
}
const { default: ForestChallenge } = await import(await loadJsx(new URL('../src/ForestChallenge.jsx', import.meta.url)))
const { default: RecallQuiz } = await import(await loadJsx(new URL('../src/RecallQuiz.jsx', import.meta.url)))
const { default: MultipleChoiceAnswer } = await import(await loadJsx(new URL('../src/MultipleChoiceAnswer.jsx', import.meta.url)))
const { default: RoomExperience } = await import(await loadJsx(new URL('../src/RoomExperience.jsx', import.meta.url)))
const event = (run, type, extra = {}) => forestRunReducer(run, { type, runId: run.runId, token: forestTurnToken(run), ...extra })
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
function collect(run, item) {
  run = event(run, 'OPEN_CHALLENGE', { targetId: item.id })
  for (let i = 0; i < item.questions.length; i++) {
    run = event(run, 'ANSWER', { answer: item.questions[i].choices[0].value })
    if (i < item.questions.length - 1) run = event(run, 'NEXT_QUESTION')
  }
  return run
}

test('all offline questions have distinct selectable choices with one accepted value and unchanged placeholder content', () => {
  const questions = [...FOREST_COLLECTIBLES, ...FOREST_ENEMIES, FOREST_DRAGON].flatMap((target) => target.questions)
  for (const question of [...questions, ...SAMPLE_MEMORIES]) {
    assert.ok(question.choices.length >= 3)
    assert.equal(new Set(question.choices.map((choice) => choice.id)).size, question.choices.length)
    assert.equal(question.choices.filter((choice) => isCorrectAnswer(question, choice.value)).length, 1)
  }
  for (const question of questions) { assert.equal(question.question, '*filler question*'); assert.equal(question.choices[0].value, 'answer') }
})

test('actual collectible, goblin, wolf, dragon and indoor UIs render radio answers; combat never renders help', () => {
  const verify = (run, combat) => {
    const html = render(ForestChallenge, { run, dispatch() {}, onClose() {} })
    assert.equal((html.match(/type="radio"/g) || []).length, 3)
    assert.doesNotMatch(html, /type="text"|Your answer<input/)
    assert.match(html, /Choose one answer/)
    if (combat) assert.doesNotMatch(html, /Learn more|Hide explanation|filler explanation/)
    else assert.match(html, /Learn more/)
  }
  for (const item of FOREST_COLLECTIBLES) verify(event(createForestRun(), 'OPEN_CHALLENGE', { targetId: item.id }), false)
  let run = createForestRun()
  for (const item of FOREST_COLLECTIBLES.slice(0, 2)) run = collect(run, item)
  for (const enemy of FOREST_ENEMIES) {
    run = event(run, 'START_FOREST_ENCOUNTER', { targetId: enemy.id }); verify(run, true)
    assert.equal(event(run, 'SHOW_EXPLANATION'), run)
    run = event(run, 'ANSWER', { answer: enemy.questions[0].choices[0].value })
  }
  for (const item of FOREST_COLLECTIBLES.slice(2)) run = collect(run, item)
  run = event(run, 'BRIDGE_LOWERED'); run = event(run, 'ENTER_CASTLE'); run = event(run, 'OPEN_CHALLENGE', { targetId: 'dragon' }); verify(run, true)
  for (const memory of SAMPLE_MEMORIES) assert.equal((render(RecallQuiz, { memory, onUnlock() {}, onClose() {} }).match(/type="radio"/g) || []).length, 3)
})

test('choice form exposes required radio selection, disabled submission, and an immutable submitted choice', () => {
  const options = FOREST_COLLECTIBLES[0].questions[0].choices
  const empty = render(MultipleChoiceAnswer, { options, onAnswer() {} })
  assert.match(empty, /<legend>Choose one answer<\/legend>/)
  assert.equal((empty.match(/required=""/g) || []).length, 3)
  assert.match(empty, /<button[^>]+disabled=""/)
  const submitted = render(MultipleChoiceAnswer, { options, submittedValue: 'placeholder option B', onAnswer() {} })
  assert.match(submitted, /<fieldset disabled=""/)
  assert.equal((submitted.match(/checked=""/g) || []).length, 1)
  assert.match(submitted, /Submitted choice: placeholder option B/)
  assert.doesNotMatch(submitted, /Check answer/)
})

test('the world offers only mouse-lock recovery when unlocked and no mouse-unlock button', () => {
  const run = createForestRun()
  const html = render(RoomExperience, { memories: [], active: true, environment: 'forest', forestRun: run, hearts: 3 })
  assert.match(html, /Resume mouse look/)
  assert.doesNotMatch(html, />[^<]*(?:Unlock mouse|Release mouse|Unlock pointer)[^<]*</i)
  const paused = render(RoomExperience, { memories: [], active: false, environment: 'forest', forestRun: run, hearts: 3 })
  assert.doesNotMatch(paused, /Resume mouse look/)
})

test('submitted choices keep current damage, retry, deduplication, rewards and full-reset semantics', () => {
  const item = FOREST_COLLECTIBLES[0], [right, wrong] = item.questions[0].choices
  let run = event(createForestRun(), 'OPEN_CHALLENGE', { targetId: item.id })
  run = event(run, 'ANSWER', { answer: wrong.value })
  assert.equal(run.hearts, 2); assert.equal(run.xp, 0)
  assert.equal(activeForestChallenge(run).feedback.answer, wrong.value)
  assert.equal(event(run, 'ANSWER', { answer: wrong.value }), run)
  const html = render(ForestChallenge, { run, dispatch() {}, onClose() {} })
  assert.match(html, /Submitted choice: placeholder option B/); assert.match(html, /One heart lost; 2 remain/)
  run = event(run, 'NEXT_QUESTION')
  for (let i = 0; i < 3; i++) { run = event(run, 'ANSWER', { answer: right.value }); if (i < 2) run = event(run, 'NEXT_QUESTION') }
  assert.equal(run.xp, 20); assert.equal(run.checkpoint.id, item.id); assert.equal(run.hearts, 2)
  run = event(run, 'OPEN_CHALLENGE', { targetId: FOREST_COLLECTIBLES[1].id })
  const previousId = run.runId
  run = event(run, 'ANSWER', { answer: wrong.value }); run = event(run, 'NEXT_QUESTION'); run = event(run, 'ANSWER', { answer: wrong.value })
  assert.notEqual(run.runId, previousId); assert.equal(run.hearts, 3); assert.equal(run.xp, 0); assert.equal(run.bridgeState, 'raised')
})
