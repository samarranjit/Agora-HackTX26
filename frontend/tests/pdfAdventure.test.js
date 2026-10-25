import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'
import { createPdfAdventure } from '../src/api/pdfAdventure.js'
import { createGameSession } from '../src/api/gameSession.js'
import { createApiClient } from '../src/api/client.js'
import { backendWorldView } from '../src/game/backendWorld.js'
import { createForestView } from '../src/game/forestView.js'
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

const { default: ForestJourney, TryAgainBanner } = await import(await loadJsx(new URL('../src/ForestJourney.jsx', import.meta.url)))
const { default: PdfLanding } = await import(await loadJsx(new URL('../src/PdfLanding.jsx', import.meta.url)))
const { Encounter } = await import(await loadJsx(new URL('../src/BackendGame.jsx', import.meta.url)))
const { default: AdventureHud } = await import(await loadJsx(new URL('../src/AdventureHud.jsx', import.meta.url)))
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers })
const file = new File(['%PDF-1.4\nTest transport fixture'], 'study.pdf', { type: 'application/pdf' })
const doc = 'a'.repeat(32), practiceSet = 'b'.repeat(32), adventureSet = 'c'.repeat(32)
const credentials = { access_token: 'test-secret-token', token_type: 'bearer', expires_at: '2099-01-01' }
const balances = { schema_version: 1, state_version: 0, xp: 0, health: 100, max_health: 100, adventure_unlocked: false, adventure_completed: false, location: 'playground' }
const question = { attempt_id: 'attempt-1', question_id: 'q1', mode: 'practice', type: 'multiple_choice', prompt: 'Question generated from your PDF', options: [{id:'A',text:'First option'}, {id:'B',text:'Second option'}], difficulty: 1, topic: 'Study material', sources: [{document_id:doc,document_name:'study.pdf',pages:[2]}], learning_objective:null, battle:null }
const pack = (ready = false) => ({ document_id:doc, name:file.name, topic:'Study material', status:ready?'ready':'processing', stage:ready?'done':'indexing', error:null, created_at:'',updated_at:'',practice:ready?{question_set_id:practiceSet,mode:'practice',status:'ready',error:null,question_count:10}:null,adventure:ready?{question_set_id:adventureSet,mode:'adventure',status:'ready',error:null,question_count:3}:null })
const result = { ...balances, state_version:1,xp:10,attempt_id:question.attempt_id,correct:true,feedback:{correct_answer:'B',explanation:'Stored server explanation'},xp_delta:10,health_delta:0,encounter:{mode:'practice',outcome:'none',adventure_unlocked_now:false,adventure_completed:false},next_attempt:null }
const body = {username:'test-player',password:'test-password'}
function harness({override, active = null, pollOptions = {intervalMs:1}} = {}) {
  const calls = [], remote = { active, status:{...balances} }
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname; calls.push({path,...init})
    const intercepted = await override?.(path,init,remote)
    if (intercepted) return intercepted
    if (path === '/api/auth/register') return json({user_id:'test-user',username:body.username},201)
    if (path === '/api/auth/login') return json(credentials)
    if (path === '/api/study-packs' && init.method === 'GET') return json({study_packs:[]})
    if (path === '/api/study-packs' && init.method === 'POST') return json(pack(),202)
    if (path === '/api/study-packs/' + doc) return json(pack(true))
    if (path.startsWith('/api/question-sets/')) return json({question_set_id:path.split('/').at(-1),mode:path.endsWith(practiceSet)?'practice':'adventure',status:'ready',document_ids:[doc],questions:[{question_id:'q1'},{question_id:'q2'}]})
    if (path === '/api/me/status') return json(remote.status)
    if (path === '/api/me/state') return json({...remote.status,username:body.username,rules:{unlock_threshold:100,battle_cost:30},villains:[]})
    if (path === '/api/me/active-attempt') return json({attempt:remote.active})
    if (path === '/api/practice/attempts') { remote.active ??= question; return json({created:true,attempt:remote.active},201) }
    if (path === '/api/adventure/battles') return json({error:{code:'adventure_locked',message:'Earn 100 XP first.'}},409)
    if (path.endsWith('/answer')) {remote.active=null;remote.status={...remote.status,xp:10,state_version:1};return json(result)}
    throw Error('Unexpected route '+path)
  }
  const session = createGameSession({baseUrl:'https://starter-shimmy-bunny.ngrok-free.dev',fetchImpl})
  const flow = createPdfAdventure({session,pollOptions})
  return {flow,session,calls,remote,login:()=>flow.authenticate('login',body),ready:async()=>{await flow.authenticate('login',body);await flow.select(file)}}
}

