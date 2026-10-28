import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, BackHandler, Text, View } from 'react-native'
import Animated, { FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'
import GameView from './GameView.js'
import PalaceDialog from './PalaceDialog.js'
import PdfLanding from './PdfLanding.js'
import CharacterSpeech from './CharacterSpeech.js'
import { SoundContext } from './SoundControl.js'
import { JourneySummary, StatusPill } from './AdventureHud.js'
import { AuthScreen, Encounter, Recovery, ServerError } from './BackendGame.js'
import { ActionRow, Body, Button, Columns, SmallPrint, Title } from './primitives.js'
import { colors, fonts, useScreen } from './theme.js'
import { createPdfAdventure } from '../api/pdfAdventure.js'
import { createForestView } from '../game/forestView.js'
import { backendWorldView } from '../game/backendWorld.js'
import { getForestTarget } from '../game/forestContent.js'
import { CASTLE_APPROACH, usesCharacterSpeech } from '../forestLayout.js'
import { createStoryAudio } from '../audio/storyAudio.js'
import { loadAudioContext } from '../audio/nativeAudio.js'
import Tap from './Tap.js'

export function TryAgainBanner() {
  const { s } = useScreen()
  const opacity = useSharedValue(0)
  useEffect(() => { opacity.value = withSequence(withTiming(1, { duration: 300 }), withDelay(1800, withTiming(0, { duration: 900 }))) }, [opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View accessibilityLiveRegion="assertive" pointerEvents="none" className="absolute inset-0 items-center justify-center" style={[{ zIndex: 50, backgroundColor: 'rgba(12,18,20,0.84)' }, style]}>
    <Text style={{ fontFamily: fonts.serif, fontSize: s(72), color: '#f6ead0', letterSpacing: 6, textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 30, textShadowOffset: { width: 0, height: 10 } }}>Try again</Text>
  </Animated.View>
}

function IconButton({ glyph, label, onPress, active = true }) {
  const { s } = useScreen()
  const size = s(38)
  return <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'rgba(25,40,48,0.62)', borderColor: 'rgba(236,213,169,0.3)', opacity: pressed ? 0.75 : 1 })}>
    <Text style={{ color: active ? colors.goldSoft : 'rgba(232,206,149,0.5)', fontSize: s(15), fontWeight: '800', textDecorationLine: active ? 'none' : 'line-through' }}>{glyph}</Text>
  </Tap>
}

// Minimal play-time chrome: a status pill on the left, sound and pause icons on the right.
function TopBar({ onPause, onStatus, backendStatus, player }) {
  const { s, edge } = useScreen()
  const sound = useContext(SoundContext)
  return <Animated.View exiting={FadeOut.duration(120)} pointerEvents="box-none" className="absolute left-0 right-0 top-0 flex-row items-center justify-between" style={{ zIndex: 20, paddingTop: edge.top + s(2), paddingLeft: edge.left, paddingRight: edge.right }}>
    <StatusPill backendStatus={backendStatus} player={player} onPress={onStatus} />
    <View className="flex-row items-center" style={{ gap: s(8) }}>
      {sound && <IconButton glyph="♫" active={!sound.muted} label={sound.muted ? 'Unmute sound' : 'Mute sound'} onPress={sound.toggle} />}
      <IconButton glyph="❚❚" label="Pause" onPress={onPause} />
    </View>
  </Animated.View>
}

