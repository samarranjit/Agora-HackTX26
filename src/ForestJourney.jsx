import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import RoomExperience from './RoomExperience.jsx'
import PalaceDialog from './PalaceDialog.jsx'
import PdfLanding from './PdfLanding.jsx'
import { AuthScreen, Encounter, Recovery } from './BackendGame.jsx'
import { createPdfAdventure } from './api/pdfAdventure.js'
import { createForestView } from './game/forestView.js'
import { backendWorldView } from './game/backendWorld.js'
import { getForestTarget } from './game/forestContent.js'
import { CASTLE_APPROACH } from './forestLayout.js'
import { createStoryAudio } from './audio/storyAudio.js'
import { SoundContext } from './audio/soundContext.js'
import SoundControl from './SoundControl.jsx'
import './forest.css'

export default function ForestJourney({ flow: suppliedFlow }) {
  const [flow] = useState(() => suppliedFlow || createPdfAdventure())
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot)
  const server = useSyncExternalStore(flow.session.subscribe, flow.session.getSnapshot, flow.session.getSnapshot)
  const [scenery] = useState(createForestView)
  const [world, setWorld] = useState(scenery)
  const [dialog, setDialog] = useState({ packId: null, id: null }), [muted, setMuted] = useState(false)
  const controls = useRef(null), soundRef = useRef(null)
  const ready = state.phase === 'ready' && server.signedIn
  const packId = server.pack?.document_id
  const overlay = dialog.packId === packId ? dialog.id : null
  const setOverlay = (id) => setDialog({ packId, id })
  const currentWorld = world.packId === packId ? world : { ...scenery, packId }
  const view = backendWorldView(scenery, currentWorld, server)
  const updateWorld = (patch) => setWorld((old) => ({ ...(old.packId === packId ? old : scenery), packId, ...patch }))
  useEffect(() => {
    const sound = createStoryAudio(); soundRef.current = sound
    const visibility = () => sound.setHidden(document.hidden)
    const leave = () => { flow.cancel(); setDialog({ packId: null, id: null }) }
    const revisit = (event) => { if (event.persisted) leave() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', leave); window.addEventListener('pageshow', revisit); visibility()
    return () => { flow.cancel(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', revisit); sound.dispose(); soundRef.current = null }
  }, [flow])
  useEffect(() => { soundRef.current?.setActive(ready && !overlay); soundRef.current?.setEnvironment(view.stage) }, [ready, overlay, view.stage])
  const resume = () => { setOverlay(null); controls.current?.enter() }
  const pause = useCallback(() => setDialog((current) => ({ packId, id: current.packId === packId ? current.id || 'pause' : 'pause' })), [packId])
  const question = (kind) => {
    setOverlay('question')
    const current = flow.session.getSnapshot()
    if (!current.attempt && !current.result && !current.unresolved) flow.session[kind]()
  }
  const interact = (id) => {
    if (id === 'forest-gate') { setOverlay('gate'); return }
    if (id === 'hall-exit') { updateWorld({ stage: 'forest', spawnId: 'castle-approach' }); return }
    if (id === 'princess' || id === 'dragon' && server.status?.adventure_completed) { setOverlay('princess'); return }
    question(getForestTarget(id)?.kind === 'combat' ? 'battle' : 'practice')
  }
  return <SoundContext.Provider value={{ muted, toggle: () => { soundRef.current?.setMuted(!muted); setMuted(!muted) } }}><main className="palace courtyard storywood" onPointerDownCapture={(e) => soundRef.current?.unlock(e.nativeEvent)} onKeyDownCapture={(e) => { if (['Enter', ' '].includes(e.key)) soundRef.current?.unlock(e.nativeEvent) }}>
    <RoomExperience key={scenery.runId + ':' + view.stage + ':' + (ready ? packId : 'opening')} controlRef={controls} environment={view.stage} session={scenery.runId} forestRun={view} backendStatus={server.status} active={ready && !overlay} soundRef={soundRef} onPause={pause} onForestInteract={interact}
      onForestBridgeLowered={() => { if (flow.session.getSnapshot().status?.adventure_unlocked) updateWorld({ bridgeState: 'lowered' }) }}
      onForestEnterCastle={() => { if (flow.session.getSnapshot().status?.adventure_unlocked && view.bridgeState === 'lowered') { updateWorld({ stage: 'castle', checkpoint: { id: 'castle', name: 'Castle entrance', position: CASTLE_APPROACH } }); setOverlay('arrival') } }} />
    {ready && <header className="palace-topbar" inert={!!overlay}><div className="palace-brand"><span className="brand-crest" aria-hidden="true">♜</span><div><strong>Memory Palace</strong><span>THE STORYWOOD</span></div></div><div className="forest-topbar-actions"><SoundControl /><button className="secondary menu-button" onClick={pause}>Pause <kbd>Esc</kbd></button></div></header>}
    {state.phase === 'auth' && <AuthScreen flow={flow} state={state} busy={server.busy} />}
    {!ready && state.phase !== 'auth' && <PdfLanding state={state} onSelect={flow.select} onRetry={flow.retry} />}
    {ready && overlay === 'question' && <PalaceDialog adventure backend key={server.attempt?.attempt_id || 'review'} title={server.attempt?.battle?.villain_name || 'A story to remember'} onClose={resume}>
      <Encounter session={flow.session} state={server} /><Recovery session={flow.session} state={server} />
      <button className="secondary full-width" onClick={resume}>Return to the adventure</button>
    </PalaceDialog>}
    {ready && overlay && overlay !== 'question' && <PalaceDialog adventure backend title={{ pause: 'Take a breath.', gate: 'The Storywood drawbridge', arrival: 'The royal hall', princess: 'The Storywood Princess' }[overlay]} onClose={resume}>
      {overlay === 'pause' && <><p>WASD move · Mouse or drag to look · E interact · Esc pause</p>{(server.attempt || server.result || server.unresolved) && <button className="secondary full-width" onClick={() => setOverlay('question')}>Continue your question</button>}{server.status?.health === 0 && !server.attempt && !server.result && <button className="secondary full-width" onClick={() => question('practice')}>Recall a story to restore strength</button>}</>}
      {overlay === 'gate' && <p>{server.status?.adventure_unlocked ? view.bridgeState === 'lowered' ? 'The castle is open. Follow the bridge.' : 'Wait for the drawbridge to finish lowering.' : 'Recall stories from your PDF to unlock the castle.'}</p>}
      {overlay === 'arrival' && <p>Follow the royal carpet to the dragon and princess. Each guardian asks a question from your PDF. Your knowledge opens the way.</p>}
      {overlay === 'princess' && <p>{server.status?.adventure_completed ? 'You defeated the Castle Dragon and restored the kingdom’s stories.' : 'The dragon still guards the kingdom. Face the remaining guardians to restore its stories.'}</p>}
      <button className="primary full-width" onClick={resume}>Return to the adventure</button>
    </PalaceDialog>}
  </main></SoundContext.Provider>
}
