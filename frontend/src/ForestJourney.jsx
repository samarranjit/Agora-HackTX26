import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import RoomExperience from './RoomExperience.jsx'
import PalaceDialog from './PalaceDialog.jsx'
import PdfLanding from './PdfLanding.jsx'
import { AuthScreen, Encounter, Recovery, ServerError } from './BackendGame.jsx'
import { createPdfAdventure } from './api/pdfAdventure.js'
import { createForestView } from './game/forestView.js'
import { backendWorldView } from './game/backendWorld.js'
import { getForestTarget } from './game/forestContent.js'
import { CASTLE_APPROACH, usesCharacterSpeech } from './forestLayout.js'
import CharacterSpeech from './CharacterSpeech.jsx'
import { createStoryAudio } from './audio/storyAudio.js'
import { SoundContext } from './audio/soundContext.js'
import SoundControl from './SoundControl.jsx'
import './forest.css'

export function TryAgainBanner() {
  return <div className="try-again-overlay" role="status" aria-live="assertive"><strong>Try again</strong></div>
}

export default function ForestJourney({ flow: suppliedFlow }) {
  const [flow] = useState(() => suppliedFlow || createPdfAdventure())
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot)
  const server = useSyncExternalStore(flow.session.subscribe, flow.session.getSnapshot, flow.session.getSnapshot)
  const [scenery] = useState(createForestView)
  const [world, setWorld] = useState(scenery)
  const [dialog, setDialog] = useState({ packId: null, id: null }), [muted, setMuted] = useState(false)
  const [challenge, setChallenge] = useState(null)
  const [runToken, setRunToken] = useState(0)
  const [tryAgain, setTryAgain] = useState(false)
  const [speechAnchor, setSpeechAnchor] = useState(null)
  const controls = useRef(null), soundRef = useRef(null)
  const lastXp = useRef(null)
  const wiping = useRef(false)
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
  useEffect(() => { soundRef.current?.setActive(ready && !tryAgain && (!overlay || overlay === 'arrival')); soundRef.current?.setEnvironment(view.stage) }, [ready, overlay, tryAgain, view.stage])
  useEffect(() => {
    if (server.result?.correct && server.result.encounter?.outcome === 'won' && usesCharacterSpeech(challenge?.id)) soundRef.current?.play('victory')
  }, [server.result, challenge?.id])
  const resume = () => {
    if (flow.session.getSnapshot().result) flow.session.continue()
    setOverlay(null)
    controls.current?.enter()
  }
  const applyReset = (data) => {
    if (!data) return false
    setWorld({ ...scenery, packId })
    setChallenge(null)
    setRunToken((n) => n + 1)
    setOverlay(null)
    lastXp.current = data.xp
    return true
  }
  const startOver = () => {
    if (server.busy || wiping.current) return
    flow.session.restart().then((data) => { if (applyReset(data)) resume() })
  }
  useEffect(() => {
    const xp = server.status?.xp
    const before = lastXp.current
    if (Number.isFinite(xp)) lastXp.current = xp
    if (!ready || xp !== 0 || !(before > 0) || wiping.current) return
    wiping.current = true
    setTryAgain(true)
    setDialog({ packId: null, id: null })
    const timer = setTimeout(() => {
      flow.session.restart().then((data) => {
        applyReset(data)
        setTryAgain(false)
        wiping.current = false
        if (data) controls.current?.enter()
      })
    }, 3000)
    return () => clearTimeout(timer)
  }, [ready, server.status?.xp, flow, scenery, packId])
  const pause = useCallback(() => setDialog((current) => ({ packId, id: current.packId === packId ? current.id || 'pause' : 'pause' })), [packId])
  const askQuestion = (kind, targetId) => {
    setOverlay('question')
    if (targetId) setChallenge({ packId, id: targetId })
    const villainId = kind === 'battle' ? { goblin: 'forest-goblin', wolf: 'bridge-troll', dragon: 'castle-dragon' }[targetId] : undefined
    queueMicrotask(() => { flow.session.beginChallenge(kind, villainId) })
  }
  const interact = (id) => {
    if (id === 'forest-gate') { setOverlay('gate'); return }
    if (id === 'hall-exit') { updateWorld({ stage: 'forest', spawnId: 'castle-approach' }); return }
    if (id === 'princess' || (id === 'dragon' && server.status?.adventure_completed)) { setOverlay('princess'); return }
    askQuestion(getForestTarget(id)?.kind === 'combat' ? 'battle' : 'practice', id)
  }
  const item = challenge && challenge.packId === packId && getForestTarget(challenge.id)?.kind === 'collectible' ? getForestTarget(challenge.id) : null
  const speechId = challenge?.packId === packId && overlay === 'question' && usesCharacterSpeech(challenge.id) ? challenge.id : null
  const questionBody = <>
    {item && server.attempt?.mode !== 'adventure' && <p className="small-print">Study beside {item.name}. Item collection challenges are not available yet.</p>}
    <Encounter session={flow.session} state={server} item={item} />
    <ServerError error={server.error} />
    <Recovery session={flow.session} state={server} onRetry={() => { const target = challenge?.packId === packId && getForestTarget(challenge?.id); if (target && !server.attempt && !server.result) askQuestion(target.kind === 'combat' ? 'battle' : 'practice', target.id); else flow.session.refresh() }} />
    <button className="secondary full-width" onClick={resume}>Return to the adventure</button>
    <button className="secondary full-width" disabled={server.busy} onClick={startOver}>Restart</button>
  </>
  return <SoundContext.Provider value={{ muted, toggle: () => { soundRef.current?.setMuted(!muted); setMuted(!muted) } }}><main className="palace courtyard storywood" onPointerDownCapture={(e) => soundRef.current?.unlock(e.nativeEvent)} onKeyDownCapture={(e) => { if (['Enter', ' '].includes(e.key)) soundRef.current?.unlock(e.nativeEvent) }}>
    <RoomExperience key={scenery.runId + ':' + view.stage + ':' + (ready ? packId : 'opening') + ':' + runToken} controlRef={controls} environment={view.stage} session={scenery.runId} forestRun={view} backendStatus={server.status} player={server.player} playing={ready} onLeaderboard={() => setOverlay('leaderboard')} active={ready && !overlay && !tryAgain} soundRef={soundRef} onPause={pause} onForestInteract={interact} speechTargetId={speechId} onSpeechAnchor={setSpeechAnchor}
      onForestBridgeLowered={() => { if (flow.session.getSnapshot().status?.adventure_unlocked) updateWorld({ bridgeState: 'lowered' }) }}
      onForestEnterCastle={() => { if (flow.session.getSnapshot().status?.adventure_unlocked && view.bridgeState === 'lowered') { updateWorld({ stage: 'castle', checkpoint: { id: 'castle', name: 'Castle entrance', position: CASTLE_APPROACH } }); setOverlay('arrival'); soundRef.current?.play('castle') } }}
      onPrincessWalk={() => soundRef.current?.play('guitar')}
      onPrincessArrived={() => { soundRef.current?.play('victory'); if (overlay !== 'question') setOverlay('rescue') }} />
    {ready && <header className="palace-topbar" inert={!!overlay}><div className="palace-brand"><span className="brand-crest" aria-hidden="true">♜</span><div><strong>Memory Palace</strong><span>THE STORYWOOD</span></div></div><div className="forest-topbar-actions"><SoundControl /><button className="secondary menu-button" onClick={pause}>Pause <kbd>Esc</kbd></button></div></header>}
    {state.phase === 'auth' && <AuthScreen flow={flow} state={state} busy={server.busy} />}
    {!ready && state.phase !== 'auth' && <PdfLanding state={state} onSelect={flow.select} onRetry={flow.retry} onSelectPack={flow.selectPack} onRefresh={flow.loadLibrary} />}
    {ready && tryAgain && <TryAgainBanner />}
    {ready && !tryAgain && overlay === 'question' && speechId && <CharacterSpeech key={server.attempt?.attempt_id || challenge.id} title={server.attempt?.battle?.villain_name || getForestTarget(speechId)?.name || 'A story to remember'} anchor={speechAnchor} onClose={resume}>{questionBody}</CharacterSpeech>}
    {ready && !tryAgain && overlay === 'question' && !speechId && <PalaceDialog adventure backend key={server.attempt?.attempt_id || 'review'} title={server.attempt?.battle?.villain_name || item?.name || 'A story to remember'} onClose={resume}>{questionBody}</PalaceDialog>}
    {ready && !tryAgain && overlay && overlay !== 'question' && <PalaceDialog adventure backend title={{ pause: 'Take a breath.', gate: 'The Storywood drawbridge', arrival: 'The royal hall', princess: 'The Storywood Princess', rescue: 'The princess is free', leaderboard: 'All-time leaderboard' }[overlay]} onClose={resume}>
      {overlay === 'pause' && <><p>WASD move · Mouse or drag to look · E interact · Esc pause</p><ServerError error={server.error} />{(server.attempt || server.result || server.unresolved) && <button className="secondary full-width" onClick={() => setOverlay('question')}>Continue</button>}<button className="secondary full-width" disabled={server.busy} onClick={startOver}>Restart</button>{server.status?.health === 0 && !server.attempt && !server.result && <button className="secondary full-width" onClick={() => askQuestion('practice')}>Recall a story to restore strength</button>}<button className="secondary full-width" disabled={server.busy || !!server.unresolved} onClick={flow.openLibrary}>Return to study sets</button></>}
      {overlay === 'gate' && <p>{server.status?.adventure_unlocked ? view.bridgeState === 'lowered' ? 'The castle is open. Follow the bridge.' : 'Wait for the drawbridge to finish lowering.' : 'Recall stories from your PDF to unlock the castle.'}</p>}
      {overlay === 'arrival' && <p>Explore the east observatory and west library through the side arches. Follow the royal carpet past the dragon to the prison wing. Its bars open only after the dragon is defeated.</p>}
      {overlay === 'princess' && <><p>{server.status?.adventure_completed ? 'You have saved your princess with your knowledge.' : 'The dragon still guards the prison. Defeat the remaining guardians to open its gates.'}</p>{server.status?.adventure_completed && <><h2>The princess is free</h2><p>{server.status.xp} XP · {server.player?.villains.filter((v) => v.status === 'completed').length || 0} guardians defeated</p><p className="small-print">A new campaign is not available yet. Lifetime XP and global rank are unavailable.</p><button className="secondary full-width" onClick={() => setOverlay('leaderboard')}>View leaderboard</button><button className="primary full-width" disabled={server.busy || !!server.unresolved} onClick={flow.openLibrary}>Return to study sets</button></>}</>}
      {overlay === 'rescue' && <p className="dragon-victory">You have saved your princess with your knowledge.</p>}
      {overlay === 'leaderboard' && <><p>The all-time leaderboard is not available yet.</p><p>Your current adventure balance is {server.status?.xp} XP. Lifetime XP and global rank are unavailable.</p></>}
      <button className="primary full-width" onClick={resume}>Return to the adventure</button>
    </PalaceDialog>}
  </main></SoundContext.Provider>
}