export default function ForestJourney({ flow: suppliedFlow }) {
  const { s, edge } = useScreen()
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
    const sound = createStoryAudio({ Context: loadAudioContext() }); soundRef.current = sound
    const visibility = AppState.addEventListener('change', (next) => sound.setHidden(next !== 'active'))
    return () => { flow.cancel(); visibility.remove(); sound.dispose(); soundRef.current = null }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, server.status?.xp, flow, scenery, packId])
  const pause = useCallback(() => setDialog((current) => ({ packId, id: current.packId === packId ? current.id || 'pause' : 'pause' })), [packId])
  // Android back pauses play; open dialogs register their own handler and close first.
  useEffect(() => {
    if (!ready) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { pause(); return true })
    return () => sub.remove()
  }, [ready, pause])
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
  const questionBody = <Encounter session={flow.session} state={server} item={item}
    note={item && server.attempt?.mode !== 'adventure' ? <SmallPrint style={{ marginTop: 0, marginBottom: s(6), fontSize: s(11), lineHeight: s(15) }}>Study beside {item.name}. Item collection challenges are not available yet.</SmallPrint> : null}
    footer={<>
      <ServerError error={server.error} />
      <Recovery session={flow.session} state={server} onRetry={() => { const target = challenge?.packId === packId && getForestTarget(challenge?.id); if (target && !server.attempt && !server.result) askQuestion(target.kind === 'combat' ? 'battle' : 'practice', target.id); else flow.session.refresh() }} />
    </>}
    actions={[<Button key="return" compact label="Return to the adventure" onPress={resume} />, <Button key="restart" compact disabled={server.busy} label="Restart" onPress={startOver} />]} />
  const topInset = edge.top + s(46)
  const sound = { muted, toggle: () => { soundRef.current?.setMuted(!muted); setMuted(!muted) } }
  const defeated = server.player?.villains?.filter((v) => v.status === 'completed').length || 0
  return <SoundContext.Provider value={sound}>
    <View className="flex-1" style={{ backgroundColor: colors.storywood }} onTouchStart={() => soundRef.current?.unlock({ isTrusted: true })}>
      <GameView key={scenery.runId + ':' + view.stage + ':' + (ready ? packId : 'opening') + ':' + runToken} controlRef={controls} environment={view.stage} session={scenery.runId} forestRun={view} backendStatus={server.status} player={server.player} playing={ready} onLeaderboard={() => setOverlay('leaderboard')} active={ready && !overlay && !tryAgain} soundRef={soundRef} onPause={pause} onForestInteract={interact} speechTargetId={speechId} onSpeechAnchor={setSpeechAnchor} topInset={topInset} 
        onForestBridgeLowered={() => { if (flow.session.getSnapshot().status?.adventure_unlocked) updateWorld({ bridgeState: 'lowered' }) }}
        onForestEnterCastle={() => { if (flow.session.getSnapshot().status?.adventure_unlocked && view.bridgeState === 'lowered') { updateWorld({ stage: 'castle', checkpoint: { id: 'castle', name: 'Castle entrance', position: CASTLE_APPROACH } }); setOverlay('arrival'); soundRef.current?.play('castle') } }}
        onPrincessWalk={() => soundRef.current?.play('guitar')}
        onPrincessArrived={() => { soundRef.current?.play('victory'); if (overlay !== 'question') setOverlay('rescue') }} />
      {ready && !overlay && !tryAgain && <TopBar onPause={pause} onStatus={() => setOverlay('leaderboard')} backendStatus={server.status} player={server.player} />}
      {state.phase === 'auth' && <AuthScreen flow={flow} state={state} busy={server.busy} />}
      {!ready && state.phase !== 'auth' && <PdfLanding state={state} onSelect={flow.select} onRetry={flow.retry} onSelectPack={flow.selectPack} onRefresh={flow.loadLibrary} />}
      {ready && tryAgain && <TryAgainBanner />}
      {ready && !tryAgain && overlay === 'question' && speechId && <CharacterSpeech key={server.attempt?.attempt_id || challenge.id} title={server.attempt?.battle?.villain_name || getForestTarget(speechId)?.name || 'A story to remember'} anchor={speechAnchor} onClose={resume}>{questionBody}</CharacterSpeech>}
      {ready && !tryAgain && overlay === 'question' && !speechId && <PalaceDialog wide key={server.attempt?.attempt_id || 'review'} title={server.attempt?.battle?.villain_name || item?.name || 'A story to remember'} onClose={resume}>{questionBody}</PalaceDialog>}
      {ready && !tryAgain && overlay && overlay !== 'question' && <PalaceDialog narrow={!['pause', 'princess'].includes(overlay)} title={{ pause: 'Take a breath.', gate: 'The Storywood drawbridge', arrival: 'The royal hall', princess: 'The Storywood Princess', rescue: 'The princess is free', leaderboard: 'All-time leaderboard' }[overlay]} onClose={resume}>
        {overlay === 'pause' && <>
          <Columns ratio={1.1}
            left={<View style={{ gap: s(8) }}>
              <JourneySummary backendStatus={server.status} player={server.player} />
              <Body muted style={{ fontSize: s(12), lineHeight: s(17) }}>Left thumb moves · right thumb looks · push the stick to its edge to sprint · Jump and ✦ Interact sit under your right thumb.</Body>
            </View>}
            right={<View>
              <ServerError error={server.error} />
              {(server.attempt || server.result || server.unresolved) && <Button compact style={{ marginBottom: s(8) }} label="Continue" onPress={() => setOverlay('question')} />}
              <Button variant="primary" compact label="Return to the adventure" onPress={resume} />
              <Button full compact disabled={server.busy} label="Restart" onPress={startOver} />
              {server.status?.health === 0 && !server.attempt && !server.result && <Button full compact label="Recall a story to restore strength" onPress={() => askQuestion('practice')} />}
              <Button full compact disabled={server.busy || !!server.unresolved} label="Return to study sets" onPress={flow.openLibrary} />
              <Button full compact label="Leaderboard" onPress={() => setOverlay('leaderboard')} />
            </View>} />
        </>}
        {overlay === 'gate' && <Body>{server.status?.adventure_unlocked ? view.bridgeState === 'lowered' ? 'The castle is open. Follow the bridge.' : 'Wait for the drawbridge to finish lowering.' : 'Recall stories from your PDF to unlock the castle.'}</Body>}
        {overlay === 'arrival' && <Body>Explore the east observatory and west library through the side arches. Follow the royal carpet past the dragon to the prison wing. Its bars open only after the dragon is defeated.</Body>}
        {overlay === 'princess' && (server.status?.adventure_completed
          ? <Columns
              left={<View style={{ gap: s(6) }}>
                <Body>You have saved your princess with your knowledge.</Body>
                <Title size={20} style={{ marginTop: s(4), marginBottom: 0 }}>The princess is free</Title>
                <Body>{server.status.xp} XP · {defeated} guardians defeated</Body>
                <SmallPrint style={{ marginTop: s(2) }}>A new campaign is not available yet. Lifetime XP and global rank are unavailable.</SmallPrint>
              </View>}
              right={<View>
                <Button variant="primary" compact disabled={server.busy || !!server.unresolved} label="Return to study sets" onPress={flow.openLibrary} />
                <Button full compact label="View leaderboard" onPress={() => setOverlay('leaderboard')} />
                <Button full compact label="Return to the adventure" onPress={resume} />
              </View>} />
          : <Body>The dragon still guards the prison. Defeat the remaining guardians to open its gates.</Body>)}
        {overlay === 'rescue' && <Text className="text-goldsoft" style={{ fontFamily: fonts.serif, fontSize: s(18), lineHeight: s(26) }}>You have saved your princess with your knowledge.</Text>}
        {overlay === 'leaderboard' && <View style={{ gap: s(8) }}>
          <Body>The all-time leaderboard is not available yet.</Body>
          <Body>Your current adventure balance is {server.status?.xp} XP. Lifetime XP and global rank are unavailable.</Body>
        </View>}
        {!(overlay === 'pause' || overlay === 'princess' && server.status?.adventure_completed) && <Button variant="primary" full compact label="Return to the adventure" onPress={resume} />}
      </PalaceDialog>}
    </View>
  </SoundContext.Provider>
}
