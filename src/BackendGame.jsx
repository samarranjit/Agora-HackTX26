import { useState } from 'react'

export function ServerError({ error }) {
  return error ? <div className="api-error" role="alert"><strong>{error.message}</strong>{error.code && <small>{error.code}{error.status ? ` · HTTP ${error.status}` : ''}</small>}{Array.isArray(error.details) && error.details.map((d, i) => <p key={i}>{d.field}: {d.problem}</p>)}</div> : null
}

export function PlayerStatus({ state }) {
  const s = state.status
  return <div className="backend-status" aria-live="polite">{s ? <>
    <strong>{state.username} · {s.xp} XP · Health {s.health}/{s.max_health}</strong>
    <span>{s.adventure_completed ? 'Adventure complete' : s.adventure_unlocked ? 'Adventure unlocked' : 'Adventure locked'} · {s.location}</span>
    {state.player?.rules && <small>Adventure unlock: {state.player.rules.unlock_threshold} XP · Battle entry: {state.player.rules.battle_cost} XP</small>}
  </> : <span>{state.signedIn ? 'Player status unavailable. Reconnect to refresh.' : 'Sign in to practice and save your progress.'}</span>}</div>
}

export function AuthForm({ session, state }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  if (state.signedIn) return <><PlayerStatus state={state} /><div className="button-row"><button className="secondary" disabled={state.busy} onClick={() => session.refresh()}>Reconnect / recover question</button><button className="secondary" disabled={state.busy || state.packBusy || !!state.unresolved} onClick={() => session.logout()}>Sign out</button></div></>
  return <form onSubmit={(e) => { e.preventDefault(); session.authenticate(mode, { username, password }).then(() => setPassword('')) }}>
    <p>Sign in to your learning adventure, or create an account.</p>
    <label>Username<input data-autofocus autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" value={username} onChange={(e) => setUsername(e.target.value)} disabled={state.busy} /></label>
    <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} disabled={state.busy} /></label>
    <button className="primary full-width" disabled={state.busy}>{state.busy ? 'Connecting…' : mode === 'login' ? 'Sign in' : 'Register & sign in'}</button>
    <button type="button" className="text-button" disabled={state.busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); session.clearError() }}>{mode === 'login' ? 'Create a new account' : 'Use an existing account'}</button>
  </form>
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
  return <><ServerError error={state.error} />{state.unresolved && <div className="demo-notice"><p>A {state.unresolved.kind} request has an uncertain result. Its original payload and key are saved. Retry it before starting a new action.</p><button className="primary" disabled={state.busy} onClick={() => session.retry()}>Retry saved action</button></div>}</>
}
