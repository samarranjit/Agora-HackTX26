import { useState } from 'react'
import PalaceDialog from './PalaceDialog.jsx'
import { isCorrectAnswer } from './memories.js'

export default function RecallQuiz({ memory, unlocked, onUnlock, onClose }) {
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const submit = (event) => {
    event.preventDefault()
    if (isCorrectAnswer(memory, answer)) {
      setFeedback('Correct! The door is open. Return to the room and walk through the green doorway.')
      onUnlock()
    } else {
      setFeedback(answer.trim() ? 'Not quite. ' + memory.hint + ' Try again.' : 'Type an answer first.')
    }
  }
  return <PalaceDialog title={unlocked ? 'A memory unlocked.' : 'Remember to move forward.'} onClose={onClose}>
    <p className="quiz-intro">One question opens this room’s gate. Take your time.</p>
    <form onSubmit={submit}>
      <label htmlFor="recall-answer" className="quiz-question">{memory.question}</label>
      <input id="recall-answer" data-autofocus value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Your answer…" autoComplete="off" disabled={unlocked} aria-describedby="quiz-feedback" />
      <p id="quiz-feedback" className={'quiz-feedback ' + (unlocked ? 'success' : '')} role="status" aria-live="polite">{feedback || 'Capitalization and surrounding spaces do not matter.'}</p>
      {!unlocked && <button className="primary full-width" type="submit">Check answer</button>}
    </form>
    <button className={unlocked ? 'primary full-width' : 'secondary full-width'} onClick={onClose}>{unlocked ? 'Return to room & walk through' : 'Close quiz & keep exploring'}</button>
  </PalaceDialog>
}
