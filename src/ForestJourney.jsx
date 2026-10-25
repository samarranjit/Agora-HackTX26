import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import RoomExperience from './RoomExperience.jsx'
import AdventureMenu from './AdventureMenu.jsx'
import PalaceDialog from './PalaceDialog.jsx'
import ForestChallenge from './ForestChallenge.jsx'
import { createForestRun, forestRunReducer, activeForestChallenge, hasPendingForestCombat } from './game/forestRun.js'
import { FOREST_COLLECTIBLES, getForestTarget } from './game/forestContent.js'
import { createGameSession } from './api/gameSession.js'
import { createStoryAudio } from './audio/storyAudio.js'
import { SoundContext } from './audio/soundContext.js'
import SoundControl from './SoundControl.jsx'
import { useCollectionPresentation } from './useCollectionPresentation.js'
import PdfLanding from './PdfLanding.jsx'
import { API_BASE_URL } from './api/config.js'
import './forest.css'

const EMPTY_MEMORIES = []
const BackendTester = import.meta.env.DEV ? lazy(() => import('./BackendTester.jsx')) : null

export default function ForestJourney({ onBackend }) {
  const [run, dispatch] = useReducer(forestRunReducer, undefined, createForestRun)
  const [overlay, setOverlay] = useState('landing')
  const [pdfFile, setPdfFile] = useState(null)
  const controlsRef = useRef(null)
  const soundRef = useRef(null)
  const [muted, setMuted] = useState(false)
  const previousRun = useRef(run)
  const presentation = useCollectionPresentation(run)
  useEffect(() => {
    const sound = createStoryAudio()
    soundRef.current = sound
    const visibility = () => sound.setHidden(document.hidden)
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => { document.removeEventListener('visibilitychange', visibility); sound.dispose(); if (soundRef.current === sound) soundRef.current = null }
  }, [])
  useEffect(() => { soundRef.current?.setActive(overlay === null); soundRef.current?.setEnvironment(run.stage) }, [overlay, run.stage])
  useEffect(() => {
    const old = previousRun.current, sound = soundRef.current
    if (old.runId !== run.runId) { sound?.stopEffects(); if (overlay === 'reset') { sound?.play('incorrect'); sound?.play('heart') } }
    else {
      const current = activeForestChallenge(run)
      if (run.hearts < old.hearts) { sound?.play('incorrect'); sound?.play('heart') }
      if (current?.feedback?.correct && current.feedback !== old.challenges[run.activeTarget]?.feedback) sound?.play(current.complete ? run.activeTarget === 'dragon' ? 'victory' : getForestTarget(run.activeTarget)?.kind === 'combat' ? 'correct' : 'collect' : 'correct')
      if (old.bridgeState === 'raised' && run.bridgeState === 'lowering') sound?.play('bridge')
      if (old.stage !== 'castle' && run.stage === 'castle') sound?.play('dragon')
    }
    previousRun.current = run
  }, [run, overlay])
  const unlockAudio = (event) => { if (event.type !== 'keydown' || ['Enter', ' '].includes(event.key)) soundRef.current?.unlock(event.nativeEvent) }
  const toggleSound = () => { soundRef.current?.setMuted(!muted); setMuted(!muted) }
  // The preserved tester has its own explicitly developer-operated session.
  // Guest play uses no account session. Account mode owns authenticated PDF processing.
  const [developerSession] = useState(() => createGameSession({ baseUrl: API_BASE_URL }))
  const developerState = useSyncExternalStore(developerSession.subscribe, developerSession.getSnapshot)
  const close = useCallback(() => { setOverlay(null); controlsRef.current?.enter() }, [])
  const pause = useCallback(() => setOverlay((current) => current || 'pause'), [])
  const enter = close
  const freshRun = useCallback(() => { dispatch({ type: 'RESET_RUN' }); setOverlay('landing') }, [])
  useEffect(() => {
    let left = false
    const leave = () => { left = true }
    const revisit = (event) => { if (left || event.persisted) { freshRun(); setPdfFile(null); left = false } }
    window.addEventListener('pagehide', leave)
    window.addEventListener('pageshow', revisit)
    return () => { window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', revisit) }
  }, [freshRun])
  const interact = useCallback((targetId) => {
    if (hasPendingForestCombat(run) && targetId !== run.activeTarget) { setOverlay('challenge'); return }
    soundRef.current?.play(targetId === 'dragon' && !run.dragonDefeated ? 'dragon' : 'interact')
    if (targetId === 'forest-gate') { setOverlay('gate'); return }
    if (targetId === 'hall-exit') { dispatch({ type: 'LEAVE_CASTLE', runId: run.runId }); setOverlay(null); return }
    if (targetId === 'princess') { setOverlay('princess'); return }
    if (targetId === 'dragon' && run.dragonDefeated) { setOverlay('victory'); return }
    dispatch({ type: 'OPEN_CHALLENGE', runId: run.runId, targetId }); setOverlay('challenge')
  }, [run])
  const encounterApproach = useCallback((targetId) => { dispatch({ type: 'START_FOREST_ENCOUNTER', runId: run.runId, targetId }); soundRef.current?.play(targetId === 'wolf' ? 'wolf' : 'interact'); setOverlay('encounter-intro') }, [run.runId])
  const bridgeLowered = useCallback(() => dispatch({ type: 'BRIDGE_LOWERED', runId: run.runId }), [run.runId])
  const enterCastle = useCallback(() => { dispatch({ type: 'ENTER_CASTLE', runId: run.runId }); setOverlay('castle-arrival') }, [run.runId])
  const challenge = activeForestChallenge(run)
  return <SoundContext.Provider value={{ muted, toggle: toggleSound }}><main className="palace courtyard storywood" onPointerDownCapture={unlockAudio} onKeyDownCapture={unlockAudio}>
    <RoomExperience key={`${run.runId}:${run.stage}`} controlRef={controlsRef} memories={EMPTY_MEMORIES} active={overlay === null} environment={run.stage} session={run.runId} hearts={run.hearts} onPause={pause} forestRun={run} forestPresentation={presentation} soundRef={soundRef} onForestInteract={interact} onForestEncounter={encounterApproach} onForestBridgeLowered={bridgeLowered} onForestEnterCastle={enterCastle} />
    <header className="palace-topbar" inert={overlay !== null}><div className="palace-brand"><span className="brand-crest" aria-hidden="true">♜</span><div><strong>Memory Palace</strong><span>{run.stage === 'castle' ? 'THE STORYKEEPER’S HALL' : 'THE STORYWOOD · MEDIUM'}</span></div></div><div className="forest-topbar-actions"><SoundControl /><button className="secondary menu-button" onClick={pause}>Menu <kbd>Esc</kbd></button></div></header>
    {run.stage === 'castle' && <div className="forest-scene-transition" aria-hidden="true" />}
    {overlay === 'landing' && <PdfLanding file={pdfFile} onFile={setPdfFile} onContinue={enter} onGuestDemo={enter} onBackend={onBackend} onTester={() => setOverlay('tester')} />}
    {overlay === 'encounter-intro' && <PalaceDialog adventure backend title={getForestTarget(run.activeTarget)?.name || 'A forest challenger'} kicker="Starter encounter · No help" onClose={close}><p>{getForestTarget(run.activeTarget)?.introduction}</p><p className="demo-notice">One correct answer clears this encounter. Mistakes cost the same hearts as collectible questions. No hints or answer reveals are available.</p><button data-autofocus className="primary full-width" onClick={() => setOverlay('challenge')}>Face the challenger</button></PalaceDialog>}
    {overlay === 'princess' && <PalaceDialog adventure backend title="The Storywood Princess" onClose={close}><p>{run.dragonDefeated ? 'Thank you for returning the stories. The kingdom can remember its way forward again.' : 'The dragon guards this throne. Face the Storykeeper to complete your adventure.'}</p><button className="primary full-width" onClick={close}>Return to the hall</button></PalaceDialog>}
    {(overlay === 'welcome' || overlay === 'pause') && <AdventureMenu forestRun={run} paused={overlay === 'pause'} onEnter={enter} onJournal={() => setOverlay('journal')} onNewRun={freshRun} hasAttempt={!!challenge && !challenge.complete} onResume={() => setOverlay('challenge')} onTester={() => setOverlay('tester')} feedback={<button className="text-button" onClick={() => setOverlay('landing')}>{pdfFile ? `Study PDF: ${pdfFile.name} · change or remove` : 'Choose a study PDF'}</button>} onDemo={import.meta.env.DEV ? () => { window.location.search = '?demo=indoor' } : undefined} />}
    {overlay === 'challenge' && <ForestChallenge run={run} dispatch={dispatch} onClose={close} onReset={() => setOverlay('reset')} />}
    {overlay === 'reset' && <PalaceDialog adventure backend title="A fresh page in your story." kicker="All three hearts were lost" onClose={close}><p>Your previous run has ended. Its collected items, XP, question progress, checkpoints and castle unlock have been cleared.</p><p className="demo-notice">You are back at the forest trailhead with three restored hearts and five stories waiting to be found.</p><button data-autofocus className="primary full-width" onClick={enter}>Begin the new run</button></PalaceDialog>}
    {overlay === 'journal' && <PalaceDialog adventure backend title="Five tales, one winding trail." kicker="Stories & checkpoints" onClose={close}>
      <p>{run.collectedIds.length} / 5 items · {run.xp} / {run.rules.unlockXp} prototype XP · {run.hearts} hearts</p>
      <ul className="forest-journal">{FOREST_COLLECTIBLES.map((item) => <li key={item.id}><strong>{run.collectedIds.includes(item.id) ? '✓ ' : '◇ '}{item.name}</strong><p>{run.collectedIds.includes(item.id) ? 'Collected · checkpoint recorded' : `${item.landmark} This run: ${run.layout.collectibles.find((p) => p.id === item.id).x < 0 ? 'west' : 'east'} of the trail.`}</p></li>)}</ul>
      <p className="small-print">Trail encounters: {run.defeatedEnemyIds.includes('goblin') ? 'Goblin cleared' : 'Goblin pending'} · {run.defeatedEnemyIds.includes('wolf') ? 'Wolf cleared' : 'Wolf pending'}.</p>
      {import.meta.env.DEV && <p className="small-print">Layout seed: {run.layout.seed}</p>}
      <h2>Milestones</h2><ol className="forest-milestones">{run.checkpoints.map((point) => <li key={point.id}>{point.name}</li>)}</ol>
      <p className="small-print">Checkpoints mark your latest safe ground. Losing all hearts starts a completely new run, including a locked castle. Refreshing or leaving also ends this guest visit.</p>
      <button className="primary full-width" onClick={close}>Return to the trail</button>
    </PalaceDialog>}
    {overlay === 'gate' && <PalaceDialog adventure backend title="The sleeping drawbridge." onClose={close}>
      <p>{run.bridgeState === 'lowered' ? 'The bridge is down. Walk beneath the arch to meet the Storykeeper.' : run.bridgeState === 'lowering' ? 'The bridge is lowering and the portcullis is rising. Wait on this bank until both have finished.' : `Complete story challenges to reach ${run.rules.unlockXp} prototype XP. You currently have ${run.xp}.`}</p>
      <p className="demo-notice">All five stories are required. Each completed three-question challenge awards {run.rules.itemXp} prototype XP, once per run.</p>
      <button className="primary full-width" onClick={close}>Return to the bridge</button>
    </PalaceDialog>}
    {overlay === 'castle-arrival' && <PalaceDialog adventure backend title="A kingdom beneath one roof." kicker="Castle checkpoint recorded" onClose={close}><p>Follow the long royal carpet through the immense throne hall. The dragon guards the princess on the raised court beyond the pillars. Press E nearby for the final three-question encounter. Combat offers no help.</p><p className="small-print">This is a local prototype encounter. The current backend cannot create anonymous runs or select a dragon as the first battle.</p><button data-autofocus className="primary full-width" onClick={enter}>Enter the hall</button></PalaceDialog>}
    {overlay === 'victory' && <PalaceDialog adventure backend title="The tales are safe." onClose={close}><p>You completed the Storykeeper’s recall. Explore the hall, return to the forest, or begin a new guest visit.</p><button className="primary full-width" onClick={close}>Keep exploring</button><button className="secondary full-width" onClick={freshRun}>Begin a new story</button></PalaceDialog>}
    {import.meta.env.DEV && overlay === 'tester' && <PalaceDialog adventure backend wide title="Backend API Tester" onClose={() => setOverlay('pause')}><p className="demo-notice">Developer tools use the existing account API. They are separate from this offline guest run and cannot change its XP, hearts, items or gate.</p><Suspense fallback={<p>Loading tester…</p>}><BackendTester session={developerSession} state={developerState} /></Suspense></PalaceDialog>}
  </main></SoundContext.Provider>
}
