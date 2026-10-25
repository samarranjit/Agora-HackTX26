// Scene projection only. Balances, admission and victories always come from server state.
const GUARDIAN = { 'forest-goblin': 'goblin', 'bridge-troll': 'wolf', 'castle-dragon': 'dragon' }

export function backendWorldView(scenery, world, server) {
  const unlocked = server.signedIn && server.status?.adventure_unlocked === true
  const villains = server.player?.villains ?? []
  const xp = Number.isFinite(server.status?.xp) ? server.status.xp : 0
  const unlock = Number.isFinite(server.player?.rules?.unlock_threshold) ? server.player.rules.unlock_threshold : 100
  const cost = Number.isFinite(server.player?.rules?.battle_cost) ? server.player.rules.battle_cost : 0
  const canAnswer = unlocked && xp >= unlock && xp >= cost
  const current = villains.filter((v) => v.status === 'current').map((v) => GUARDIAN[v.villain_id]).filter(Boolean)
  const completed = new Set(villains.filter((v) => v.status === 'completed').map((v) => v.villain_id))
  if (server.result?.correct && server.result.encounter?.outcome === 'won' && server.result.encounter.villain_id) completed.add(server.result.encounter.villain_id)
  return { ...scenery, ...world, stage: unlocked ? world.stage : 'forest',
    spawnId: unlocked ? world.spawnId : 'start', collectedIds: [],
    checkpoint: unlocked ? world.checkpoint : scenery.checkpoint,
    defeatedEnemyIds: [completed.has('forest-goblin') && 'goblin', completed.has('bridge-troll') && 'wolf'].filter(Boolean),
    summonableEnemyIds: canAnswer ? current.filter((id) => id === 'goblin' || id === 'wolf') : [],
    availableTargetIds: canAnswer && !server.attempt && !server.result && !server.unresolved && !server.busy ? current : [],
    startedEnemyIds: [],
    dragonDefeated: server.signedIn && server.status?.adventure_completed === true,
    bridgeState: unlocked ? world.bridgeState === 'lowered' ? 'lowered' : 'lowering' : 'raised' }
}
