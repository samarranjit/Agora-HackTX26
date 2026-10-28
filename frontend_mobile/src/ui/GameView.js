import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, PixelRatio, Text, View } from 'react-native'
import { GLView } from 'expo-gl'
import * as THREE from 'three'
import { createGLRenderer, tuneSceneForMobile } from '../glRenderer.js'
import { createTouchControls, EYE_HEIGHT } from '../touchControls.js'
import { createPlayerMotion } from '../playerMotion.js'
import { createSwordProp } from '../swordProp.js'
import { createForestScene, createCastleHallScene } from '../forestScene.js'
import { nearbyForestTarget, nearbyHallTarget, forestEncounterAt, hallEncounterAt, forestGuardianAnchor, forestGuardianApproachable, speechAnchorFromProjected } from '../forestLayout.js'
import { getForestTarget } from '../game/forestContent.js'
import { createWalkFeel } from '../walkFeel.js'
import { createEncounterTrigger } from '../game/encounterTrigger.js'
import TouchControls from './TouchControls.js'
import { BridgeNotice, ControlsHint, Crosshair, InteractionPrompt, RespawnNotice } from './AdventureHud.js'
import { useScreen } from './theme.js'

// Phones above 2x density render at 2x and let the compositor upscale the frame.
const RENDER_SCALE = Math.min(1, 2 / PixelRatio.get())

// Keep roughly the web's horizontal view on wide phones, never wider than 70° vertical.
function verticalFov(aspect) {
  const fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(51)) / aspect)
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(fov), 58, 70)
}

function interactCopy(nearby, hall, run) {
  const target = run && getForestTarget(nearby)
  if (target) return { title: target.name, action: `Tap ✦ to ${target.kind === 'combat' ? 'face this challenger' : 'continue this story'}.`, label: target.kind === 'combat' ? 'FACE' : 'STUDY' }
  if (hall && nearby === 'princess') return { title: 'The Storywood Princess', action: 'Tap ✦ to speak with the princess.', label: 'SPEAK' }
  if (hall && nearby === 'hall-exit') return { title: 'The forest awaits', action: 'Tap ✦ to return to the castle bridge.', label: 'RETURN' }
  if (nearby === 'forest-gate') return { title: null, action: null, label: 'BRIDGE' }
  return null
}

