import test from 'node:test'
import assert from 'node:assert/strict'
import { createEncounterTrigger } from '../src/game/encounterTrigger.js'
import { createForestView } from '../src/game/forestView.js'
import { backendWorldView } from '../src/game/backendWorld.js'
import { createHallWorld, CASTLE_APPROACH, HALL, HALL_FLOOR, hallGround, hallHeight, forestEncounterAt, forestEncounterRange, forestGuardianAnchor, forestGuardianApproachable, forestHeight, speechAnchorFromProjected, usesCharacterSpeech } from '../src/forestLayout.js'
import { createCastleHallScene } from '../src/forestScene.js'
import { createPlayerMotion, WALK_SPEED } from '../src/playerMotion.js'
import { EYE_HEIGHT } from '../src/playerControls.js'

test('automatic encounters fire once per approach, wait for eligibility and never loop on close/retry', () => {
  const trigger=createEncounterTrigger()
  assert.equal(trigger.update('goblin',false),null);assert.equal(trigger.update('goblin',true),'goblin')
  for(let i=0;i<200;i++) assert.equal(trigger.update('goblin',true),null)
  assert.equal(trigger.update('goblin',false),null);assert.equal(trigger.update('goblin',true),null)
  trigger.update(null,false);assert.equal(trigger.update('goblin',true),'goblin')
  assert.equal(trigger.update('wolf',true),'wolf');assert.equal(trigger.update('wolf',true),null)
})

test('forest guardian speech sits above the goblin or wolf, never the dragon', () => {
  const run=createForestView({seed:'speech'})
  assert.equal(usesCharacterSpeech('goblin'),true)
  assert.equal(usesCharacterSpeech('wolf'),true)
  assert.equal(usesCharacterSpeech('dragon'),false)
  const goblin=run.layout.encounters.find((e)=>e.id==='goblin')
  const wolf=run.layout.encounters.find((e)=>e.id==='wolf')
  const aboveGoblin=forestGuardianAnchor('goblin',run.layout)
  const aboveWolf=forestGuardianAnchor('wolf',run.layout)
  assert.equal(aboveGoblin.x,goblin.x);assert.equal(aboveGoblin.z,goblin.z)
  assert.ok(aboveGoblin.y>forestHeight(goblin.x,goblin.z,run.layout)+2)
  assert.ok(aboveWolf.y>forestHeight(wolf.x,wolf.z,run.layout)+2)
  assert.equal(forestGuardianAnchor('dragon',run.layout),null)
  assert.deepEqual(speechAnchorFromProjected({x:0,y:0,z:0}),{x:50,y:38,visible:true})
  assert.equal(speechAnchorFromProjected({x:0,y:0,z:2}).visible,false)
  assert.ok(speechAnchorFromProjected({x:0,y:1,z:0}).y >= 10)
})

test('guardians stay hidden until the server says the player can answer them', () => {
  const scenery=createForestView({seed:'close'})
  const rules={unlock_threshold:100,battle_cost:0}
  const locked=backendWorldView(scenery,scenery,{signedIn:true,status:{adventure_unlocked:false,adventure_completed:false,xp:40},player:{rules,villains:[{villain_id:'forest-goblin',status:'current'}]}})
  const goblin=locked.layout.encounters.find((e)=>e.id==='goblin')
  const at={x:goblin.x,z:goblin.z,y:forestHeight(goblin.x,goblin.z,locked.layout)+1.6}
  assert.deepEqual(locked.summonableEnemyIds,[])
  assert.equal(forestEncounterAt(at,locked),null)
  assert.equal(forestGuardianApproachable(locked,'goblin'),false)
  const short=backendWorldView(scenery,scenery,{signedIn:true,status:{adventure_unlocked:true,adventure_completed:false,xp:50},player:{rules,villains:[{villain_id:'forest-goblin',status:'current'}]}})
  assert.deepEqual(short.summonableEnemyIds,[])
  const ready=backendWorldView(scenery,scenery,{signedIn:true,status:{adventure_unlocked:true,adventure_completed:false,xp:100},player:{rules,villains:[{villain_id:'forest-goblin',status:'current'},{villain_id:'bridge-troll',status:'locked'}]}})
  assert.deepEqual(ready.summonableEnemyIds,['goblin'])
  assert.equal(forestEncounterAt(at,ready),'goblin')
  assert.equal(forestGuardianApproachable(ready,'wolf'),false)
  assert.equal(forestGuardianApproachable({...ready,defeatedEnemyIds:['goblin']},'goblin'),false)
})

