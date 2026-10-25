// Contract fixtures only. Requires Vite at :5173 and Chrome CDP at :9223.
// Scenario positioning uses a CDP camera hook; key movement and all application
// transitions run through the real frontend. No live API request is permitted.
import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
import { generateForestLayout, forestHeight, HALL } from '../../src/forestLayout.js'

const pages = await (await fetch('http://127.0.0.1:9223/json/list')).json()
const page = pages.find((p) => p.type === 'page' && p.url.includes(':5173'))
assert.ok(page, 'Open Vite in Chrome with --remote-debugging-port=9223')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let sequence = 0, active = null, guardians = 0, uploads = 0, practice = 0, failList = true, failAnswer = true
const pending = new Map(), receipts = new Map(), calls = [], exceptions = [], fixtureErrors = []
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const doc = 'a'.repeat(32), practiceSet = 'b'.repeat(32), adventureSet = 'c'.repeat(32)
const ids = ['forest-goblin', 'bridge-troll', 'castle-dragon'], names = ['Forest Goblin', 'Bridge Troll', 'Castle Dragon']
const remote = { schema_version: 1, state_version: 3, xp: 100, health: 80, max_health: 100, adventure_unlocked: true, adventure_completed: false, location: 'practice' }
const pack = () => ({ document_id: doc, name: 'Saved forest notes.pdf', topic: 'Biology', status: 'ready', stage: 'done', error: null, practice: { question_set_id: practiceSet, mode: 'practice', status: 'ready', error: null, question_count: 10 }, adventure: { question_set_id: adventureSet, mode: 'adventure', status: 'ready', error: null, question_count: 3 }, created_at: '', updated_at: '' })
const next = (mode) => ({ attempt_id: `attempt-${mode}-${guardians}-${practice}`, question_id: mode === 'practice' ? 'p1' : 'q' + guardians, mode, type: 'multiple_choice', prompt: 'Generated question from the selected PDF (test fixture)', options: [{ id: 'A', text: 'First response' }, { id: 'B', text: 'Second response' }], difficulty: mode === 'practice' ? 1 : [1, 3, 5][guardians], topic: 'Biology', learning_objective: 'Explain the source concept.', sources: [{ document_id: doc, document_name: pack().name, pages: [1] }], battle: mode === 'practice' ? null : { battle_attempt_id: 'battle-' + guardians, villain_id: ids[guardians], villain_name: names[guardians], question_number: 1, question_count: 1, correct_count: 0 } })

