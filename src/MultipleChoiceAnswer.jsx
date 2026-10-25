import { useId, useRef, useState } from 'react'

// Presentation only. The caller supplies explicit { id, label, value } choices,
// evaluates the selected value, and remounts this form for each new question/turn.
// Future server options must be mapped by their agreed contract, never synthesized here.
export default function MultipleChoiceAnswer({ options, onAnswer, submittedValue, disabled = false }) {
  const name = useId()
  const [selected, setSelected] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submitted = useRef(false)
  const resolved = submittedValue !== undefined
  const choiceId = resolved ? options.find((option) => option.value === submittedValue)?.id : selected
  const blocked = disabled || resolved || submitting
  return <form className="multiple-choice-answer" onSubmit={(event) => {
    event.preventDefault()
    const choice = options.find((option) => option.id === selected)
    if (blocked || submitted.current || !choice) return
    submitted.current = true
    setSubmitting(true)
    onAnswer(choice.value)
  }}>
    <fieldset disabled={blocked}><legend>Choose one answer</legend>
      {options.map((option, index) => <label key={option.id} className={'choice-option' + (choiceId === option.id ? ' is-selected' : '')}>
        <input type="radio" name={name} value={option.id} checked={choiceId === option.id} required data-autofocus={index === 0 ? true : undefined} onChange={() => setSelected(option.id)} />
        <span>{option.label}</span>
      </label>)}
    </fieldset>
    {resolved ? <p className="small-print">Submitted choice: {options.find((option) => option.id === choiceId)?.label || submittedValue}</p>
      : <button className="primary full-width" disabled={blocked || !selected}>Check answer</button>}
  </form>
}
