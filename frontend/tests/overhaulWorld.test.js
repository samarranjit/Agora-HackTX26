import test from 'node:test'
import assert from 'node:assert/strict'
import { createEncounterTrigger } from '../src/game/encounterTrigger.js'
import { createForestView } from '../src/game/forestView.js'
import { backendWorldView } from '../src/game/backendWorld.js'
import { createHallWorld, HALL, hallHeight, forestEncounterAt, forestHeight } from '../src/forestLayout.js'
import { createCastleHallScene } from '../src/forestScene.js'

test('automatic encounters fire once per approach, wait for eligibility and never loop on close/retry', () => {
  const trigger=createEncounterTrigger()
  assert.equal(trigger.update('goblin',false),null);assert.equal(trigger.update('goblin',true),'goblin')
  for(let i=0;i<200;i++) assert.equal(trigger.update('goblin',true),null)
  assert.equal(trigger.update('goblin',false),null);assert.equal(trigger.update('goblin',true),null)
  trigger.update(null,false);assert.equal(trigger.update('goblin',true),'goblin')
  assert.equal(trigger.update('wolf',true),'wolf');assert.equal(trigger.update('wolf',true),null)
})

test('proximity checks respect elevation and confirmed defeated monsters', () => {
  const run=createForestView({seed:'auto'}), enemy=run.layout.encounters[0]
  const at={...enemy,y:forestHeight(enemy.x,enemy.z,run.layout)+1.6}
  assert.equal(forestEncounterAt(at,run),'goblin');assert.equal(forestEncounterAt({...at,y:at.y+8},run),null)
  assert.equal(forestEncounterAt(at,{...run,defeatedEnemyIds:['goblin']}),null)
})

test('only the current server guardian is eligible; health, XP and proximity never declare victory', () => {
  const scenery=createForestView(), player={villains:[{villain_id:'forest-goblin',status:'completed'},{villain_id:'bridge-troll',status:'current'},{villain_id:'castle-dragon',status:'locked'}]}
  const server={signedIn:true,status:{adventure_unlocked:true,adventure_completed:false,xp:550,health:100},player}
  const view=backendWorldView(scenery,scenery,server)
  assert.deepEqual(view.availableTargetIds,['wolf']);assert.deepEqual(view.defeatedEnemyIds,['goblin']);assert.deepEqual(view.collectedIds,[]);assert.equal(view.dragonDefeated,false)
  assert.deepEqual(backendWorldView(scenery,scenery,{...server,unresolved:{}}).availableTargetIds,[])
  assert.deepEqual(backendWorldView(scenery,scenery,{...server,attempt:{}}).availableTargetIds,[])
})

test('expanded castle wings have accessible doorways, solid walls and supported floors', () => {
  const world=createHallWorld()
  for(const side of [-1,1]) {
    const entry=world.move({x:side*30,z:10},{x:side*60,z:10})
    assert.ok(Math.abs(entry.x-side*60)<0.02)
    const end=world.move(entry,{x:side*90,z:10});assert.ok(Math.abs(end.x)<=67.01)
    const wall=world.move({x:side*30,z:30},{x:side*60,z:30});assert.ok(Math.abs(wall.x)<40)
    const north=world.move({x:side*55,z:10},{x:side*55,z:-50});assert.ok(north.z>=-25.01)
    assert.equal(world.groundHeight(entry.x,entry.z),0)
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
