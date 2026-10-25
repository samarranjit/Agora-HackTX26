import { useState } from 'react'
import PalaceDialog from './PalaceDialog.jsx'
import MultipleChoiceAnswer from './MultipleChoiceAnswer.jsx'
import { isCorrectAnswer } from './memories.js'

export default function RecallQuiz({ memory, unlocked, onUnlock, onClose }) {
  const [result, setResult] = useState(null)
  const [turn, setTurn] = useState(0)
  return <PalaceDialog title={unlocked ? 'A memory unlocked.' : 'Remember to move forward.'} onClose={onClose}>
    <p className="quiz-intro">One question opens this room’s gate. Take your time.</p>
    <h2 className="quiz-question">{memory.question}</h2>
    <MultipleChoiceAnswer key={`${memory.id}:${turn}`} options={memory.choices} submittedValue={result?.answer} disabled={unlocked} onAnswer={(answer) => {
      const correct = isCorrectAnswer(memory, answer)
      setResult({ answer, correct })
      if (correct) onUnlock()
    }} />
    <p className={'quiz-feedback ' + (unlocked ? 'success' : '')} role="status" aria-live="polite">{result ? result.correct ? 'Correct! The door is open. Return to the room and walk through the green doorway.' : `Not quite. ${memory.hint} Try again.` : 'Select one answer, then check it.'}</p>
    {result && !result.correct && !unlocked && <button data-autofocus className="primary full-width" onClick={() => { setResult(null); setTurn((value) => value + 1) }}>Try this question again</button>}
    <button className={unlocked ? 'primary full-width' : 'secondary full-width'} onClick={onClose}>{unlocked ? 'Return to room & walk through' : 'Close quiz & keep exploring'}</button>
  </PalaceDialog>
}
