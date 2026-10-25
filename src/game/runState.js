import { getDifficulty, PLAYER_MAX_HEARTS } from './difficulty.js'

export function createInitialRunState(difficultyId) {
  const difficulty = getDifficulty(difficultyId)
  return {
    difficultyId: difficulty.id,
    // Progress is reserved for later phases. Courtyard exploration never awards XP.
    xp: 0,
    collectedRelicIds: [],
    clearedFloors: [],
    currentFloor: null,
    checkpoint: { sceneId: 'courtyard', spawnId: 'start', floor: null },
    playerHearts: PLAYER_MAX_HEARTS,
    bridgeState: 'raised',
    finalEncounter: { status: 'not-started', hearts: difficulty.dragonHearts, rescued: false },
    // Visiting a memory and opening the indoor door are separate from adventure progress.
    room: { loaded: false, unlocked: false, discovered: [] },
  }
}

// A new run keeps the selected difficulty, but never retains progress or mutable containers.
export function resetRunState(previousRun) {
  return createInitialRunState(previousRun?.difficultyId)
}