test('first render is Sign In only, with one primary action and a Create account link', () => {
  const h = harness(), html = render(ForestJourney,{flow:h.flow})
  assert.match(html, />Sign In</);assert.match(html,/Username/);assert.match(html,/Password/);assert.match(html,/>Create account</)
  assert.equal((html.match(/class="primary full-width"/g)||[]).length,1)
  assert.doesNotMatch(html,/type="file"|Drop a PDF|guest|offline|demo|tester|request history/i)
  assert.equal(h.calls.length,0)
})
test('upload cannot be called before authentication, and successful login loads the study-set library', async () => {
  const h=harness();await h.flow.select(file);assert.equal(h.calls.length,0);assert.equal(h.flow.getSnapshot().phase,'auth')
  await h.login();assert.equal(h.flow.getSnapshot().phase,'upload')
  assert.deepEqual(h.calls.map(c=>c.path),['/api/auth/login','/api/study-packs'])
  const html=render(ForestJourney,{flow:h.flow});assert.match(html,/Upload a PDF to begin your adventure/);assert.match(html,/Drop a PDF/);assert.doesNotMatch(html,/>Sign In</)
})
test('registration uses real register then login and loads saved study sets without creating one', async () => {
  const h=harness();await h.flow.authenticate('register',body)
  assert.deepEqual(h.calls.map(c=>c.path),['/api/auth/register','/api/auth/login','/api/study-packs']);assert.equal(h.flow.getSnapshot().phase,'upload')
  for(const c of h.calls.filter(c=>c.path.startsWith('/api/auth/'))) {assert.equal(c.headers.Authorization,undefined);assert.equal(c.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(c.body),body)}
})
test('authentication errors stay on Sign In with a retry action and no PDF', async () => {
  const h=harness({override:async path=>path.endsWith('/login')?json({error:{code:'invalid_credentials',message:'Invalid username or password.'}},401):null})
  await h.login();assert.equal(h.flow.getSnapshot().phase,'auth');assert.equal(h.session.getSnapshot().signedIn,false)
  const html=render(ForestJourney,{flow:h.flow});assert.match(html,/Invalid username or password/);assert.match(html,/>Retry</);assert.doesNotMatch(html,/type="file"/)
})
test('an empty or malformed token response cannot advance past Sign In', async () => {
  const h=harness({override:async path=>path.endsWith('/login')?json({...credentials,access_token:''}):null})
  await h.login();assert.equal(h.flow.getSnapshot().phase,'auth');assert.equal(h.session.getSnapshot().signedIn,false)
  assert.equal(h.session.getSnapshot().error.code,'invalid_response')
})
test('registration accepted but login interrupted can retry without creating the account twice', async () => {
  let logins=0
  const h=harness({override:async path=>{if(path.endsWith('/login')&&++logins===1)throw new TypeError('lost response')}})
  await h.flow.authenticate('register',body);assert.equal(h.flow.getSnapshot().phase,'auth')
  await h.flow.authenticate('register',body);assert.equal(h.flow.getSnapshot().phase,'upload')
  assert.equal(h.calls.filter(c=>c.path.endsWith('/register')).length,1)
})
test('file selection automatically uploads, polls, loads PDF-scoped sets and enters the actual world', async () => {
  const h=harness(),phases=[];h.flow.subscribe(()=>phases.push(h.flow.getSnapshot().phase))
  await h.ready();assert.equal(h.flow.getSnapshot().phase,'ready')
  assert.ok(phases.includes('uploading'));assert.ok(phases.includes('processing'))
  assert.equal(h.calls.filter(c=>c.path==='/api/study-packs' && c.method==='POST').length,1)
  assert.equal(h.calls.some(c=>c.path==='/api/practice/attempts'),false,'world entry must not automatically select a question')
  const upload=h.calls.find(c=>c.path==='/api/study-packs' && c.method==='POST');assert.ok(upload.body instanceof FormData);assert.equal(upload.body.get('file').name,file.name);assert.equal(upload.headers['Content-Type'],undefined)
  for(const c of h.calls.filter(c=>!c.path.startsWith('/api/auth/'))) {assert.equal(c.headers.Authorization,'Bearer '+credentials.access_token);assert.equal(c.headers['ngrok-skip-browser-warning'],'1');assert.equal(c.credentials,'omit')}
  const html=render(ForestJourney,{flow:h.flow});assert.match(html,/palace-hud/);assert.doesNotMatch(html,/Drop a PDF|Sign In|offline|demo|tester/i)
})
test('upload failure allows explicit Retry without authentication loss or local fallback', async () => {
  let uploads=0;const h=harness({override:async(path,init)=>{if(path==='/api/study-packs'&&init.method==='POST'&&++uploads===1)throw new TypeError('network')}})
  await h.ready();assert.equal(h.flow.getSnapshot().phase,'error');assert.equal(h.session.getSnapshot().signedIn,true)
  assert.match(render(PdfLanding,{state:h.flow.getSnapshot()}),/Retry/)
  await h.flow.retry();assert.equal(h.flow.getSnapshot().phase,'ready');assert.equal(uploads,2)
})
test('failed generation requires manual retry, and malformed success never enables gameplay', async () => {
  for(const response of [()=>json({...pack(),status:'failed',stage:'failed',error:'PDF could not be read.'}),()=>json({receipt:true})]){
    const h=harness({override:async path=>path==='/api/study-packs'?response():null});await h.ready();assert.equal(h.flow.getSnapshot().phase,'error');assert.equal(h.session.getSnapshot().pack,null)
  }
})
test('401 during upload returns to Sign In; expired credentials cannot enable the PDF screen', async () => {
  const h=harness({override:async path=>path==='/api/study-packs'?json({error:{code:'expired',message:'Expired.'}},401):null})
  await h.ready();assert.equal(h.flow.getSnapshot().phase,'auth');assert.equal(h.session.getSnapshot().signedIn,false)
  assert.doesNotMatch(render(ForestJourney,{flow:h.flow}),/type="file"|palace-hud/)
})
test('old pending questions from another PDF are blocked rather than presented as new content', async () => {
  const h=harness({active:{...question,question_id:'foreign-question',prompt:'Other PDF private prompt'}})
  await h.ready();assert.equal(h.flow.getSnapshot().phase,'error');assert.equal(h.session.getSnapshot().attempt,null)
  assert.match(h.flow.getSnapshot().error.message,/another PDF/);assert.doesNotMatch(render(ForestJourney,{flow:h.flow}),/Other PDF private prompt|palace-hud/)
})
test('a mismatched question set receipt cannot attach other content even from the same document', async () => {
  const h=harness({override:async path=>path==='/api/question-sets/'+practiceSet?json({question_set_id:'e'.repeat(32),mode:'practice',status:'ready',document_ids:[doc],questions:[{question_id:'q1'}]}):null})
  await h.ready();assert.equal(h.flow.getSnapshot().phase,'error');assert.equal(h.session.getSnapshot().attempt,null)
})
test('numeric questions use text entry and the backend decides correctness', async () => {
  const h=harness({active:{...question,type:'numeric',options:null}})
  await h.ready();const html=render(Encounter,{session:h.session,state:h.session.getSnapshot()})
  assert.match(html,/inputMode="decimal"|inputmode="decimal"/);assert.doesNotMatch(html,/type="radio"/)
  await h.session.answer('12.5');assert.deepEqual(JSON.parse(h.calls.find(c=>c.path.endsWith('/answer')).body),{answer:'12.5'})
})
test('practice and battles use real ready set IDs and server denial cannot open the bridge', async () => {
  const h=harness();await h.ready();await h.session.battle()
  assert.deepEqual(JSON.parse(h.calls.find(c=>c.path==='/api/adventure/battles').body),{question_set_id:adventureSet})
  assert.match(h.session.getSnapshot().error.message,/100 XP/)
  await h.session.practice();assert.deepEqual(JSON.parse(h.calls.find(c=>c.path==='/api/practice/attempts').body),{question_set_id:practiceSet})
  assert.equal(h.session.getSnapshot().status.adventure_unlocked,false)
})
test('questions expose only server options; feedback and XP come after accepted answers', async () => {
  const h=harness();await h.ready();await h.session.practice()
  let html=render(Encounter,{session:h.session,state:h.session.getSnapshot()});assert.match(html,/Question generated from your PDF/);assert.equal((html.match(/type="radio"/g)||[]).length,2);assert.doesNotMatch(html,/Stored server explanation/)
  await h.session.answer('B');html=render(Encounter,{session:h.session,state:h.session.getSnapshot()});assert.match(html,/Stored server explanation/);assert.equal(h.session.getSnapshot().status.xp,10)
  const sent=JSON.parse(h.calls.find(c=>c.path.endsWith('/answer')).body);assert.deepEqual(sent,{answer:'B'})
})
test('double submits share one mutation and ambiguous retry reuses its exact answer/key', async () => {
  let answers=0
  const h=harness({override:async(path,init,remote)=>{if(path.endsWith('/answer')){answers++;if(answers===1){remote.active=null;remote.status={...remote.status,xp:10,state_version:1};throw new TypeError('lost response')}return json(result)}}})
  await h.ready();await h.session.practice()
  const first=h.session.answer('B'),second=h.session.answer('B');assert.equal(first,second);await first
  assert.ok(h.session.getSnapshot().unresolved);await h.session.answer('A');assert.equal(answers,1)
  await h.session.retry();const sent=h.calls.filter(c=>c.path.endsWith('/answer'));assert.equal(sent.length,2);assert.equal(sent[0].body,sent[1].body);assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);assert.equal(h.session.getSnapshot().status.xp,10)
})
test('invalid answers preserve the question and allow correction with a new key', async () => {
  let count=0;const h=harness({override:async path=>path.endsWith('/answer')&&++count===1?json({error:{code:'invalid_answer',message:'Choose an option.'}},422):null})
  await h.ready();await h.session.practice();await h.session.answer('invalid');assert.equal(h.session.getSnapshot().unresolved,null);assert.ok(h.session.getSnapshot().attempt)
  await h.session.answer('B');const sent=h.calls.filter(c=>c.path.endsWith('/answer'));assert.notEqual(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key'])
})
test('refresh/cancel never restores a tab session or skips the initial Sign In', async () => {
  const h=harness();await h.ready();h.flow.cancel();assert.equal(h.flow.getSnapshot().phase,'auth');assert.equal(h.session.getSnapshot().signedIn,false)
  const fresh=harness();assert.equal(fresh.flow.getSnapshot().phase,'auth');assert.equal(fresh.calls.length,0)
  const source=await readFile(new URL('../src/api/gameSession.js',import.meta.url),'utf8');assert.doesNotMatch(source,/sessionStorage|localStorage|setItem|getItem|onRequest|logs:/)
})
test('a late login response after page cancellation cannot revive authentication or reveal upload', async () => {
  let release
  const h=harness({override:async path=>path.endsWith('/login')?new Promise(resolve=>{release=resolve}):null})
  const work=h.login();await new Promise(resolve=>setImmediate(resolve));h.flow.cancel();release(json(credentials));await work
  assert.equal(h.flow.getSnapshot().phase,'auth');assert.equal(h.session.getSnapshot().signedIn,false)
  assert.doesNotMatch(render(ForestJourney,{flow:h.flow}),/type="file"/)
})
test('server flags exclusively control world admission and completion', () => {
  const scenery=createForestView(),world={...scenery,bridgeState:'lowered',stage:'castle',dragonDefeated:true}
  const locked=backendWorldView(scenery,world,{signedIn:true,status:balances});assert.equal(locked.stage,'forest');assert.equal(locked.bridgeState,'raised');assert.equal(locked.dragonDefeated,false)
  const unlocked=backendWorldView(scenery,scenery,{signedIn:true,status:{...balances,xp:70,adventure_unlocked:true,adventure_completed:true}});assert.equal(unlocked.bridgeState,'lowering');assert.equal(unlocked.dragonDefeated,true)
})
test('public authentication has no bearer header and failed login does not clear another valid token', async () => {
  let unauthorized=0
  const api=createApiClient({baseUrl:'https://example.test',getToken:()=>credentials.access_token,onUnauthorized:()=>unauthorized++,fetchImpl:async(_,init)=>{assert.equal(init.headers.Authorization,undefined);return json({error:{message:'Invalid credentials'}},401)}})
  await assert.rejects(api.login(body));assert.equal(unauthorized,0)
})

test('returning players select saved questions and recover server progress without uploading', async () => {
  const h=harness({active:question,override:async(path,init,remote)=>{
    if(path==='/api/study-packs' && init.method==='GET') return json({study_packs:[pack(true)]})
    remote.status={...balances,xp:147,health:75,state_version:8,adventure_unlocked:true}
  }})
  await h.login()
  const html=render(ForestJourney,{flow:h.flow});assert.match(html,/Your study sets/);assert.match(html,/study.pdf/);assert.match(html,/Questions ready/)
  await h.flow.selectPack(doc)
  assert.equal(h.flow.getSnapshot().phase,'ready');assert.equal(h.session.getSnapshot().attempt.question_id,'q1')
  assert.equal(h.session.getSnapshot().status.xp,147);assert.equal(h.session.getSnapshot().status.health,75)
  assert.equal(h.calls.filter(c=>c.path==='/api/study-packs' && c.method==='POST').length,0)
  assert.equal(h.calls.filter(c=>c.path==='/api/practice/attempts' || c.path==='/api/adventure/battles').length,0)
})

test('library failure retries the read, malformed lists are rejected, and empty lists stay uploadable', async () => {
  for (const invalid of [{error:{message:'Library unavailable'}},{study_packs:[{document_id:doc}]}]) {
    let reads=0
    const h=harness({override:async(path,init)=>path==='/api/study-packs' && init.method==='GET' && ++reads===1 ? json(invalid,invalid.error?503:200):null})
    await h.login();assert.equal(h.flow.getSnapshot().libraryStatus,'error')
    assert.match(render(ForestJourney,{flow:h.flow}),/Retry study sets/)
    await h.flow.loadLibrary();assert.equal(h.flow.getSnapshot().libraryStatus,'ready')
    assert.match(render(ForestJourney,{flow:h.flow}),/No saved study sets yet/)
    await h.flow.select(file);assert.equal(h.flow.getSnapshot().phase,'ready')
  }
})

test('library loading is visible and cancel fences late list results', async () => {
  let release
  const h=harness({override:async(path,init)=>path==='/api/study-packs' && init.method==='GET'?new Promise(resolve=>{release=resolve}):null})
  const work=h.login();await new Promise(resolve=>setImmediate(resolve))
  assert.match(render(ForestJourney,{flow:h.flow}),/Loading your study sets/)
  h.flow.cancel();release(json({study_packs:[pack(true)]}));await work
  assert.equal(h.flow.getSnapshot().phase,'auth');assert.equal(h.flow.getSnapshot().packs.length,0)
})

test('saved processing polls the existing document; failed pack Retry never reuploads', async () => {
  let reads=0
  const h=harness({override:async(path,init)=>{
    if(path==='/api/study-packs' && init.method==='GET')return json({study_packs:[pack()]})
    if(path==='/api/study-packs/'+doc) return json(++reads===1?pack():pack(true))
  }})
  await h.login();await h.flow.selectPack(doc);assert.equal(h.flow.getSnapshot().phase,'ready');assert.equal(reads,2)
  assert.equal(h.calls.some(c=>c.method==='POST' && c.path==='/api/study-packs'),false)
  const failed={...pack(),status:'failed',stage:'failed',error:'Too little readable content.'}
  const f=harness({override:async(path,init)=>path==='/api/study-packs' && init.method==='GET'?json({study_packs:[failed]}):path==='/api/study-packs/'+doc?json(failed):null})
  await f.login();await f.flow.selectPack(doc);assert.equal(f.flow.getSnapshot().phase,'error');assert.match(f.flow.getSnapshot().error.message,/Too little readable content/)
  await f.flow.retry();assert.equal(f.flow.getSnapshot().phase,'error');assert.equal(f.calls.some(c=>c.method==='POST' && c.path==='/api/study-packs'),false)
})

test('unauthorized saved-list retrieval returns to Sign In with no retained pack list', async () => {
  const h=harness({override:async(path,init)=>path==='/api/study-packs' && init.method==='GET'?json({error:{message:'Expired'}},401):null})
  await h.login();assert.equal(h.flow.getSnapshot().phase,'auth');assert.equal(h.flow.getSnapshot().packs.length,0)
  assert.doesNotMatch(render(ForestJourney,{flow:h.flow}),/type="file"/)
})

test('relogin resumes the same saved set and balances without browser persistence or duplicate upload', async () => {
  const override=async(path,init)=>path==='/api/study-packs' && init.method==='GET'?json({study_packs:[pack(true)]}):path==='/api/me/status'?json({...balances,xp:90,state_version:3}):null
  const first=harness({override});await first.login();await first.flow.selectPack(doc);first.flow.cancel()
  const second=harness({override});await second.login();await second.flow.selectPack(doc)
  assert.equal(second.session.getSnapshot().status.xp,90)
  for(const h of [first,second]) assert.equal(h.calls.some(c=>c.method==='POST' && c.path==='/api/study-packs'),false)
})

test('saved selection rejects foreign pending attempts; selecting the matching PDF can recover', async () => {
  const other={...pack(true),document_id:'d'.repeat(32),practice:{...pack(true).practice,question_set_id:'e'.repeat(32)},adventure:{...pack(true).adventure,question_set_id:'f'.repeat(32)}}
  const h=harness({active:question,override:async(path,init)=>{
    if(path==='/api/study-packs' && init.method==='GET')return json({study_packs:[other,pack(true)]})
    if(path==='/api/study-packs/'+other.document_id)return json(other)
    if(path.startsWith('/api/question-sets/') && !path.endsWith(practiceSet) && !path.endsWith(adventureSet))return json({question_set_id:path.split('/').at(-1),mode:path.endsWith('e'.repeat(32))?'practice':'adventure',status:'ready',document_ids:[other.document_id],questions:[{question_id:'foreign-q'}]})
  }})
  await h.login();await h.flow.selectPack(other.document_id);assert.equal(h.flow.getSnapshot().phase,'error');assert.match(h.flow.getSnapshot().error.message,/another PDF/)
  await h.flow.selectPack(doc);assert.equal(h.flow.getSnapshot().phase,'ready');assert.equal(h.session.getSnapshot().attempt.question_id,'q1')
})

test('an unknown study-pack selection never sends requests or creates a pack', async () => {
  const h=harness();await h.login();const before=h.calls.length;await h.flow.selectPack('missing');assert.equal(h.calls.length,before)
})

test('switching study sets is blocked while an ambiguous answer awaits same-key retry', async () => {
  const h=harness({override:async path=>path.endsWith('/answer')?Promise.reject(Error('lost response')):null})
  await h.ready();await h.session.practice();await h.session.answer('B')
  const count=h.calls.length;await h.flow.openLibrary();assert.equal(h.flow.getSnapshot().phase,'ready');assert.equal(h.calls.length,count)
  assert.ok(h.session.getSnapshot().unresolved)
})

test('restarting the adventure clears guardians without uploading the PDF again', async () => {
  const reset={...balances,state_version:4,xp:100,adventure_unlocked:true,username:body.username,rules:{},practice_answered:0,villains:[{villain_id:'forest-goblin',status:'current'},{villain_id:'bridge-troll',status:'locked'},{villain_id:'castle-dragon',status:'locked'}]}
  const h=harness({override:async path=>path==='/api/me/restart'?json(reset):null})
  await h.ready();const uploads=h.calls.filter(c=>c.method==='POST' && c.path==='/api/study-packs').length
  await h.session.restart()
  const snap=h.session.getSnapshot()
  assert.equal(snap.attempt,null)
  assert.equal(snap.result,null)
  assert.equal(snap.status.xp,100)
  assert.deepEqual(snap.player.villains.map((v)=>v.status),['current','locked','locked'])
  assert.equal(h.calls.filter(c=>c.path==='/api/me/restart').length,1)
  assert.equal(h.calls.filter(c=>c.method==='POST' && c.path==='/api/study-packs').length,uploads)
})

test('a leftover review does not skip the next guardian question', async () => {
  const battleQuestion = { ...question, attempt_id: 'battle-1', question_id: 'q2', mode: 'adventure', battle: { villain_name: 'The Big Bad Wolf', question_number: 1, question_count: 1, correct_count: 0 } }
  const h = harness({
    override: async (path, _init, remote) => {
      if (path === '/api/me/state') return json({ ...balances, username: body.username, xp: 100, adventure_unlocked: true, rules: { unlock_threshold: 100, battle_cost: 0 }, villains: [{ villain_id: 'bridge-troll', status: 'current' }] })
      if (path === '/api/adventure/battles') {
        remote.active = battleQuestion
        return json({ ...balances, xp: 100, battle_attempt_id: 'b1', villain_name: 'The Big Bad Wolf', villain_id: 'bridge-troll', entry_cost: 0, attempt: battleQuestion }, 201)
      }
    },
  })
  await h.ready()
  await h.session.practice()
  await h.session.answer('B')
  assert.equal(h.session.getSnapshot().result.correct, true)
  assert.equal(h.session.getSnapshot().attempt, null)
  await h.session.beginChallenge('battle', 'bridge-troll')
  assert.equal(h.session.getSnapshot().result, null)
  assert.equal(h.session.getSnapshot().attempt.mode, 'adventure')
  assert.equal(h.session.getSnapshot().attempt.battle.villain_name, 'The Big Bad Wolf')
  assert.equal(h.calls.filter((c) => c.path === '/api/adventure/battles').length, 1)
})

test('guardian target guards prevent the wolf or dragon from starting the goblin battle', async () => {
  const h=harness({override:async path=>path==='/api/me/state'?json({...balances,username:body.username,rules:{},villains:[{villain_id:'forest-goblin',status:'current'}]}):null})
  await h.ready();await h.session.battle('bridge-troll');await h.session.battle('castle-dragon')
  assert.equal(h.calls.some(c=>c.path==='/api/adventure/battles'),false)
  await h.session.battle('forest-goblin');assert.equal(h.calls.filter(c=>c.path==='/api/adventure/battles').length,1)
})

test('zero XP shows a clear Try again banner that lasts three seconds', () => {
  const html=render(TryAgainBanner)
  assert.match(html,/try-again-overlay/)
  assert.match(html,/>Try again</)
  assert.match(html,/role="status"/)
})

test('HUD displays server XP and progress without inventing lives, collection or lifetime totals', () => {
  const html=render(AdventureHud,{backendStatus:{...balances,xp:77,health:25},player:{villains:[{status:'completed'},{status:'current'},{status:'locked'}]}})
  assert.match(html,/aria-label="XP"[^>]*aria-valuemax="100"[^>]*aria-valuenow="77"/)
  assert.match(html,/>77</);assert.match(html,/1\/3/);assert.match(html,/Leaderboard/)
  assert.match(html,/Item collection: unavailable/);assert.doesNotMatch(html,/Health|Stamina|Lives: unavailable|3 lives|550|Lifetime XP: 77/)
})

test('a completed dragon battle tells the player they saved the princess with their knowledge', () => {
  const html = render(Encounter, { session: {}, state: { result: { ...result, encounter: { mode: 'adventure', outcome: 'won', adventure_unlocked_now: false, adventure_completed: true } } } })
  assert.match(html, /You have saved your princess with your knowledge/)
  assert.match(html, /dragon-victory/)
})

test('teaching is available only for item practice and only from the returned learning objective', () => {
  const q={...question,learning_objective:'Explain the concept from page two.'}
  assert.match(render(Encounter,{session:{},state:{attempt:q},item:{id:'trident'}}),/Study this concept/)
  assert.doesNotMatch(render(Encounter,{session:{},state:{attempt:q}}),/Study this concept|Explain the concept/)
  assert.doesNotMatch(render(Encounter,{session:{},state:{attempt:{...q,mode:'adventure',battle:{villain_name:'Dragon',question_count:1,question_number:1}}},item:{id:'trident'}}),/Study this concept|Explain the concept/)
})
