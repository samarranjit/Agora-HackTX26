// Presentation only. No local answers, rewards, damage or admission evidence.
export function backendWorldView(world, server) {
  const unlocked = server.signedIn && server.status?.adventure_unlocked === true
  return { ...world, accountMode: true, collectedIds: [], startedEnemyIds: ['goblin', 'wolf'], defeatedEnemyIds: [],
    stage: unlocked ? world.stage : 'forest', spawnId: unlocked ? world.spawnId : 'start',
    checkpoint: unlocked ? world.checkpoint : world.checkpoints[0],
    dragonDefeated: server.signedIn && server.status?.adventure_completed === true,
    bridgeState: unlocked ? world.bridgeState === 'lowered' ? 'lowered' : 'lowering' : 'raised' }
}
