import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { createPlayerControls, EYE_HEIGHT } from './playerControls.js'
import { createPlayerMotion } from './playerMotion.js'
import { createSwordProp } from './swordProp.js'
import AdventureHud from './AdventureHud.jsx'
import { createForestScene, createCastleHallScene } from './forestScene.js'
import { nearbyForestTarget, nearbyHallTarget, forestEncounterAt, hallEncounterAt, forestGuardianAnchor, forestGuardianApproachable, speechAnchorFromProjected, CASTLE_EYE_HEIGHT } from './forestLayout.js'
import { getForestTarget } from './game/forestContent.js'
import { createWalkFeel } from './walkFeel.js'
import { createEncounterTrigger } from './game/encounterTrigger.js'

export default function RoomExperience({ active, playing, session, onPause, backendStatus, player, onLeaderboard, environment = 'forest', controlRef, forestRun, soundRef, onForestInteract, onForestBridgeLowered, onForestEnterCastle, onPrincessWalk, onPrincessArrived, speechTargetId, onSpeechAnchor }) {
  const mountRef = useRef(null)
  const controlsRef = useRef(null)
  const propsRef = useRef({})
  const [locked, setLocked] = useState(false)
  const [nearby, setNearby] = useState(null)
  const [respawned, setRespawned] = useState(false)
  const forest = environment === 'forest'
  const hall = environment === 'castle'
  const adventuring = true

  useImperativeHandle(controlRef, () => ({
    enter() {
      // Resume in the original gesture; setActive requests lock only on activation.
      if (mountRef.current) mountRef.current.inert = false
      controlsRef.current?.setActive(true)
    },
  }), [])

  useEffect(() => {
    propsRef.current = { active, onPause, forestRun, onForestInteract, onForestBridgeLowered, onForestEnterCastle, onPrincessWalk, onPrincessArrived, speechTargetId, onSpeechAnchor }
  }, [active, onPause, forestRun, onForestInteract, onForestBridgeLowered, onForestEnterCastle, onPrincessWalk, onPrincessArrived, speechTargetId, onSpeechAnchor])

  useEffect(() => {
    const mount = mountRef.current
    const room = forest ? createForestScene({ spawnId: propsRef.current.forestRun?.spawnId, layout: propsRef.current.forestRun?.layout }) : createCastleHallScene()
    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.08, adventuring ? 220 : 50)
    camera.rotation.order = 'YXZ'
    const eyeHeight = hall ? CASTLE_EYE_HEIGHT : EYE_HEIGHT
    camera.position.set(room.spawn?.x ?? 0, (room.spawn?.y ?? 0) + eyeHeight, room.spawn?.z ?? 3.6)
    camera.rotation.y = room.spawn?.yaw ?? 0
    if (adventuring) camera.rotation.x = 0.06
    const motion = adventuring ? createPlayerMotion(room.world) : null
    if (adventuring) {
      room.scene.add(camera)
      createSwordProp(camera)
    }
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    if (adventuring) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
    }
    mount.appendChild(renderer.domElement)
    const canvas = renderer.domElement
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', adventuring ? 'Memory Palace adventure. WASD move, Space jump, Shift sprint, E interact, mouse or drag to look, Escape pause.' : 'Walkable memory room. WASD to move, mouse or drag to look, E at the door, Escape to pause.')
    let lastTime = performance.now()
    let frameId = 0
    let lastNearby = null
    let exited = false
    let disposed = false
    let noticeTimer
    const walkFeel = createWalkFeel()
    const encounterTrigger = createEncounterTrigger()
    const projected = new THREE.Vector3()
    let lastSpeech = ''
    let bobOffset = 0, swayX = 0, swayZ = 0
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionPreference.matches
    const preferenceChanged = (event) => { reducedMotion = event.matches }
    motionPreference.addEventListener('change', preferenceChanged)
    const physicalPosition = () => ({ x: camera.position.x - swayX, y: camera.position.y - bobOffset, z: camera.position.z - swayZ })
    const forestTarget = () => forest ? nearbyForestTarget(physicalPosition(), propsRef.current.forestRun) : hall ? nearbyHallTarget(physicalPosition(), propsRef.current.forestRun, room.world.princessAt) : null
    const controls = createPlayerControls({
      canvas,
      camera,
      constrainMovement: room.collide,
      motion,
      eyeHeight,
      onRespawn: () => {
        setRespawned(true)
        clearTimeout(noticeTimer)
        noticeTimer = setTimeout(() => setRespawned(false), 3500)
      },
      onInteract: () => {
        const targetId = forestTarget()
        if (targetId) controls.suspend(() => propsRef.current.onForestInteract?.(targetId))
      },
      onPause: () => propsRef.current.onPause(),
      onLockChange: setLocked,
    })
    controlsRef.current = controls
    controls.setActive(propsRef.current.active, { requestLock: false })
    // Let StrictMode finish its setup/cleanup cycle before a new canvas requests lock.
    // A discarded controller ignores this one queued attempt; gesture-driven resumes
    // still request synchronously through enter(). No retry loop is scheduled.
    queueMicrotask(() => controls.lockMouse())
    const resize = new ResizeObserver(() => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    })
    resize.observe(mount)

    const tick = () => {
      if (disposed) return
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      // Remove last frame's presentation offset before physics and all proximity checks.
      camera.position.y -= bobOffset
      camera.position.x -= swayX; camera.position.z -= swayZ
      bobOffset = 0; swayX = 0; swayZ = 0
      const beforeX = camera.position.x, beforeZ = camera.position.z
      const feet = motion?.position
      room.update(dt, { ...propsRef.current, playerPosition: feet ? { x: feet.x, y: feet.y + eyeHeight, z: feet.z } : physicalPosition(), reducedMotion, onGuardianAppear: (id) => soundRef?.current?.play(id) })
      controls.update(dt, propsRef.current)
      if (adventuring && controls.active) {
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
      if (forest || hall) {
        const feel = walkFeel.update(dt, Math.hypot(camera.position.x - beforeX, camera.position.z - beforeZ), { active: controls.active, grounded: motion.grounded, reducedMotion })
        bobOffset = feel.offsetY
        swayX = Math.cos(camera.rotation.y) * feel.offsetSide
        swayZ = -Math.sin(camera.rotation.y) * feel.offsetSide
        camera.position.y += bobOffset
        camera.position.x += swayX; camera.position.z += swayZ
        if (feel.step) soundRef?.current?.play('footstep')
      }
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
      frameId = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      disposed = true
      clearTimeout(noticeTimer)
      cancelAnimationFrame(frameId)
      resize.disconnect()
      motionPreference.removeEventListener('change', preferenceChanged)
      controls.dispose()
      controlsRef.current = null
      room.dispose()
      renderer.dispose()
      // This canvas is discarded on a new session; release its remaining GPU caches now.
      renderer.forceContextLoss()
      canvas.remove()
    }
  }, [session, forest, hall, adventuring, soundRef])

  useEffect(() => { controlsRef.current?.setActive(active) }, [active])

  const lockMouse = () => controlsRef.current?.lockMouse()
  const fairytaleItem = forestRun && getForestTarget(nearby)
  return (
    <>
      <div className="palace-stage" ref={mountRef} inert={!active} />
      {playing && <div className={'palace-hud' + (!active ? ' hud-paused' : '')} inert={!active}>
        <div className="palace-crosshair" aria-hidden="true" />
        <AdventureHud backendStatus={backendStatus} player={player} onLeaderboard={onLeaderboard} nearBridge={nearby === 'forest-gate'} respawned={respawned} />
        {fairytaleItem && <div key={nearby} className="door-prompt forest-interaction" role="status"><strong>{fairytaleItem.name}</strong><p>Press E to {fairytaleItem.kind === 'combat' ? 'face this challenger' : 'continue this story'}.</p></div>}
        {hall && nearby === 'princess' && <div className="door-prompt" role="status"><strong>The Storywood Princess</strong><p>Press E to speak with the princess.</p></div>}
        {hall && nearby === 'hall-exit' && <div className="door-prompt" role="status"><strong>The forest awaits</strong><p>Press E to return to the castle bridge.</p></div>}
        <div className={'palace-hint' + (adventuring ? ' adventure-hint' : '')}><strong>WASD</strong> move · <strong>{locked ? 'Mouse' : 'Drag'}</strong> look · {adventuring ? <><strong>Space</strong> jump · <strong>Shift</strong> sprint · <strong>E</strong> interact</> : <><strong>E</strong> at door</>} · <strong>Esc</strong> pause</div>
        {!locked && <button className="palace-relock" onClick={lockMouse}>Resume mouse look</button>}
      </div>}
    </>
  )
}