test('proximity checks respect elevation and confirmed defeated monsters', () => {
  const run={...createForestView({seed:'auto'}),summonableEnemyIds:['goblin']}, enemy=run.layout.encounters[0]
  const at={...enemy,y:forestHeight(enemy.x,enemy.z,run.layout)+1.6}
  const appear={...at,x:enemy.x+6}
  assert.equal(forestEncounterRange(appear,enemy,run.layout),true)
  assert.equal(forestEncounterAt(appear,run),null)
  assert.equal(forestEncounterAt({...at,x:enemy.x+3},run),'goblin')
  assert.equal(forestEncounterAt(at,run),'goblin');assert.equal(forestEncounterAt({...at,y:at.y+8},run),null)
  assert.equal(forestEncounterAt(at,{...run,defeatedEnemyIds:['goblin']}),null)
})

test('only the current server guardian is eligible; health, XP and proximity never declare victory', () => {
  const scenery=createForestView(), player={rules:{unlock_threshold:100,battle_cost:0},villains:[{villain_id:'forest-goblin',status:'completed'},{villain_id:'bridge-troll',status:'current'},{villain_id:'castle-dragon',status:'locked'}]}
  const server={signedIn:true,status:{adventure_unlocked:true,adventure_completed:false,xp:550,health:100},player}
  const view=backendWorldView(scenery,scenery,server)
  assert.deepEqual(view.availableTargetIds,['wolf']);assert.deepEqual(view.defeatedEnemyIds,['goblin']);assert.deepEqual(view.collectedIds,[]);assert.equal(view.dragonDefeated,false)
  assert.equal(forestGuardianApproachable(view,'wolf'),true)
  assert.equal(forestGuardianApproachable(view,'goblin'),false)
  assert.deepEqual(backendWorldView(scenery,scenery,{...server,result:{correct:true,encounter:{outcome:'won',villain_id:'bridge-troll'}}}).defeatedEnemyIds,['goblin','wolf'])
  const reset={signedIn:true,status:{adventure_unlocked:true,adventure_completed:false,xp:100},player:{rules:{unlock_threshold:100,battle_cost:0},villains:[{villain_id:'forest-goblin',status:'current'},{villain_id:'bridge-troll',status:'locked'},{villain_id:'castle-dragon',status:'locked'}]},result:null}
  assert.deepEqual(backendWorldView(scenery,scenery,reset).summonableEnemyIds,['goblin'])
  assert.deepEqual(backendWorldView(scenery,scenery,reset).defeatedEnemyIds,[])
  assert.deepEqual(backendWorldView(scenery,scenery,{...server,unresolved:{}}).availableTargetIds,[])
  assert.deepEqual(backendWorldView(scenery,scenery,{...server,attempt:{}}).availableTargetIds,[])
  assert.equal(forestGuardianApproachable(backendWorldView(scenery,scenery,{...server,attempt:{}}),'wolf'),true)
})

