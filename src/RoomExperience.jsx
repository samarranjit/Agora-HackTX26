import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { createRoomScene, collide, PEDESTALS, ROOM_SIZE, EYE_HEIGHT, MOVE_SPEED, LOOK_SPEED, PITCH_LIMIT } from './roomScene.js'

export default function RoomExperience({ memories, active, unlocked, session, onDoor, onPause, onExit, onDiscover }) {
  const mountRef = useRef(null)
  const canvasRef = useRef(null)
  const playingRef = useRef(false)
  const lockedRef = useRef(false)
  const draggingRef = useRef(false)
  const clearKeysRef = useRef(() => {})
  const propsRef = useRef({})
  const [locked, setLocked] = useState(false)
  const [nearby, setNearby] = useState(null)

  useEffect(() => {
    propsRef.current = { unlocked, onDoor, onPause, onExit, onDiscover }
  }, [unlocked, onDoor, onPause, onExit, onDiscover])

  useEffect(() => {
    playingRef.current = active
    clearKeysRef.current()
    draggingRef.current = false
    if (active) canvasRef.current?.focus()
    else if (document.pointerLockElement === canvasRef.current) document.exitPointerLock()
  }, [active])

  useEffect(() => {
    const mount = mountRef.current
    const { scene, objects, door, doorPivot, doorLight } = createRoomScene(memories)
    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.1, 50)
    camera.rotation.order = 'YXZ'
    camera.position.set(0, EYE_HEIGHT, 3.6)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    const canvas = renderer.domElement
    canvasRef.current = canvas
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', 'Walkable memory room. WASD to move, mouse or drag to look, E at the door, Escape to pause.')
    if (playingRef.current) canvas.focus()

    const keys = { w: false, a: false, s: false, d: false }
    const clearKeys = () => { Object.keys(keys).forEach((key) => { keys[key] = false }) }
    clearKeysRef.current = clearKeys
    let lastTime = performance.now()
    let elapsed = 0
    let frameId = 0
    let lastNearby = null
    let exited = false
    const suspend = (callback) => {
      playingRef.current = false
      clearKeys()
      draggingRef.current = false
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      callback()
    }
    const nearDoor = () => Math.hypot(camera.position.x, camera.position.z - ROOM_SIZE / 2) < 2.3
    const onKeyDown = (event) => {
      if (!playingRef.current || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName) || event.target.isContentEditable) return
      const key = event.key.toLowerCase()
      if (key in keys) { keys[key] = true; event.preventDefault() }
      if (key === 'e' && !event.repeat && nearDoor() && !propsRef.current.unlocked && memories.length) {
        event.preventDefault()
        suspend(propsRef.current.onDoor)
      }
      if (key === 'escape') suspend(propsRef.current.onPause)
    }
    const onKeyUp = (event) => {
      const key = event.key.toLowerCase()
      if (key in keys) keys[key] = false
    }
    const onBlur = () => {
      clearKeys()
      if (playingRef.current) suspend(propsRef.current.onPause)
    }
    const onVisibility = () => { if (document.hidden) onBlur() }
    const onPointerMove = (event) => {
      if (!playingRef.current || (!lockedRef.current && !draggingRef.current)) return
      camera.rotation.y -= event.movementX * LOOK_SPEED
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - event.movementY * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT)
    }
    const onPointerDown = (event) => {
      if (!playingRef.current || event.button !== 0) return
      canvas.focus()
      if (!lockedRef.current) {
        draggingRef.current = true
        canvas.setPointerCapture(event.pointerId)
      }
    }
    const onPointerUp = (event) => {
      draggingRef.current = false
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const onPointerLockChange = () => {
      const wasLocked = lockedRef.current
      lockedRef.current = document.pointerLockElement === canvas
      setLocked(lockedRef.current)
      if (!lockedRef.current) {
        draggingRef.current = false
        clearKeys()
        if (wasLocked && playingRef.current) suspend(propsRef.current.onPause)
      }
    }
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
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      elapsed += dt
      objects.forEach((object, i) => {
        object.rotation.y = Math.sin(elapsed * 0.6 + i) * 0.35
        object.position.y = 1.4 + Math.sin(elapsed * 2 + i) * 0.045
      })
      const isOpen = propsRef.current.unlocked
      doorPivot.rotation.y = THREE.MathUtils.damp(doorPivot.rotation.y, isOpen ? -Math.PI / 2 : 0, 5, dt)
      door.material.color.setHex(isOpen ? 0x3bde95 : 0x7a3e22)
      door.material.emissive.setHex(isOpen ? 0x124d30 : 0x000000)
      doorLight.color.setHex(isOpen ? 0x68ffb2 : 0xfff3d0)
      if (playingRef.current) {
        const inputX = Number(keys.d) - Number(keys.a)
        const inputZ = Number(keys.w) - Number(keys.s)
        if (inputX || inputZ) {
          const length = Math.hypot(inputX, inputZ)
          const nx = inputX / length
          const nz = inputZ / length
          const yaw = camera.rotation.y
          const dx = (nx * Math.cos(yaw) - nz * Math.sin(yaw)) * MOVE_SPEED * dt
          const dz = (-nx * Math.sin(yaw) - nz * Math.cos(yaw)) * MOVE_SPEED * dt
          const next = collide(camera.position.x + dx, camera.position.z + dz, isOpen, camera.position.z)
          camera.position.set(next.x, EYE_HEIGHT, next.z)
        }
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
          suspend(propsRef.current.onExit)
        }
      }
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(tick)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    tick()
    return () => {
      cancelAnimationFrame(frameId)
      resize.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      lockedRef.current = false
      const geometries = new Set()
      const materials = new Set()
      scene.traverse((node) => {
        if (node.geometry) geometries.add(node.geometry)
        if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => materials.add(m))
      })
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      renderer.dispose()
      canvas.remove()
    }
  }, [memories, session])

  const lockMouse = () => {
    const canvas = canvasRef.current
    canvas?.focus()
    try {
      const request = canvas?.requestPointerLock?.()
      request?.catch(() => { lockedRef.current = false; setLocked(false) })
    } catch { lockedRef.current = false; setLocked(false) }
  }
  const memory = memories.find((item) => item.id === nearby)
  return (
    <>
      <div className="palace-stage" ref={mountRef} />
      {active && <div className="palace-hud">
        <div className="palace-crosshair" aria-hidden="true" />
        {memory && <article className="memory-label" aria-live="polite">
          <span className="palace-kicker">Memory {memories.indexOf(memory) + 1} / 3</span>
          <h2>{memory.title}</h2><p>{memory.fact}</p><p className="memory-cue">{memory.cue}</p>
        </article>}
        {nearby === 'door' && <div className={'door-prompt ' + (unlocked ? 'success' : '')} role="status">
          <strong>{unlocked ? 'Door unlocked — walk through!' : 'Recall gate · Locked'}</strong>
          <p>{unlocked ? 'The green doorway leads to the exit landing.' : 'Press E to answer a question and unlock the door.'}</p>
        </div>}
        <div className="palace-hint"><strong>WASD</strong> move · <strong>{locked ? 'Mouse' : 'Drag'}</strong> look · <strong>E</strong> at door · <strong>Esc</strong> pause</div>
        {!locked && <button className="palace-relock" onClick={lockMouse}>Lock mouse</button>}
      </div>}
    </>
  )
}
