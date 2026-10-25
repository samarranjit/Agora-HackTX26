import { useState } from 'react'
import { AuthForm, Encounter, Recovery } from './BackendGame.jsx'
import StudyMaterials from './StudyMaterials.jsx'

export default function BackendTester({ session, state }) {
  const [practiceId, setPracticeId] = useState('')
  const [battleId, setBattleId] = useState('')
  const blocked = !state.signedIn || state.busy || !!state.unresolved
  return <div className="api-tester">
    <p className="small-print">Development only · Backend: {session.api.baseUrl}. Opening this panel sends no mutations. GET controls are read only; POST controls modify account, content or progression.</p>
    <button className="secondary" disabled={state.busy} onClick={() => session.read('health')}>GET /healthz · read only</button>
    <AuthForm session={session} state={state} />
    <Recovery session={session} state={state} />
    <fieldset disabled={!state.signedIn || state.busy}><legend>Player · read only</legend><div className="api-actions">
      <button className="secondary" onClick={() => session.read('status')}>GET /api/me/status</button>
      <button className="secondary" onClick={() => session.read('state')}>GET /api/me/state</button>
      <button className="secondary" onClick={() => session.read('active')}>GET /api/me/active-attempt</button>
    </div></fieldset>
    <fieldset disabled={blocked}><legend>Practice & battle · modifies progression</legend>
      <label>Practice question set ID (optional)<input value={practiceId} onChange={(e) => setPracticeId(e.target.value)} /></label>
      <button className="secondary" onClick={() => session.practice(practiceId.trim())}>POST practice attempt</button>
      <label>Adventure question set ID (optional)<input value={battleId} onChange={(e) => setBattleId(e.target.value)} /></label>
      <button className="secondary" onClick={() => session.battle(battleId.trim())}>POST battle · charges backend entry cost</button>
    </fieldset>
    <Encounter session={session} state={state} />
    <details><summary>PDF documents & question sets</summary><StudyMaterials session={session} disabled={!state.signedIn || state.busy} /></details>
    <h2>Request history</h2><p className="small-print">Most recent 40 requests. Passwords, tokens and Authorization are redacted. Blank HTTP status means no response arrived.</p>
    <div className="api-log">{state.logs.map((entry, i) => <details key={`${state.logs.length - i}:${entry.path}:${entry.duration}`}>
      <summary>{entry.method} {entry.path} · {entry.status ?? 'no response'} · {entry.duration} ms</summary>
      <pre>{JSON.stringify({ request: entry.request, idempotencyKey: entry.key, response: entry.response }, null, 2)}</pre>
    </details>)}</div>
  </div>
}
