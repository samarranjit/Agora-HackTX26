export const DEFAULT_DIFFICULTY_ID = 'easy'
export const RELIC_XP_REWARD = 5
export const PLAYER_MAX_HEARTS = 3

export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ id: 'easy', relicCount: 5, floorCount: 5, adventureUnlockXp: 25, floorEnemyHearts: 3, dragonHearts: 5 }),
  medium: Object.freeze({ id: 'medium', relicCount: 10, floorCount: 7, adventureUnlockXp: 50, floorEnemyHearts: 4, dragonHearts: 10 }),
  hard: Object.freeze({ id: 'hard', relicCount: 20, floorCount: 9, adventureUnlockXp: 100, floorEnemyHearts: 5, dragonHearts: 20 }),
})

export function getDifficulty(difficultyId = DEFAULT_DIFFICULTY_ID) {
  return typeof difficultyId === 'string' && Object.hasOwn(DIFFICULTIES, difficultyId)
    ? DIFFICULTIES[difficultyId]
    : DIFFICULTIES[DEFAULT_DIFFICULTY_ID]
}
