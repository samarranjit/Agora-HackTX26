import { useCallback, useState } from 'react'
import RoomExperience from './RoomExperience.jsx'
import NotesPanel from './NotesPanel.jsx'
import RecallQuiz from './RecallQuiz.jsx'
import PalaceDialog from './PalaceDialog.jsx'
import { SAMPLE_MEMORIES } from './memories.js'
import './App.css'

const EMPTY_MEMORIES = []

function App() {
  const [notes, setNotes] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [overlay, setOverlay] = useState('notes')
  const [session, setSession] = useState(0)
  const [discovered, setDiscovered] = useState([])
  const closeOverlay = useCallback(() => setOverlay(null), [])
  const openQuiz = useCallback(() => setOverlay('quiz'), [])
  const pause = useCallback(() => setOverlay((current) => current || 'pause'), [])
  const finish = useCallback(() => setOverlay('complete'), [])
  const discover = useCallback((id) => setDiscovered((current) => current.includes(id) ? current : [...current, id]), [])
  const loadSamples = () => {
    setLoaded(true)
    setUnlocked(false)
    setDiscovered([])
    setSession((current) => current + 1)
    setOverlay(null)
  }
  const reset = () => {
    setNotes('')
    setLoaded(false)
    setUnlocked(false)
    setDiscovered([])
    setSession(0)
    setOverlay('notes')
  }
  const question = SAMPLE_MEMORIES[Math.max(0, session - 1) % SAMPLE_MEMORIES.length]

  return <main className="palace">
    <RoomExperience key={session} memories={loaded ? SAMPLE_MEMORIES : EMPTY_MEMORIES} active={loaded && overlay === null} unlocked={unlocked} session={session} onDoor={openQuiz} onPause={pause} onExit={finish} onDiscover={discover} />
    <header className="palace-topbar">
      <div><strong>Memory Palace</strong><span>01 / The biology room</span></div>
      {loaded && <div className="topbar-actions"><span className="room-status">{discovered.length}/3 visited · {unlocked ? 'Gate unlocked' : 'Gate locked'}</span><button className="secondary" onClick={() => setOverlay('notes')}>Notes & samples</button></div>}
    </header>
    {overlay === 'notes' && <NotesPanel notes={notes} onNotesChange={setNotes} onCreate={loadSamples} onReset={reset} loaded={loaded} onClose={loaded ? closeOverlay : undefined} />}
    {overlay === 'quiz' && <RecallQuiz memory={question} unlocked={unlocked} onUnlock={() => setUnlocked(true)} onClose={closeOverlay} />}
    {overlay === 'pause' && <PalaceDialog title="Take a breath." onClose={closeOverlay}>
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
