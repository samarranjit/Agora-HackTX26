import { useState } from 'react'
import PalaceDialog from './PalaceDialog.jsx'
import { activeForestChallenge, forestTurnToken } from './game/forestRun.js'
import { getForestTarget } from './game/forestContent.js'
import { isCorrectAnswer } from './memories.js'

function AnswerForm({ onAnswer }) {
  const [answer, setAnswer] = useState('')
  return <form onSubmit={(event) => { event.preventDefault(); if (answer.trim()) onAnswer(answer) }}>
    <label>Your answer<input data-autofocus required maxLength={200} value={answer} onChange={(e) => setAnswer(e.target.value)} autoComplete="off" /></label>
    <button className="primary full-width" disabled={!answer.trim()}>Check answer</button>
  </form>
}
export default function ForestChallenge({ run, dispatch, onClose, onReset }) {
  const challenge = activeForestChallenge(run), target = getForestTarget(run.activeTarget)
  if (!challenge || !target) return null
  const question = target.questions[challenge.index], token = forestTurnToken(run)
  const send = (type, extra = {}) => dispatch({ type, runId: run.runId, token, ...extra })
  return <PalaceDialog adventure backend title={target.name} kicker={target.id === 'dragon' ? 'Offline guest prototype · Final encounter' : 'A fairy-tale discovery · Three questions'} onClose={onClose}>
    <p className="forest-question-count">Question {challenge.index + 1} / {target.questions.length} · {run.hearts} / {run.rules.maxHearts} hearts</p>
    {challenge.complete ? <div role="status" className="forest-reward"><span aria-hidden="true">✦</span><h2>{target.id === 'dragon' ? 'The dragon yields.' : 'A story remembered.'}</h2><p>{target.id === 'dragon' ? 'Your guest adventure is complete. The Storykeeper guards your tales in peace.' : `${target.name} collected. +${run.rules.itemXp} prototype XP. Checkpoint recorded.`}</p><button data-autofocus className="primary full-width" onClick={onClose}>{target.id === 'dragon' ? 'Return to the hall' : 'Continue along the trail'}</button></div> : <>
      <h2 className="quiz-question">{question.question}</h2>
      <button className="secondary" aria-expanded={challenge.showExplanation} onClick={() => send('SHOW_EXPLANATION')}>{challenge.showExplanation ? 'Hide explanation' : 'Learn more'}</button>
      {challenge.showExplanation && <p className="demo-notice">{question.explanation}</p>}
      {challenge.feedback ? <div className="quiz-feedback" role="status"><p className={challenge.feedback.correct ? 'success' : ''}>{challenge.feedback.correct ? 'Correct. This question is complete.' : `Incorrect. One heart lost; ${run.hearts} remain. This question still needs a correct answer.`}</p><button data-autofocus className="primary full-width" onClick={() => send('NEXT_QUESTION')}>{challenge.feedback.correct ? 'Next question' : 'Try this question again'}</button></div>
        : <AnswerForm key={token} onAnswer={(answer) => { send('ANSWER', { answer }); if (!isCorrectAnswer(question, answer) && run.hearts <= run.rules.wrongAnswerCost) onReset() }} />}
    </>}
    <p className="small-print">Offline guest prototype. Answers and XP belong to this visit only. Closing this panel keeps your question progress and remaining hearts.</p>
    <button className="secondary full-width" onClick={onClose}>Keep exploring</button>
  </PalaceDialog>
}