test('palace floor and walk speed match the forest approach', () => {
  const world=createHallWorld()
  assert.equal(HALL_FLOOR, CASTLE_APPROACH.y)
  assert.equal(world.spawn.y, hallGround(0, 66))
  assert.equal(world.groundHeight(0, 66), CASTLE_APPROACH.y)
  const hall=createPlayerMotion(world)
  assert.equal(hall.position.y, world.groundHeight(hall.position.x, hall.position.z))
  for (let i = 0; i < 60; i++) hall.update(1 / 60, { x: 0, z: 1, jump: false, sprint: false }, 0)
  assert.ok(Math.abs(world.spawn.z - hall.position.z - WALK_SPEED) < 1e-6)
  assert.equal(hall.position.y, world.groundHeight(hall.position.x, hall.position.z))
  const room=createCastleHallScene(), paving=room.scene.children.find((node)=>node.isMesh && node.geometry?.type==='PlaneGeometry')
  let lowest=Infinity
  for (let i=0;i<paving.geometry.attributes.position.count;i++) lowest=Math.min(lowest, paving.geometry.attributes.position.getY(i))
  assert.ok(Math.abs(lowest - HALL_FLOOR) < 0.02)
  assert.equal(room.spawn.y + EYE_HEIGHT, HALL_FLOOR + EYE_HEIGHT)
  room.dispose()
})

test('expanded castle wings have accessible doorways, solid walls and supported floors', () => {
  const world=createHallWorld()
  for(const side of [-1,1]) {
    const entry=world.move({x:side*30,z:10},{x:side*60,z:10})
    assert.ok(Math.abs(entry.x-side*60)<0.02)
    const end=world.move(entry,{x:side*90,z:10});assert.ok(Math.abs(end.x)<=67.01)
    const wall=world.move({x:side*30,z:30},{x:side*60,z:30});assert.ok(Math.abs(wall.x)<40)
    const north=world.move({x:side*55,z:10},{x:side*55,z:-50});assert.ok(north.z>=-25.01)
    assert.equal(world.groundHeight(entry.x,entry.z),HALL_FLOOR)
  }
})

test('prison bars block walking and jump-height positions until confirmed dragon defeat', () => {
  const world=createHallWorld(), from={x:0,z:-85,y:12}
  const closed=world.move(from,{x:0,z:-96,y:12});assert.ok(closed.z>HALL.prison.gateZ)
  world.setDragonDefeated(false);assert.deepEqual(world.move(closed,{x:0,z:-96}),closed)
  world.setDragonDefeated(true);assert.ok(world.move(closed,{x:0,z:-96}).z< -95.9)
  assert.equal(hallHeight(0,-100),3)
  const back=world.move({x:5,z:-100},{x:5,z:-120});assert.ok(back.z> -107.1)
})

test('castle route reaches boss, prison and exit without walking through walls or the dragon', () => {
  const world=createHallWorld()
  let p={x:0,z:66}
  for(const target of [{x:0,z:-33},{x:12,z:-33},{x:12,z:-72},{x:0,z:-82}]) { p=world.move(p,target);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<0.03) }
  assert.ok(world.move(p,{x:0,z:-100}).z> -90)
  world.setDragonDefeated(true);p=world.move(p,{x:0,z:-97});assert.ok(p.z< -96.9)
  for(const target of [{x:0,z:-82},{x:0,z:-72},{x:12,z:-72},{x:12,z:-33},{x:0,z:-33},{x:0,z:66}]) { p=world.move(p,target);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<0.03) }
  const body=world.move({x:HALL.dragon.x,z:-43},{x:HALL.dragon.x,z:-54});assert.ok(body.z>HALL.dragon.z+HALL.dragon.radius-0.1)
})

test('expanded castle geometry stays finite and repeated scene disposal is safe', () => {
  const room=createCastleHallScene();room.update(0.01,{forestRun:{dragonDefeated:false},reducedMotion:true})
  assert.ok(room.world.move({x:0,z:-85},{x:0,z:-96}).z> -90)
  room.update(0.01,{forestRun:{dragonDefeated:true},reducedMotion:true})
  assert.ok(room.world.move({x:0,z:-85},{x:0,z:-96}).z< -95.9)
  room.scene.traverse(object=>{assert.ok(object.position.toArray().every(Number.isFinite))})
  room.dispose();room.dispose()
})
