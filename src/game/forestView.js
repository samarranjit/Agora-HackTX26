import { generateForestLayout, FOREST_SPAWN } from '../forestLayout.js'

// Scenery only: no questions, balances, grading, rewards or progression rules.
export function createForestView({ seed = crypto.randomUUID() } = {}) {
  return { runId: seed, layout: generateForestLayout(seed), stage: 'forest', spawnId: 'start',
    collectedIds: [], defeatedEnemyIds: [], startedEnemyIds: ['goblin', 'wolf'], availableTargetIds: [],
    checkpoint: { id: 'start', name: 'Forest trailhead', position: FOREST_SPAWN },
    bridgeState: 'raised', dragonDefeated: false }
}