export default function GameView({ active, playing, session, onPause, backendStatus, player, onLeaderboard, environment = 'forest', controlRef, forestRun, soundRef, onForestInteract, onForestBridgeLowered, onForestEnterCastle, onPrincessWalk, onPrincessArrived, speechTargetId, onSpeechAnchor, topInset }) {
  const { width, height, s } = useScreen()
  const controlsRef = useRef(null)
  const propsRef = useRef({})
  const disposeRef = useRef(null)
  const interactRef = useRef(() => {})
  const [nearby, setNearby] = useState(null)
  const [respawned, setRespawned] = useState(false)
  const [hint, setHint] = useState(true)
  const [glError, setGlError] = useState(null)
  // Bumped to recreate the GL surface when a live scene was disposed without unmounting it
  // (Fast Refresh re-runs effects but keeps the GLView and its context).
  const [surface, setSurface] = useState(0)
  const createdRef = useRef(false)
  const forest = environment === 'forest'
  const hall = environment === 'castle'

  useImperativeHandle(controlRef, () => ({ enter() { controlsRef.current?.setActive(true) } }), [])

  // Assigned during render, not in an effect: GLView may create its context from its own
  // mount effect, which runs before this component's effects, and the scene must be built
  // from this run's layout.
  propsRef.current = { active, onPause, forestRun, onForestInteract, onForestBridgeLowered, onForestEnterCastle, onPrincessWalk, onPrincessArrived, speechTargetId, onSpeechAnchor }

  const onContextCreate = useCallback((gl) => {
    disposeRef.current?.()
    createdRef.current = true
    setNearby(null)
    const room = forest ? createForestScene({ spawnId: propsRef.current.forestRun?.spawnId, layout: propsRef.current.forestRun?.layout }) : createCastleHallScene()
    tuneSceneForMobile(room.scene)
    let created
    try { created = createGLRenderer(gl) }
    catch (error) { room.dispose(); setGlError(error.message || 'The 3D world could not start on this device.'); return }
    const { renderer, width: bufferWidth, height: bufferHeight } = created
    const aspect = bufferWidth / bufferHeight
    const camera = new THREE.PerspectiveCamera(verticalFov(aspect), aspect, 0.08, 220)
    camera.rotation.order = 'YXZ'
    camera.position.set(room.spawn?.x ?? 0, (room.spawn?.y ?? 0) + EYE_HEIGHT, room.spawn?.z ?? 3.6)
    camera.rotation.y = room.spawn?.yaw ?? 0
    camera.rotation.x = 0.06
    const motion = createPlayerMotion(room.world)
    room.scene.add(camera)
    // The narrower phone FOV makes the held sword loom; keep it smaller and further right.
    const sword = createSwordProp(camera)
    sword.scale.multiplyScalar(0.8)
    sword.position.x += Math.max(0, Math.min(0.2, (aspect - 16 / 9) * 0.3))
    sword.position.y += 0.04

    let frameId = 0, lastTime = performance.now(), lastNearby = null, exited = false, disposed = false, noticeTimer
    let bobOffset = 0, swayX = 0, swayZ = 0, lastSpeech = '', foreground = AppState.currentState === 'active'
    let reducedMotion = false
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { reducedMotion = value }).catch(() => {})
    const motionListener = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => { reducedMotion = value })
    const walkFeel = createWalkFeel()
    const encounterTrigger = createEncounterTrigger()
    const projected = new THREE.Vector3()
    const physicalPosition = () => ({ x: camera.position.x - swayX, y: camera.position.y - bobOffset, z: camera.position.z - swayZ })
    const forestTarget = () => forest ? nearbyForestTarget(physicalPosition(), propsRef.current.forestRun) : hall ? nearbyHallTarget(physicalPosition(), propsRef.current.forestRun, room.world.princessAt) : null
    const controls = createTouchControls({
      camera, motion,
      onRespawn: () => {
        setRespawned(true)
        clearTimeout(noticeTimer)
        noticeTimer = setTimeout(() => setRespawned(false), 3500)
      },
    })
    controlsRef.current = controls
    controls.setActive(propsRef.current.active)
    interactRef.current = () => {
      if (!controls.active) return
      const targetId = forestTarget()
      if (targetId) controls.suspend(() => propsRef.current.onForestInteract?.(targetId))
    }
    // Leaving the app pauses play, like losing window focus on the web.
    const appState = AppState.addEventListener('change', (state) => {
      foreground = state === 'active'
      if (!foreground && controls.active) controls.suspend(() => propsRef.current.onPause?.())
      if (foreground) lastTime = performance.now()
    })

    const tick = () => {
      if (disposed) return
      frameId = requestAnimationFrame(tick)
      if (!foreground) return
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      // Remove last frame's presentation offset before physics and all proximity checks.
      camera.position.y -= bobOffset
      camera.position.x -= swayX; camera.position.z -= swayZ
      bobOffset = 0; swayX = 0; swayZ = 0
      const beforeX = camera.position.x, beforeZ = camera.position.z
      const feet = motion.position
      room.update(dt, { ...propsRef.current, playerPosition: { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z }, reducedMotion, onGuardianAppear: (id) => soundRef?.current?.play(id) })
      controls.update(dt)
      if (__DEV__ && (globalThis.__navDbg = (globalThis.__navDbg || 0) + 1) % 20 === 0) { const run = propsRef.current.forestRun, pos = physicalPosition(); const bearing = (c) => { let d = (Math.atan2(-(c.x - pos.x), -(c.z - pos.z)) - camera.rotation.y) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.round(d * 180 / Math.PI) }; const wolf = run?.layout?.encounters?.[1]; const goal = forest ? (run?.defeatedEnemyIds?.includes('wolf') ? [{ x: 4, z: -4 }, { x: 0, z: -20 }, { x: 0, z: -40 }].find((w) => w.z < pos.z - 1.5) : wolf) : [{ x: 0, z: -40 }, { x: -4, z: -51 }].find((w) => w.z < pos.z - 1.5); console.log('NAV', controls.active, goal ? Math.hypot(pos.x - goal.x, pos.z - goal.z).toFixed(1) : -1, goal ? bearing(goal) : 0, forestTarget()) }
      if (controls.active) {
        const nextNearby = forestTarget()
        if (nextNearby !== lastNearby) {
          lastNearby = nextNearby; setNearby(nextNearby)
          if (getForestTarget(nextNearby) && !(nextNearby === 'dragon' && propsRef.current.forestRun?.dragonDefeated)) soundRef?.current?.play('approach')
        }
        const encounter = forest ? forestEncounterAt(physicalPosition(), propsRef.current.forestRun) : hall ? hallEncounterAt(physicalPosition(), propsRef.current.forestRun) : null
        const triggered = encounterTrigger.update(encounter, forestGuardianApproachable(propsRef.current.forestRun, encounter))
        if (triggered) controls.suspend(() => propsRef.current.onForestInteract?.(triggered))
        if (forest && propsRef.current.forestRun?.bridgeState === 'lowered' && camera.position.z < -32.4 && !exited) {
          exited = true
          controls.suspend(() => propsRef.current.onForestEnterCastle?.())
        }
      }
      const feel = walkFeel.update(dt, Math.hypot(camera.position.x - beforeX, camera.position.z - beforeZ), { active: controls.active, grounded: motion.grounded, reducedMotion })
      bobOffset = feel.offsetY
      swayX = Math.cos(camera.rotation.y) * feel.offsetSide
      swayZ = -Math.sin(camera.rotation.y) * feel.offsetSide
      camera.position.y += bobOffset
      camera.position.x += swayX; camera.position.z += swayZ
      if (feel.step) soundRef?.current?.play('footstep')
      const targetId = propsRef.current.speechTargetId
      if (targetId) {
        const world = forestGuardianAnchor(targetId, propsRef.current.forestRun?.layout)
        if (world) {
          projected.set(world.x, world.y, world.z).project(camera)
          const next = speechAnchorFromProjected(projected)
          const key = targetId + ':' + next.x + ':' + next.y + ':' + next.visible
          if (key !== lastSpeech) { lastSpeech = key; propsRef.current.onSpeechAnchor?.(next) }
        }
      } else if (lastSpeech) { lastSpeech = ''; propsRef.current.onSpeechAnchor?.(null) }
      renderer.render(room.scene, camera)
      gl.endFrameEXP()
    }
    tick()
    disposeRef.current = () => {
      disposed = true
      disposeRef.current = null
      clearTimeout(noticeTimer)
      cancelAnimationFrame(frameId)
      appState.remove()
      motionListener.remove()
      controls.dispose()
      if (controlsRef.current === controls) controlsRef.current = null
      interactRef.current = () => {}
      room.dispose()
      try { renderer.dispose() } catch { /* The GL context may already be gone. */ }
    }
  }, [forest, hall, soundRef])

  useEffect(() => {
    if (createdRef.current && !disposeRef.current) setSurface((n) => n + 1)
    return () => disposeRef.current?.()
  }, [])
  useEffect(() => { controlsRef.current?.setActive(active) }, [active])
  // The control hint fades once players have had a moment to read it.
  useEffect(() => {
    if (!playing || !active) return
    const timer = setTimeout(() => setHint(false), 6000)
    return () => clearTimeout(timer)
  }, [playing, active])

  const copy = nearby ? interactCopy(nearby, hall, forestRun) : null
  const renderWidth = Math.round(width * RENDER_SCALE), renderHeight = Math.round(height * RENDER_SCALE)
  const hudTop = topInset + s(4)
  return <>
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <GLView key={`${renderWidth}x${renderHeight}:${session}:${surface}`} msaaSamples={RENDER_SCALE < 1 ? 0 : 2} onContextCreate={onContextCreate}
        style={{ position: 'absolute', width: renderWidth, height: renderHeight, left: (width - renderWidth) / 2, top: (height - renderHeight) / 2, transform: [{ scale: 1 / RENDER_SCALE }] }} />
    </View>
    {glError && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: s(18), alignItems: 'center', zIndex: 40 }}>
      <Text style={{ color: '#ffe5dc', backgroundColor: 'rgba(84,44,54,0.92)', paddingHorizontal: s(14), paddingVertical: s(8), borderRadius: s(8), fontSize: s(12) }}>{glError}</Text>
    </View>}
    {playing && active && <>
      <Crosshair />
      {nearby === 'forest-gate' && <BridgeNotice unlocked={!!backendStatus?.adventure_unlocked} top={hudTop} />}
      {respawned && <RespawnNotice top={hudTop + s(nearby === 'forest-gate' ? 60 : 0)} />}
      {copy?.title ? <InteractionPrompt title={copy.title} action={copy.action} onPress={() => interactRef.current()} /> : hint && <ControlsHint />}
      <TouchControls controls={controlsRef} nearby={!!copy} interactLabel={copy?.label} onInteract={() => interactRef.current()} topInset={topInset} />
    </>}
  </>
}
