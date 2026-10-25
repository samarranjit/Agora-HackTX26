import { useState } from 'react'
import PalaceDialog from './PalaceDialog.jsx'

export function ServerError({ error }) { return error ? <p className="api-error" role="alert">{error.message}</p> : null }

export function AuthScreen({ flow, state, busy }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState(''), [password, setPassword] = useState('')
  const valid = username.length >= 3 && password.length >= 8
  const submit = () => flow.authenticate(mode, { username, password })
  return <PalaceDialog adventure backend tools={false} title={mode === 'login' ? 'Sign In' : 'Create Account'} kicker="Memory Palace">
    <p>{mode === 'login' ? 'Your next adventure begins with a little knowledge.' : 'Create your account to begin your learning adventure.'}</p>
    <form onSubmit={(e) => { e.preventDefault(); submit() }}>
      <label>Username<input data-autofocus autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy} /></label>
      <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /></label>
      <ServerError error={state.error} />
      <button className="primary full-width" disabled={busy}>{busy ? 'Connecting…' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>
      {state.error && <button type="button" className="secondary full-width" disabled={busy || !valid} onClick={submit}>Retry</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setPassword(''); flow.clearError() }}>{mode === 'login' ? 'Create account' : 'Back to Sign In'}</button>
    </form>
  </PalaceDialog>
}

export function Encounter({ session, state }) {
  const q = state.attempt
  const [draft, setDraft] = useState({ attemptId: null, value: '' })
  const answer = draft.attemptId === q?.attempt_id ? draft.value : ''
  const setAnswer = (value) => setDraft({ attemptId: q.attempt_id, value })
  const r = state.result
  if (r) return <div className="encounter-result" aria-live="polite">
    <h2>{r.correct ? 'Correct!' : 'Keep learning.'}</h2>
    <p>{r.feedback.explanation}</p><p>Answer: {r.feedback.correct_answer}</p>
    <p>XP {r.xp_delta >= 0 ? '+' : ''}{r.xp_delta} · Health {r.health_delta >= 0 ? '+' : ''}{r.health_delta}</p>
    <p><strong>{{ none: 'Practice complete', in_progress: 'Battle continues', won: 'Victory!', lost: 'Battle lost. Practice and try again.', knocked_out: 'Defeated. Practice to restore health.' }[r.encounter.outcome]}</strong></p>
    {r.encounter.question_count && <p>{r.encounter.correct_count} correct / {r.encounter.question_count} battle questions</p>}
    {r.encounter.adventure_unlocked_now && <p>Adventure is now unlocked!</p>}
    {r.encounter.adventure_completed && <p>You completed the adventure.</p>}
    <button className="primary full-width" disabled={state.busy || !!state.unresolved} onClick={() => { session.continue(); if (!q) session.practice() }}>{q ? 'Continue to the next question' : 'Practice another question'}</button>
    {!q && <button className="secondary full-width" disabled={state.busy} onClick={() => session.continue()}>Finish review</button>}
  </div>
  if (!q) return <p>{state.busy ? 'Awaiting the backend…' : 'No pending question. Start practice to earn XP, or approach the Forest Goblin to challenge the next palace guardian.'}</p>
  return <form key={q.attempt_id} onSubmit={(e) => { e.preventDefault(); if (answer.trim()) session.answer(answer) }}>
    <p className="palace-kicker">{q.mode === 'adventure' ? q.battle?.villain_name : 'Practice'} · {q.topic} · Difficulty {q.difficulty}</p>
    {q.battle && <p>Question {q.battle.question_number}/{q.battle.question_count} · {q.battle.correct_count} correct</p>}
    <h2 className="quiz-question">{q.prompt}</h2>
    {q.learning_objective && <p className="small-print">{q.learning_objective}</p>}
    <fieldset disabled={state.busy || !!state.unresolved} className="answer-fields"><legend>Your answer</legend>
      {q.options?.length ? q.options.map((o) => <label className="answer-option" key={o.id}><input type="radio" name="answer" required value={o.id} checked={answer === o.id} onChange={() => setAnswer(o.id)} />{o.text}</label>)
        : <input aria-label="Your answer" data-autofocus required inputMode={q.type === 'numeric' ? 'decimal' : 'text'} maxLength={200} value={answer} onChange={(e) => setAnswer(e.target.value)} />}
      <button className="primary full-width" disabled={!answer.trim()}>{state.busy ? 'Submitting…' : 'Submit answer'}</button>
    </fieldset>
    {q.sources?.map((s, i) => <p className="small-print" key={i}>{s.document_name || 'Study document'}{s.pages?.length ? ` · pages ${s.pages.join(', ')}` : ''}</p>)}
  </form>
}


export function Recovery({ session, state }) {
  return <><ServerError error={state.error} />{state.unresolved && <div role="status"><p>The last action has an uncertain result. Retry it safely before continuing.</p><button className="primary full-width" disabled={state.busy} onClick={() => session.retry()}>Retry</button></div>}{state.error && !state.unresolved && <button className="secondary full-width" disabled={state.busy} onClick={() => session.refresh()}>Retry</button>}</>
}
