import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import RoomExperience from './RoomExperience.jsx'
import PalaceDialog from './PalaceDialog.jsx'
import { AuthForm, Encounter, PlayerStatus, Recovery } from './BackendGame.jsx'
import StudyPackPanel from './StudyPackPanel.jsx'
import { createGameSession } from './api/gameSession.js'
import { API_BASE_URL } from './api/config.js'
import { createForestRun } from './game/forestRun.js'
import { backendWorldView } from './game/backendWorld.js'
import { getForestTarget } from './game/forestContent.js'
import { CASTLE_APPROACH } from './forestLayout.js'
import { createStoryAudio } from './audio/storyAudio.js'
import { SoundContext } from './audio/soundContext.js'
import SoundControl from './SoundControl.jsx'
import './forest.css'

const EMPTY = []
export default function BackendJourney({ initialFile, onOffline }) {
  const [session] = useState(() => {
    let storage
    try { storage = window.sessionStorage } catch { /* Continue in memory. */ }
    return createGameSession({ storage, baseUrl: API_BASE_URL })
  })
  const server = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [world, setWorld] = useState(createForestRun), [screen, setOverlay] = useState('account')
  const overlay = server.signedIn ? screen : 'account'
  const [file, setFile] = useState(initialFile), [muted, setMuted] = useState(false)
  const controls = useRef(null), soundRef = useRef(null)
  const view = backendWorldView(world, server)
  useEffect(() => {
    const audio = createStoryAudio(); soundRef.current = audio
    const visibility = () => audio.setHidden(document.hidden)
    document.addEventListener('visibilitychange', visibility); visibility()
    return () => { document.removeEventListener('visibilitychange', visibility); audio.dispose(); soundRef.current = null }
  }, [])
  useEffect(() => { soundRef.current?.setActive(overlay === null); soundRef.current?.setEnvironment(view.stage) }, [overlay, view.stage])
  useEffect(() => {
    let live = true
    const recover = async () => {
      await Promise.all([session.refresh(), session.loadPacks()])
      const current = session.getSnapshot()
      if (live && current.signedIn && (current.attempt || current.unresolved)) setOverlay('encounter')
    }
    if (server.signedIn) recover()
    window.addEventListener('online', recover)
    return () => { live = false; window.removeEventListener('online', recover) }
  }, [session, server.signedIn])
  const close = useCallback(() => { setOverlay(null); controls.current?.enter() }, [])
  const pause = useCallback(() => setOverlay((current) => current || 'menu'), [])
  const start = useCallback((kind) => {
    const state = session.getSnapshot()
    if (!state.signedIn) { setOverlay('account'); return }
    setOverlay('encounter')
    if (!state.attempt && !state.result && !state.unresolved) session[kind]()
  }, [session])
  const bridgeLowered = useCallback(() => {
    if (session.getSnapshot().status?.adventure_unlocked) setWorld((current) => ({ ...current, bridgeState: 'lowered' }))
  }, [session])
  const enterCastle = useCallback(() => {
    if (!session.getSnapshot().status?.adventure_unlocked) return
    setWorld((current) => ({ ...current, stage: 'castle', checkpoint: { id: 'castle', name: 'Castle entrance (exploration)', position: CASTLE_APPROACH } }))
    setOverlay('arrival')
  }, [session])
  const interact = useCallback((id) => {
    if (id === 'forest-gate') { setOverlay('gate'); return }
    if (id === 'hall-exit') { setWorld((current) => ({ ...current, stage: 'forest', spawnId: 'castle-approach' })); setOverlay(null); return }
    if (id === 'princess') { setOverlay('princess'); return }
    if (id === 'dragon' && session.getSnapshot().status?.adventure_completed) { setOverlay('victory'); return }
    start(getForestTarget(id)?.kind === 'combat' ? 'battle' : 'practice')
  }, [start, session])
  const busy = server.busy || server.packBusy || !!server.unresolved
  const title = overlay === 'encounter' ? server.attempt?.battle?.villain_name || (server.result?.encounter.mode === 'adventure' ? 'Guardian result' : 'PDF practice') :
    ({ account: 'Your learning adventure', materials: 'Turn your PDF into questions', menu: 'Your saved adventure', gate: 'The Storywood drawbridge', arrival: 'The royal hall', princess: 'The Storywood Princess', victory: 'The kingdom remembers your victory' }[overlay] || 'Memory Palace')
  return <SoundContext.Provider value={{ muted, toggle: () => { soundRef.current?.setMuted(!muted); setMuted(!muted) } }}>
    <main className="palace courtyard storywood" onPointerDownCapture={(e) => soundRef.current?.unlock(e.nativeEvent)} onKeyDownCapture={(e) => { if (['Enter', ' '].includes(e.key)) soundRef.current?.unlock(e.nativeEvent) }}>
      <RoomExperience key={`${world.runId}:${view.stage}:${server.username}`} controlRef={controls} memories={EMPTY} active={overlay === null} environment={view.stage} session={world.runId} hearts={0} forestRun={view} backendStatus={server.status} signedIn={server.signedIn} onPause={pause} soundRef={soundRef} onForestInteract={interact} onForestBridgeLowered={bridgeLowered} onForestEnterCastle={enterCastle} />
      <header className="palace-topbar" inert={overlay !== null}><div className="palace-brand"><span className="brand-crest" aria-hidden="true">♜</span><div><strong>Memory Palace</strong><span>THE STORYWOOD · ACCOUNT MODE</span></div></div><div className="forest-topbar-actions"><SoundControl /><button className="secondary menu-button" onClick={pause}>Menu <kbd>Esc</kbd></button></div></header>
      {overlay && <PalaceDialog key={overlay} adventure backend wide={overlay === 'materials'} title={title} kicker="Account mode · Progress saved by the server" onClose={server.signedIn ? close : undefined}>
        {overlay === 'account' ? <><AuthForm session={session} state={server} />{server.signedIn && <button className="primary full-width" onClick={() => setOverlay('materials')}>Prepare PDF questions</button>}</> : <PlayerStatus state={server} />}
        {overlay === 'materials' && (server.signedIn ? <StudyPackPanel session={session} state={server} file={file} onFile={setFile} /> : <AuthForm session={session} state={server} />)}
        {overlay === 'encounter' && (server.signedIn ? <Encounter session={session} state={server} /> : <AuthForm session={session} state={server} />)}
        {overlay === 'gate' && <p>{server.status?.adventure_unlocked ? 'The server has unlocked your adventure. Wait for the bridge to finish lowering, then cross into the hall.' : `The server must unlock adventure through practice${server.player?.rules ? ` at ${server.player.rules.unlock_threshold} XP` : ''}. Offline story rewards cannot open this gate.`}</p>}
        {overlay === 'arrival' && <p>The dragon and princess await at the end of the royal carpet. Guardian interactions open the next server-selected battle. Complete the Forest Goblin and Bridge Troll before the Castle Dragon.</p>}
        {overlay === 'princess' && <p>{server.status?.adventure_completed ? 'You defeated the Castle Dragon. The kingdom remembers your victory, and your account progress is saved.' : 'The dragon still guards the kingdom. Complete the server campaign to restore its stories.'}</p>}
        {overlay === 'victory' && <p>You completed the server campaign and defeated the Castle Dragon. Your victory is saved to your account.</p>}
        {overlay === 'menu' && <><p>Story pedestals offer practice from your selected PDF. Guardian markers open the next server-selected opponent. The wolf is decorative; it does not replace the server’s Bridge Troll.</p><ul className="forest-journal">{server.player?.villains.map((v) => <li key={v.villain_id}>{v.name} · {v.status}</li>)}</ul><p className="small-print">World position and exploration checkpoints last for this visit. XP, health, questions, unlocks and campaign progress are saved by the backend. Falling does not spend account health or erase learning progress.</p></>}
        <Recovery session={session} state={server} />
        {server.signedIn && overlay !== 'materials' && <div className="button-row"><button className="secondary" disabled={busy} onClick={() => start('practice')}>{server.attempt || server.result ? 'Resume question / review' : 'Practice PDF questions'}</button><button className="secondary" disabled={busy || !server.status || server.status.adventure_completed} onClick={() => start('battle')}>Challenge next guardian</button><button className="secondary" onClick={() => setOverlay('materials')}>Study PDFs</button></div>}
        {overlay !== 'account' && <button className="secondary full-width" onClick={() => setOverlay('account')}>Account & reconnect</button>}
        <button className="primary full-width" disabled={!server.signedIn} onClick={close}>Return to the {view.stage === 'castle' ? 'hall' : 'forest'} · question stays saved</button>
        <button className="secondary full-width" onClick={() => setOverlay('menu')}>Adventure menu</button>
        <button className="text-button" disabled={server.busy} onClick={() => { session.cancelPack(); onOffline() }}>Switch to offline guest demo</button>
      </PalaceDialog>}
    </main>
  </SoundContext.Provider>
}