async function intercept({ requestId, request }) {
  const path = new URL(request.url).pathname
  if (path === '/src/playerMotion.js') {
    const source = await (await fetch(request.url)).text()
    const instrumented = source.replace(/(const position = \{[^\n]+\})/, '$1; window.__overhaulMotion = position')
    assert.notEqual(instrumented, source, 'instrument the real motion position for scenario setup only')
    await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(instrumented).toString('base64') }); return
  }
  if (!path.startsWith('/api/')) { await send('Fetch.continueRequest', { requestId }); return }
  calls.push({ path, method: request.method, key: request.headers['Idempotency-Key'], body: request.postData })
  const cors = [{ name: 'Access-Control-Allow-Origin', value: 'http://127.0.0.1:5173' }, { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type,idempotency-key,ngrok-skip-browser-warning' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' }]
  let data, status = 200
  if (request.method === 'OPTIONS') data = {}
  else {
    if (new URL(request.url).hostname.endsWith('.ngrok-free.dev')) assert.equal(request.headers['ngrok-skip-browser-warning'], '1')
    if (!path.startsWith('/api/auth/')) assert.equal(request.headers.Authorization, 'Bearer fixture-token')
    const key = request.headers['Idempotency-Key']
    if (path === '/api/auth/login') data = { access_token: 'fixture-token', token_type: 'bearer', expires_at: '2099-01-01' }
    else if (path === '/api/study-packs' && request.method === 'GET') {
      if (failList) { failList = false; status = 503; data = { error: { message: 'Study sets temporarily unavailable' } } }
      else data = { study_packs: [pack()] }
    } else if (path === '/api/study-packs' && request.method === 'POST') { uploads++; data = pack(); status = 202 }
    else if (path === '/api/study-packs/' + doc) data = pack()
    else if (path.startsWith('/api/question-sets/')) data = { question_set_id: path.split('/').at(-1), mode: path.endsWith(practiceSet) ? 'practice' : 'adventure', status: 'ready', document_ids: [doc], questions: ['p1', 'q0', 'q1', 'q2'].map((question_id) => ({ question_id })) }
    else if (path === '/api/me/status') data = remote
    else if (path === '/api/me/state') data = { ...remote, username: 'fixture-player', rules: { unlock_threshold: 100, battle_cost: 30 }, villains: ids.map((villain_id, i) => ({ villain_id, name: names[i], status: i < guardians ? 'completed' : i === guardians ? 'current' : 'locked' })) }
    else if (path === '/api/me/active-attempt') data = { attempt: active }
    else if (path === '/api/practice/attempts') { active ||= next('practice'); data = { created: true, attempt: active }; status = 201 }
    else if (path === '/api/adventure/battles') {
      if (receipts.has(key)) data = receipts.get(key)
      else { assert.equal(JSON.parse(request.postData).question_set_id, adventureSet); remote.xp -= 30; remote.state_version++; active = next('adventure'); data = { ...remote, battle_attempt_id: active.battle.battle_attempt_id, villain_id: active.battle.villain_id, villain_name: active.battle.villain_name, entry_cost: 30, attempt: active }; receipts.set(key, structuredClone(data)) }
    } else if (path.endsWith('/answer')) {
      if (receipts.has(key)) data = receipts.get(key)
      else {
        assert.ok(active); assert.equal(JSON.parse(request.postData).answer, 'A')
        const q = active, delta = [10, 15, 20, 25, 30][q.difficulty - 1]
        remote.xp += delta; remote.state_version++; active = null
        if (q.mode === 'adventure') guardians++; else practice++
        remote.adventure_completed = guardians === 3
        data = { ...remote, attempt_id: q.attempt_id, correct: true, feedback: { correct_answer: 'A', explanation: 'Explanation returned by the contract fixture' }, xp_delta: delta, health_delta: 0, next_attempt: null, encounter: { mode: q.mode, outcome: q.mode === 'practice' ? 'none' : 'won', adventure_unlocked_now: false, adventure_completed: remote.adventure_completed } }
        receipts.set(key, structuredClone(data))
        if (q.mode === 'adventure' && failAnswer) { failAnswer = false; await send('Fetch.failRequest', { requestId, errorReason: 'ConnectionClosed' }); return }
      }
    } else throw Error('Unexpected production API call: ' + path)
  }
  await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, ...cors], body: Buffer.from(JSON.stringify(data)).toString('base64') })
}
ws.onmessage = ({ data }) => {
  const event = JSON.parse(data)
  if (event.id) { const response = pending.get(event.id); pending.delete(event.id); event.error ? response.reject(Error(JSON.stringify(event.error))) : response.resolve(event.result) }
  if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text)
  if (event.method === 'Fetch.requestPaused') intercept(event.params).catch(async (error) => { fixtureErrors.push(error.message); await send('Fetch.failRequest', { requestId: event.params.requestId, errorReason: 'Failed' }).catch(() => {}) })
}
const evaluate = async (expression) => { const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails)); return response.result.value }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const text = () => evaluate('document.body.innerText')
async function until(check, label) { for (let i = 0; i < 200; i++) { if (await check()) return; await wait(75) } throw Error('Timed out: ' + label + '\n' + await text()) }
const hasText = (value) => until(async () => (await text()).includes(value), value)
const button = (name) => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`
async function click(expression) {
  await until(() => evaluate(`!!(${expression})&&!(${expression}).matches(':disabled')`), expression)
  await evaluate(`(${expression}).scrollIntoView({block:'center'})`)
  const point = await evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }); await wait(100)
}
const fill = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
const key = (type, value) => send('Input.dispatchKeyEvent', { type, key: value, code: 'Key' + value.toUpperCase(), windowsVirtualKeyCode: value.toUpperCase().charCodeAt(0) })
async function position(x, y, z) { await evaluate(`Object.assign(window.__overhaulMotion,{x:${x},y:${y - 1.6},z:${z}});window.__overhaulCamera.rotation.y=0`); await wait(100) }
async function screenshot(name) { await mkdir('.qa.local', { recursive: true }); const shot = await send('Page.captureScreenshot'); await writeFile('.qa.local/overhaul-' + name + '.png', Buffer.from(shot.data, 'base64')) }
const battleRequests = () => calls.filter((c) => c.path === '/api/adventure/battles' && c.method === 'POST').length
async function answer() { await until(() => evaluate('!!document.querySelector(".answer-fields:not(:disabled)")'), 'answer enabled'); await click('document.querySelector("input[type=radio]")'); await click(button('Submit answer')); if (await evaluate('!!document.querySelector("[role=status]")') && (await text()).includes('uncertain result')) await click(button('Retry')); await until(() => evaluate('!!document.querySelector(".encounter-result")'), 'answer receipt') }
async function finish() { await click(button('Finish review')); await click(button('Return to the adventure')) }

try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 600, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?demo=indoor' }); await hasText('Sign In')
  assert.equal(await evaluate('document.querySelectorAll("input[type=file]").length'), 0)
  await fill('input[autocomplete=username]', 'fixture-player'); await fill('input[type=password]', 'fixture-password'); await click(button('Sign In'))
  await hasText('Retry study sets'); await click(button('Retry study sets')); await hasText(pack().name); await screenshot('saved-library')
  await evaluate(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name).find(u=>u.includes('/three.js?'));const T=await import(u),old=T.PerspectiveCamera.prototype.updateProjectionMatrix;T.PerspectiveCamera.prototype.updateProjectionMatrix=function(){window.__overhaulCamera=this;return old.call(this)};window.__overhaulRestore=()=>T.PerspectiveCamera.prototype.updateProjectionMatrix=old})()`)
  await click('document.querySelector(".study-set-list button")'); await until(() => evaluate('!!document.querySelector(".palace-hud")'), 'forest')
  assert.equal(uploads, 0); assert.match(await text(), /80\/100/)
  await click('document.querySelector("canvas")')
  const seed = await evaluate('window.__overhaulCamera.parent.userData.layoutSeed'), layout = generateForestLayout(seed)
  const item = layout.collectibles[0]
  await position(item.x + 1.8, forestHeight(item.x + 1.8, item.z, layout) + 1.6, item.z); await key('keyDown', 'e'); await key('keyUp', 'e'); await hasText('Study this concept')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".adventure-vitals")).display!=="none"'), true)
  assert.equal(await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'), true)
  await screenshot('item-hud'); await answer(); await finish()
  for (let i = 0; i < 2; i++) {
    const spot = layout.encounters[i], before = battleRequests()
    await position(spot.x, forestHeight(spot.x, spot.z + 2, layout) + 1.6, spot.z + 2); await hasText(names[i])
    assert.equal(battleRequests(), before + 1); assert.doesNotMatch(await text(), /Study this concept/)
    await click(button('Return to the adventure')); await wait(500)
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'), 0); assert.equal(battleRequests(), before + 1)
    await key('keyDown', 'Escape'); await key('keyUp', 'Escape'); await hasText('Continue your question'); await click(button('Continue your question'))
    await answer(); await finish()
  }
  await position(0, 9.6, -31.8); await key('keyDown', 'w'); await wait(500); await key('keyUp', 'w'); await hasText('The royal hall'); await click(button('Return to the adventure'))
  await position(38, 1.6, 10); await key('keyDown', 'd'); await wait(900); await key('keyUp', 'd')
  assert.ok((await evaluate('window.__overhaulCamera.position.x')) > 40, 'walk through side arch into observatory')
  await screenshot('castle-wing')
  await position(0, 4.6, -88.8); await key('keyDown', 'w'); await wait(600); await key('keyUp', 'w')
  assert.ok((await evaluate('window.__overhaulCamera.position.z')) > -90, 'closed prison gate blocks movement')
  await position(1, 4.6, -45); await key('keyDown', 'e'); await key('keyUp', 'e'); await hasText('Castle Dragon'); assert.match(await text(), /Question 1\/1/)
  await answer(); await finish(); assert.equal(remote.adventure_completed, true)
  await position(0, 4.6, -88.8); await key('keyDown', 'w'); await wait(700); await key('keyUp', 'w')
  assert.ok((await evaluate('window.__overhaulCamera.position.z')) < -90, 'server victory opens prison gate')
  await position(HALL.princess.x, 4.6, HALL.princess.z + 2.4); await key('keyDown', 'e'); await key('keyUp', 'e'); await hasText('The dragon has fallen')
  assert.doesNotMatch(await text(), /princess has been rescued|550 XP/i); await screenshot('dragon-result')
  await click(button('View leaderboard')); await hasText('The all-time leaderboard is not available yet.'); await click(button('Return to the adventure'))
  await key('keyDown', 'Escape'); await key('keyUp', 'Escape'); await hasText('Return to study sets'); await click(button('Return to study sets')); await hasText('Your study sets')
  const before = calls.length; await send('Page.reload'); await hasText('Sign In'); assert.equal(calls.length, before)
  await fill('input[autocomplete=username]', 'fixture-player'); await fill('input[type=password]', 'fixture-password'); await click(button('Sign In')); await hasText(pack().name); await click('document.querySelector(".study-set-list button")'); await until(() => evaluate('!!document.querySelector(".palace-hud")'), 'resumed world')
  assert.equal(uploads, 0); assert.match(await text(), /3\/3 guardians defeated/)
  assert.deepEqual(exceptions, []); assert.deepEqual(fixtureErrors, [])
  const repeated = calls.filter((c) => c.path.endsWith('/answer') && c.key === calls.find((c) => c.path.includes('attempt-adventure-0') && c.path.endsWith('/answer')).key)
  assert.equal(repeated.length, 2); assert.equal(repeated[0].body, repeated[1].body)
  console.log(JSON.stringify({ validation: 'SIMULATED contract fixtures; no live backend verification', checks: 'saved library/retry/resume without uploads, item-only teaching, HUD during questions, automatic monsters once per approach, same-key retry, castle wing keyboard navigation, locked/open prison, confirmed dragon result, unavailable leaderboard, reload/relogin', uploads, guardians, requests: calls.length, exceptions }))
} catch (error) { await screenshot('failure').catch(() => {}); console.error((await text()).slice(-3000)); throw error }
finally { await evaluate('window.__overhaulRestore?.()').catch(() => {}); await send('Fetch.disable'); ws.close() }
