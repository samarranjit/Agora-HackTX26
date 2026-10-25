import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { createRoomScene, PEDESTALS, ROOM_SIZE } from './roomScene.js'
import { createPlayerControls, EYE_HEIGHT } from './playerControls.js'
import { createCourtyardScene } from './courtyardScene.js'
import { createPlayerMotion, MAX_STAMINA } from './playerMotion.js'
import { createSwordProp } from './swordProp.js'
import AdventureHud from './AdventureHud.jsx'
import { nearGoblin } from './forestGoblin.js'
import { createForestScene, createCastleHallScene } from './forestScene.js'
import { nearbyForestTarget, nearbyHallTarget, approachingForestEncounter } from './forestLayout.js'
import { getForestTarget } from './game/forestContent.js'
import { createWalkFeel } from './walkFeel.js'

export default function RoomExperience({ memories, active, unlocked, session, onDoor, onPause, onExit, onDiscover, onGoblin, backendStatus, signedIn, environment = 'indoor', hearts, controlRef, forestRun, forestPresentation, soundRef, onForestInteract, onForestEncounter, onForestBridgeLowered, onForestEnterCastle }) {
  const mountRef = useRef(null)
  const controlsRef = useRef(null)
  const propsRef = useRef({})
  const [locked, setLocked] = useState(false)
  const [nearby, setNearby] = useState(null)
  const [vitals, setVitals] = useState({ stamina: MAX_STAMINA, exhausted: false })
  const [respawned, setRespawned] = useState(false)
  const outdoor = environment === 'courtyard'
  const forest = environment === 'forest'
  const hall = environment === 'castle'
  const adventuring = outdoor || forest || hall

  useImperativeHandle(controlRef, () => ({
    enter() {
      // Resume in the original gesture; setActive requests lock only on activation.
      if (mountRef.current) mountRef.current.inert = false
      controlsRef.current?.setActive(true)
    },
  }), [])

  useEffect(() => {
    propsRef.current = { active, unlocked, onDoor, onPause, onExit, onDiscover, onGoblin, forestRun, onForestInteract, onForestEncounter, onForestBridgeLowered, onForestEnterCastle }
  }, [active, unlocked, onDoor, onPause, onExit, onDiscover, onGoblin, forestRun, onForestInteract, onForestEncounter, onForestBridgeLowered, onForestEnterCastle])

  useEffect(() => {
    const mount = mountRef.current
    const room = forest ? createForestScene({ spawnId: propsRef.current.forestRun?.spawnId, layout: propsRef.current.forestRun?.layout }) : hall ? createCastleHallScene() : outdoor ? createCourtyardScene() : createRoomScene(memories)
    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.08, adventuring ? 220 : 50)
    camera.rotation.order = 'YXZ'
    camera.position.set(room.spawn?.x ?? 0, (room.spawn?.y ?? 0) + EYE_HEIGHT, room.spawn?.z ?? 3.6)
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
    let hudElapsed = 0
    let noticeTimer
    const walkFeel = createWalkFeel()
    let bobOffset = 0, swayX = 0, swayZ = 0
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionPreference.matches
    const preferenceChanged = (event) => { reducedMotion = event.matches }
    motionPreference.addEventListener('change', preferenceChanged)
    const nearDoor = () => Math.hypot(camera.position.x, camera.position.z - ROOM_SIZE / 2) < 2.3
    const physicalPosition = () => ({ x: camera.position.x - swayX, y: camera.position.y - bobOffset, z: camera.position.z - swayZ })
    const forestTarget = () => forest ? nearbyForestTarget(physicalPosition(), propsRef.current.forestRun) : hall ? nearbyHallTarget(physicalPosition()) : null
    const controls = createPlayerControls({
      canvas,
      camera,
      constrainMovement: room.collide,
      motion,
      onRespawn: () => {
        setRespawned(true)
        clearTimeout(noticeTimer)
        noticeTimer = setTimeout(() => setRespawned(false), 3500)
      },
      onInteract: () => {
        if (forest || hall) {
          const targetId = forestTarget()
          if (targetId) controls.suspend(() => propsRef.current.onForestInteract?.(targetId))
          return
        }
        if (outdoor && nearGoblin(camera.position)) controls.suspend(propsRef.current.onGoblin)
        if (!outdoor && nearDoor() && !propsRef.current.unlocked && memories.length) controls.suspend(propsRef.current.onDoor)
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
      const isOpen = propsRef.current.unlocked
      // Remove last frame's presentation offset before physics and all proximity checks.
      camera.position.y -= bobOffset
      camera.position.x -= swayX; camera.position.z -= swayZ
      bobOffset = 0; swayX = 0; swayZ = 0
      const beforeX = camera.position.x, beforeZ = camera.position.z
      room.update(dt, { ...propsRef.current, playerPosition: motion?.position, reducedMotion })
      controls.update(dt, propsRef.current)
      if (adventuring && controls.active) {
        const nextNearby = forest || hall ? forestTarget() : nearGoblin(camera.position) ? 'goblin' : Math.abs(camera.position.x) < 4 && camera.position.z < -5 ? 'bridge' : null
        if (nextNearby !== lastNearby) {
          lastNearby = nextNearby; setNearby(nextNearby)
          if (getForestTarget(nextNearby) && !(nextNearby === 'dragon' && propsRef.current.forestRun?.dragonDefeated)) soundRef?.current?.play('approach')
        }
        const encounter = forest && approachingForestEncounter(camera.position, propsRef.current.forestRun)
        if (encounter) controls.suspend(() => propsRef.current.onForestEncounter?.(encounter))
        if (forest && propsRef.current.forestRun.bridgeState === 'lowered' && camera.position.z < -32.4 && !exited) {
          exited = true
          controls.suspend(() => propsRef.current.onForestEnterCastle?.())
        }
        hudElapsed += dt
        if (hudElapsed >= 0.1) {
          hudElapsed = 0
          const stamina = Math.round(motion.stamina)
          setVitals((old) => old.stamina === stamina && old.exhausted === motion.exhausted ? old : { stamina, exhausted: motion.exhausted })
        }
      } else if (!adventuring && controls.active) {
        let nextNearby = nearDoor() ? 'door' : null
        let nearest = 2.2
        PEDESTALS.forEach((spot, i) => {
          const distance = Math.hypot(camera.position.x - spot.x, camera.position.z - spot.z)
          if (memories[i] && distance < nearest) { nearest = distance; nextNearby = memories[i].id }
        })
        if (nextNearby !== lastNearby) {
          lastNearby = nextNearby
          setNearby(nextNearby)
          if (nextNearby && nextNearby !== 'door') propsRef.current.onDiscover(nextNearby)
        }
        if (isOpen && camera.position.z > ROOM_SIZE / 2 + 0.8 && !exited) {
          exited = true
          controls.suspend(propsRef.current.onExit)
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
  }, [memories, session, outdoor, forest, hall, adventuring, soundRef])

  useEffect(() => { controlsRef.current?.setActive(active) }, [active])

  const lockMouse = () => controlsRef.current?.lockMouse()
  const memory = memories.find((item) => item.id === nearby)
  const fairytaleItem = forestRun && getForestTarget(nearby)
  return (
    <>
      <div className="palace-stage" ref={mountRef} inert={!active} />
      {active && <div className="palace-hud">
        <div className="palace-crosshair" aria-hidden="true" />
        {adventuring && <AdventureHud hearts={hearts} forestRun={forestRun} forestPresentation={forestPresentation} backendStatus={backendStatus} signedIn={signedIn} stamina={vitals.stamina} exhausted={vitals.exhausted} nearBridge={nearby === 'bridge' || nearby === 'forest-gate'} respawned={respawned} />}
        {fairytaleItem && <div key={nearby} className="door-prompt forest-interaction" role="status"><strong>{forestRun.accountMode && fairytaleItem.kind === 'combat' ? 'Palace guardian marker' : fairytaleItem.name}</strong><p>{forestRun.accountMode ? fairytaleItem.kind === 'combat' ? 'Press E to challenge the next server-selected guardian.' : 'Press E to practice your study PDF. Account rewards come from the server.' : nearby === 'dragon' && forestRun.dragonDefeated ? 'The Storykeeper is at peace. Press E to revisit your victory.' : `Press E to ${fairytaleItem.kind === 'combat' ? 'face this encounter' : 'collect'} · ${fairytaleItem.questions.length}-question ${fairytaleItem.tier === 'starter' ? 'starter encounter' : 'challenge'}${fairytaleItem.kind === 'combat' ? ' · No help' : ''}`}</p></div>}
        {hall && nearby === 'princess' && <div className="door-prompt" role="status"><strong>The Storywood Princess</strong><p>Press E to speak with the princess.</p></div>}
        {hall && nearby === 'hall-exit' && <div className="door-prompt" role="status"><strong>The forest awaits</strong><p>Press E to return to the castle bridge.</p></div>}
        {outdoor && nearby === 'goblin' && <div className="door-prompt" role="status"><strong>Forest Goblin — Press E to challenge.</strong><p>The backend chooses the next guardian and checks your eligibility.</p></div>}
        {!adventuring && memory && <article className="memory-label" aria-live="polite">
          <span className="palace-kicker">Memory {memories.indexOf(memory) + 1} / 3</span>
          <h2>{memory.title}</h2><p>{memory.fact}</p><p className="memory-cue">{memory.cue}</p>
        </article>}
        {!adventuring && nearby === 'door' && <div className={'door-prompt ' + (unlocked ? 'success' : '')} role="status">
          <strong>{unlocked ? 'Door unlocked — walk through!' : 'Recall gate · Locked'}</strong>
          <p>{unlocked ? 'The green doorway leads to the exit landing.' : 'Press E to answer a question and unlock the door.'}</p>
        </div>}
        <div className={'palace-hint' + (adventuring ? ' adventure-hint' : '')}><strong>WASD</strong> move · <strong>{locked ? 'Mouse' : 'Drag'}</strong> look · {adventuring ? <><strong>Space</strong> jump · <strong>Shift</strong> sprint · <strong>E</strong> interact</> : <><strong>E</strong> at door</>} · <strong>Esc</strong> pause</div>
        {!locked && <button className="palace-relock" onClick={lockMouse}>Resume mouse look</button>}
      </div>}
    </>
  )
}
