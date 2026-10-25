import { useCallback, useRef, useState } from 'react'
import RoomExperience from './RoomExperience.jsx'
import NotesPanel from './NotesPanel.jsx'
import RecallQuiz from './RecallQuiz.jsx'
import PalaceDialog from './PalaceDialog.jsx'
import AdventureMenu from './AdventureMenu.jsx'
import { SAMPLE_MEMORIES } from './memories.js'
import { createInitialRunState, resetRunState } from './game/runState.js'
import './App.css'
import './adventure.css'

const EMPTY_MEMORIES = []
const INITIAL_ENVIRONMENT = new URLSearchParams(window.location.search).get('demo') === 'indoor' ? 'indoor' : 'courtyard'

function App() {
  const [notes, setNotes] = useState('')
  const [run, setRun] = useState(createInitialRunState)
  const { loaded, unlocked, discovered } = run.room
  const [environment, setEnvironment] = useState(INITIAL_ENVIRONMENT)
  const [overlay, setOverlay] = useState(INITIAL_ENVIRONMENT === 'indoor' ? 'notes' : 'welcome')
  const experienceRef = useRef(null)
  const outdoor = environment === 'courtyard'
  const [session, setSession] = useState(0)
  const closeOverlay = useCallback(() => setOverlay(null), [])
  const openQuiz = useCallback(() => setOverlay('quiz'), [])
  const pause = useCallback(() => setOverlay((current) => current || 'pause'), [])
  const finish = useCallback(() => setOverlay('complete'), [])
  const discover = useCallback((id) => setRun((current) => current.room.discovered.includes(id) ? current : {
    ...current,
    room: { ...current.room, discovered: [...current.room.discovered, id] },
  }), [])
  const unlockDoor = useCallback(() => setRun((current) => ({
    ...current,
    room: { ...current.room, unlocked: true },
  })), [])
  const loadSamples = () => {
    setRun((current) => {
      const next = resetRunState(current)
      next.room.loaded = true
      return next
    })
    setSession((current) => current + 1)
    setOverlay(null)
  }
  const reset = () => {
    setNotes('')
    setRun(resetRunState)
    setSession(0)
    setOverlay('notes')
  }
  const question = SAMPLE_MEMORIES[Math.max(0, session - 1) % SAMPLE_MEMORIES.length]
  const enterCourtyard = () => {
    setOverlay(null)
    experienceRef.current?.enter()
  }
  const openDemo = () => { setEnvironment('indoor'); setOverlay('notes') }
  const returnToCourtyard = () => { setEnvironment('courtyard'); setOverlay('pause') }

  return <main className={'palace' + (outdoor ? ' courtyard' : '')}>
    <RoomExperience key={`${environment}:${session}`} controlRef={experienceRef} environment={environment} hearts={run.playerHearts} memories={!outdoor && loaded ? SAMPLE_MEMORIES : EMPTY_MEMORIES} active={(outdoor || loaded) && overlay === null} unlocked={!outdoor && unlocked} session={session} onDoor={openQuiz} onPause={pause} onExit={finish} onDiscover={discover} />
    <header className="palace-topbar" inert={overlay !== null}>
      <div className="palace-brand">{outdoor && <span className="brand-crest" aria-hidden="true">♜</span>}<div><strong>Agora</strong><span>{outdoor ? 'CROWNWATER · THE ROYAL GROUNDS' : '01 / The biology room'}</span></div></div>
      {outdoor ? <button className="secondary menu-button" onClick={pause}>Menu <kbd>Esc</kbd></button> : <div className="topbar-actions">{loaded && <><span className="room-status">{discovered.length}/3 visited · {unlocked ? 'Gate unlocked' : 'Gate locked'}</span><button className="secondary" onClick={() => setOverlay('notes')}>Notes & samples</button></>}<button className="secondary" onClick={returnToCourtyard}>Courtyard</button></div>}
    </header>
    {outdoor && overlay !== null && <AdventureMenu paused={overlay === 'pause'} onEnter={enterCourtyard} onDemo={openDemo} />}
    {overlay === 'notes' && <NotesPanel notes={notes} onNotesChange={setNotes} onCreate={loadSamples} onReset={reset} loaded={loaded} onClose={loaded ? closeOverlay : undefined} />}
    {overlay === 'quiz' && <RecallQuiz memory={question} unlocked={unlocked} onUnlock={unlockDoor} onClose={closeOverlay} />}
    {!outdoor && overlay === 'pause' && <PalaceDialog title="Take a breath." onClose={closeOverlay}>
      <p>Visit the three objects, then turn around and walk to the wooden door. Press E nearby to test your recall.</p>
      <p className="small-print">WASD move · Mouse or drag to look · E at door · Esc pause</p>
      <button className="primary full-width" onClick={closeOverlay}>Return to exploration</button>
      <button className="secondary full-width" onClick={() => setOverlay('notes')}>Open notes & samples</button>
    </PalaceDialog>}
    {overlay === 'complete' && <PalaceDialog title="You remembered your way out.">
      <p>You explored the room, recalled a fact, and walked through the gate. Your memory has a place now.</p>
      <p className="small-print">{discovered.length}/3 exhibits visited · 1 recall question answered</p>
      <button className="primary full-width" onClick={loadSamples}>Play again · next sample question</button>
      <button className="secondary full-width" onClick={reset}>Reset room & notes</button>
    </PalaceDialog>}
  </main>
}

export default App
