import { getDifficulty, PLAYER_MAX_HEARTS } from './difficulty.js'
import { getForestTarget, FOREST_DRAGON, FOREST_COLLECTIBLES } from './forestContent.js'
import { isCorrectAnswer } from '../memories.js'
import { FOREST_SPAWN, CASTLE_APPROACH } from '../forestLayout.js'

// This explicitly offline run never changes backend balances or account state.
export const FOREST_RULES = Object.freeze({ difficultyId: getDifficulty('medium').id, maxHearts: PLAYER_MAX_HEARTS,
  // Requested forest rules: five complete stories at 20 XP each, all required.
  // Earlier difficulty/relic configuration and authoritative backend rules are untouched.
  wrongAnswerCost: 1, itemXp: 20, unlockXp: 100 })
export function createForestRun({ rules = FOREST_RULES, resetCount = 0 } = {}) {
  const start = { id: 'start', name: 'Forest trailhead', position: FOREST_SPAWN }
  return { runId: crypto.randomUUID(), rules, stage: 'forest', spawnId: 'start', hearts: rules.maxHearts,
    collectedIds: [], xp: 0, checkpoints: [start], checkpoint: start, challenges: {}, activeTarget: null,
    bridgeState: 'raised', dragonDefeated: false, resetCount }
}
export const activeForestChallenge = (run) => run.challenges[run.activeTarget] || null
export const forestGateEligible = (run) => FOREST_COLLECTIBLES.every((item) => run.collectedIds.includes(item.id)) && run.xp >= run.rules.unlockXp
export function forestTurnToken(run) {
  const challenge = activeForestChallenge(run)
  return challenge ? `${run.runId}:${run.activeTarget}:${challenge.index}:${challenge.turn}` : null
}
export function forestRunReducer(run, event) {
  if (event.type === 'RESET_RUN') return createForestRun({ rules: run.rules, resetCount: run.resetCount + 1 })
  if (event.runId !== run.runId) return run
  if (event.type === 'OPEN_CHALLENGE') {
    const target = getForestTarget(event.targetId)
    if (!target || run.collectedIds.includes(target.id) || (target.id === 'dragon' ? run.stage !== 'castle' || run.dragonDefeated : run.stage !== 'forest')) return run
    return { ...run, activeTarget: target.id, challenges: { ...run.challenges, [target.id]: run.challenges[target.id] || { index: 0, turn: 0, feedback: null, showExplanation: false, complete: false } } }
  }
  if (event.type === 'BRIDGE_LOWERED') return run.bridgeState === 'lowering' && forestGateEligible(run) ? { ...run, bridgeState: 'lowered' } : run
  if (event.type === 'ENTER_CASTLE') {
    if (run.stage !== 'forest' || run.bridgeState !== 'lowered' || !forestGateEligible(run)) return run
    const checkpoint = { id: 'castle', name: 'Castle entrance', position: CASTLE_APPROACH }
    return { ...run, stage: 'castle', activeTarget: null, checkpoint, checkpoints: run.checkpoints.some((c) => c.id === 'castle') ? run.checkpoints : [...run.checkpoints, checkpoint] }
  }
  if (event.type === 'LEAVE_CASTLE') return run.stage === 'castle' ? { ...run, stage: 'forest', spawnId: 'castle-approach', activeTarget: null } : run
  const challenge = activeForestChallenge(run), target = getForestTarget(run.activeTarget)
  if (!challenge || !target) return run
  const updateChallenge = (next) => ({ ...run, challenges: { ...run.challenges, [target.id]: next } })
  if (event.type === 'SHOW_EXPLANATION') return updateChallenge({ ...challenge, showExplanation: !challenge.showExplanation })
  if (event.token !== forestTurnToken(run)) return run
  if (event.type === 'NEXT_QUESTION') {
    if (!challenge.feedback || challenge.complete) return run
    return updateChallenge({ ...challenge, index: challenge.index + (challenge.feedback.correct ? 1 : 0), turn: challenge.turn + 1, feedback: null, showExplanation: false })
  }
  if (event.type !== 'ANSWER' || challenge.feedback || challenge.complete || typeof event.answer !== 'string' || !event.answer.trim()) return run
  const correct = isCorrectAnswer(target.questions[challenge.index], event.answer)
  if (!correct && run.hearts <= run.rules.wrongAnswerCost) return createForestRun({ rules: run.rules, resetCount: run.resetCount + 1 })
  const complete = correct && challenge.index === target.questions.length - 1
  let next = updateChallenge({ ...challenge, complete, feedback: { correct } })
  if (!correct) return { ...next, hearts: run.hearts - run.rules.wrongAnswerCost }
  if (!complete) return next
  if (target.id === FOREST_DRAGON.id) return { ...next, dragonDefeated: true }
  const collectedIds = [...run.collectedIds, target.id], xp = collectedIds.length * run.rules.itemXp
  const checkpoint = { id: target.id, name: target.name, position: { x: target.x, z: target.z } }
  next = { ...next, collectedIds, xp, checkpoint, checkpoints: [...run.checkpoints, checkpoint] }
  if (forestGateEligible(next) && run.bridgeState === 'raised') next.bridgeState = 'lowering'
  return next
}
