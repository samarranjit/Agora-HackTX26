import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import RoomExperience from './RoomExperience.jsx'
import NotesPanel from './NotesPanel.jsx'
import RecallQuiz from './RecallQuiz.jsx'
import PalaceDialog from './PalaceDialog.jsx'
import AdventureMenu from './AdventureMenu.jsx'
import { SAMPLE_MEMORIES } from './memories.js'
import { createInitialRunState, resetRunState } from './game/runState.js'
import './App.css'
import './adventure.css'
import './backend.css'
import { createGameSession } from './api/gameSession.js'
import { AuthForm, Encounter, PlayerStatus, Recovery } from './BackendGame.jsx'
import StudyMaterials from './StudyMaterials.jsx'
import ForestJourney from './ForestJourney.jsx'
import BackendJourney from './BackendJourney.jsx'
import { API_BASE_URL } from './api/config.js'

const BackendTester = import.meta.env.DEV ? lazy(() => import('./BackendTester.jsx')) : null

const EMPTY_MEMORIES = []
const INITIAL_ENVIRONMENT = new URLSearchParams(window.location.search).get('demo') === 'indoor' ? 'indoor' : 'courtyard'

function LegacyPalace() {
  const [backend] = useState(() => {
    let storage
    try { storage = window.sessionStorage } catch { /* Use memory when storage is blocked. */ }
    return createGameSession({ storage, baseUrl: API_BASE_URL })
  })
  const server = useSyncExternalStore(backend.subscribe, backend.getSnapshot)
  const [notes, setNotes] = useState('')
  const [run, setRun] = useState(createInitialRunState)
  const { loaded, unlocked, discovered } = run.room
  const [environment, setEnvironment] = useState(INITIAL_ENVIRONMENT)
  const [overlay, setOverlay] = useState(INITIAL_ENVIRONMENT === 'indoor' ? 'notes' : 'welcome')
  const experienceRef = useRef(null)
  const outdoor = environment === 'courtyard'
  const [session, setSession] = useState(0)
  const closeOverlay = useCallback(() => { setOverlay(null); experienceRef.current?.enter() }, [])
  const openQuiz = useCallback(() => setOverlay('quiz'), [])
  const pause = useCallback(() => setOverlay((current) => current || 'pause'), [])
  const finish = useCallback(() => setOverlay('complete'), [])
  const challengeGoblin = useCallback(() => {
    setOverlay('encounter')
    const current = backend.getSnapshot()
    if (current.signedIn && !current.attempt && !current.result && !current.unresolved) backend.battle()
  }, [backend])
  const openPractice = () => {
    setOverlay('encounter')
    const current = backend.getSnapshot()
    if (current.signedIn && !current.attempt && !current.result && !current.unresolved) backend.practice()
  }
  useEffect(() => {
    let live = true
    const reconnect = () => backend.refresh().then(() => {
      if (live && backend.getSnapshot().attempt) setOverlay((current) => current === 'tester' ? current : 'encounter')
    })
    reconnect()
    window.addEventListener('online', reconnect)
    return () => { live = false; window.removeEventListener('online', reconnect) }
  }, [backend])
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
    <RoomExperience key={`${environment}:${session}`} controlRef={experienceRef} environment={environment} hearts={run.playerHearts} backendStatus={server.status} signedIn={server.signedIn} onGoblin={challengeGoblin} memories={!outdoor && loaded ? SAMPLE_MEMORIES : EMPTY_MEMORIES} active={(outdoor || loaded) && overlay === null} unlocked={!outdoor && unlocked} session={session} onDoor={openQuiz} onPause={pause} onExit={finish} onDiscover={discover} />
    <header className="palace-topbar" inert={overlay !== null}>
      <div className="palace-brand">{outdoor && <span className="brand-crest" aria-hidden="true">♜</span>}<div><strong>Memory Palace</strong><span>{outdoor ? 'CROWNWATER · THE ROYAL GROUNDS' : '01 / The biology room'}</span></div></div>
      {outdoor ? <button className="secondary menu-button" onClick={pause}>Menu <kbd>Esc</kbd></button> : <div className="topbar-actions">{loaded && <><span className="room-status">{discovered.length}/3 visited · {unlocked ? 'Gate unlocked' : 'Gate locked'}</span><button className="secondary" onClick={() => setOverlay('notes')}>Notes & samples</button></>}<button className="secondary" onClick={returnToCourtyard}>Courtyard</button></div>}
    </header>
    {outdoor && (overlay === 'welcome' || overlay === 'pause') && <AdventureMenu paused={overlay === 'pause'} onEnter={enterCourtyard} onDemo={openDemo} signedIn={server.signedIn} username={server.username} hasAttempt={!!server.attempt || !!server.result || !!server.unresolved} feedback={<Recovery session={backend} state={server} />} onAccount={() => setOverlay('account')} onPractice={openPractice} onResume={() => setOverlay('encounter')} onMaterials={() => setOverlay('materials')} onTester={() => setOverlay('tester')} />}
    {overlay === 'account' && <PalaceDialog backend adventure title="Your learning adventure" onClose={closeOverlay}>
      <AuthForm session={backend} state={server} /><Recovery session={backend} state={server} />
      {server.signedIn && <div className="button-row"><button className="primary" disabled={server.busy} onClick={openPractice}>{server.attempt ? 'Resume question' : 'Start practice'}</button><button className="secondary" onClick={() => setOverlay('materials')}>Prepare questions</button></div>}
      <button className="secondary full-width" onClick={() => setOverlay('pause')}>Back to menu</button>
    </PalaceDialog>}
    {overlay === 'materials' && <PalaceDialog backend wide adventure title="Prepare your study questions" onClose={closeOverlay}>
      {server.signedIn ? <StudyMaterials key={server.username} session={backend} disabled={server.busy} /> : <AuthForm session={backend} state={server} />}
      <Recovery session={backend} state={server} /><button className="secondary full-width" onClick={() => setOverlay('pause')}>Back to menu</button>
    </PalaceDialog>}
    {overlay === 'encounter' && <PalaceDialog backend adventure title={server.attempt?.battle?.villain_name || (server.attempt?.mode === 'practice' ? 'A little practice' : 'The palace challenge')} onClose={closeOverlay}>
      {server.signedIn ? <><PlayerStatus state={server} /><Encounter session={backend} state={server} /></> : <AuthForm session={backend} state={server} />}
      <Recovery session={backend} state={server} />
      {server.signedIn && !server.attempt && !server.result && <div className="button-row"><button className="primary" disabled={server.busy || !!server.unresolved} onClick={() => backend.practice()}>Start practice</button><button className="secondary" disabled={server.busy || !!server.unresolved} onClick={() => backend.refresh()}>Recover pending question</button></div>}
      {server.error && server.signedIn && <button className="secondary full-width" onClick={() => setOverlay('materials')}>Prepare missing question sets</button>}
      <button className="secondary full-width" onClick={closeOverlay}>Return to courtyard · question stays saved</button>
    </PalaceDialog>}
    {import.meta.env.DEV && overlay === 'tester' && <PalaceDialog backend wide adventure title="Backend API Tester" onClose={() => setOverlay('pause')}><Suspense fallback={<p>Loading tester…</p>}><BackendTester session={backend} state={server} /></Suspense></PalaceDialog>}
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

export default function App() {
  const [mode, setMode] = useState(() => { try { return API_BASE_URL && sessionStorage.getItem('memory-palace.mode') === 'account' ? 'account' : 'offline' } catch { return 'offline' } })
  const [file, setFile] = useState(null)
  const changeMode = (next, pdf = null) => {
    setFile(pdf); setMode(next)
    try { sessionStorage.setItem('memory-palace.mode', next) } catch { /* Mode remains usable in memory. */ }
  }
  const demo = new URLSearchParams(window.location.search).get('demo')
  if (import.meta.env.DEV && (demo === 'indoor' || demo === 'courtyard')) return <LegacyPalace />
  return mode === 'account' ? <BackendJourney initialFile={file} onOffline={() => changeMode('offline')} /> : <ForestJourney onBackend={(pdf) => changeMode('account', pdf)} />
}
