// Scene projection only. Balances, admission and victories always come from server state.
export function backendWorldView(scenery, world, server) {
  const unlocked = server.signedIn && server.status?.adventure_unlocked === true
  const completed = new Set(server.player?.villains.filter((v) => v.status === 'completed').map((v) => v.villain_id))
  return { ...scenery, ...world, stage: unlocked ? world.stage : 'forest',
    spawnId: unlocked ? world.spawnId : 'start', collectedIds: [],
    checkpoint: unlocked ? world.checkpoint : scenery.checkpoint,
    defeatedEnemyIds: [completed.has('forest-goblin') && 'goblin', completed.has('bridge-troll') && 'wolf'].filter(Boolean),
    availableTargetIds: server.status?.adventure_unlocked && !server.attempt && !server.result && !server.unresolved && !server.busy ? server.player?.villains.filter((v) => v.status === 'current').map((v) => ({ 'forest-goblin': 'goblin', 'bridge-troll': 'wolf', 'castle-dragon': 'dragon' })[v.villain_id]).filter(Boolean) || [] : [],
    startedEnemyIds: [],
    dragonDefeated: server.signedIn && server.status?.adventure_completed === true,
    bridgeState: unlocked ? world.bridgeState === 'lowered' ? 'lowered' : 'lowering' : 'raised' }
}
