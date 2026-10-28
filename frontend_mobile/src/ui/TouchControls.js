import { useEffect, useMemo, useRef } from 'react'
import { Text, View } from 'react-native'
import { GestureDetector, usePanGesture, useTapGesture } from 'react-native-gesture-handler'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { SPRINT_THRESHOLD } from '../touchControls.js'
import { colors, useScreen } from './theme.js'

// Left thumb: a floating analog stick that re-centres wherever the thumb lands.
// Right thumb: drag anywhere to look. Action buttons sit under the right thumb.
export default function TouchControls({ controls, nearby, onInteract, interactLabel, topInset }) {
  const { width, height, s, edge } = useScreen()
  const radius = s(50), knob = s(22)
  const split = width * 0.42
  const zoneTop = topInset
  const zoneHeight = height - zoneTop
  const rest = useMemo(() => ({ x: edge.left + radius + s(22), y: zoneHeight - edge.bottom - radius - s(14) }), [edge.left, edge.bottom, radius, zoneHeight, s])

  const baseX = useSharedValue(rest.x), baseY = useSharedValue(rest.y)
  const knobX = useSharedValue(0), knobY = useSharedValue(0)
  const engaged = useSharedValue(0), sprint = useSharedValue(0)
  // The JS thread keeps its own copy of the base so updates never read shared values back.
  const base = useRef(rest)
  useEffect(() => { base.current = rest; baseX.value = rest.x; baseY.value = rest.y }, [rest, baseX, baseY])

  const clampBase = (x, y) => ({
    x: Math.min(split - radius - s(6), Math.max(edge.left + radius, x)),
    y: Math.min(zoneHeight - edge.bottom - radius, Math.max(radius + s(6), y)),
  })
  const releaseStick = () => {
    controls.current?.releaseStick()
    engaged.value = withTiming(0, { duration: 160 })
    sprint.value = 0
    knobX.value = withSpring(0, { damping: 16 }); knobY.value = withSpring(0, { damping: 16 })
    base.current = rest
    baseX.value = withTiming(rest.x, { duration: 220 }); baseY.value = withTiming(rest.y, { duration: 220 })
  }
  const move = usePanGesture({
    runOnJS: true, minDistance: 0, shouldCancelWhenOutside: false,
    onBegin: (e) => {
      base.current = clampBase(e.x, e.y)
      cancelAnimation(baseX); cancelAnimation(baseY)
      baseX.value = base.current.x; baseY.value = base.current.y
      knobX.value = 0; knobY.value = 0
      engaged.value = withTiming(1, { duration: 90 })
    },
    onUpdate: (e) => {
      let dx = e.x - base.current.x, dy = e.y - base.current.y
      const length = Math.hypot(dx, dy)
      if (length > radius) { dx = dx / length * radius; dy = dy / length * radius }
      knobX.value = dx; knobY.value = dy
      const magnitude = Math.min(1, length / radius)
      sprint.value = magnitude >= SPRINT_THRESHOLD ? 1 : 0
      // A small dead zone keeps a resting thumb from drifting the player.
      const live = magnitude < 0.12 ? 0 : (magnitude - 0.12) / 0.88
      const scale = length ? live / magnitude : 0
      controls.current?.setStick(dx / radius * scale, -dy / radius * scale)
    },
    onFinalize: releaseStick,
  })

  const sensitivity = Math.PI / Math.max(320, width * 0.62)
  const look = usePanGesture({
    runOnJS: true, minDistance: 0, shouldCancelWhenOutside: false, simultaneousWith: move,
    onUpdate: (e) => controls.current?.look(e.changeX * sensitivity, e.changeY * sensitivity * 0.85),
  })

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: baseX.value - radius }, { translateY: baseY.value - radius }],
    // Faint at rest so the scene stays clear; solid while the thumb is down.
    opacity: 0.38 + engaged.value * 0.62,
    borderColor: sprint.value ? colors.goldBright : 'rgba(229,188,120,0.55)',
    borderWidth: sprint.value ? 2.5 : 1.5,
  }))
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knobX.value }, { translateY: knobY.value }, { scale: 1 + engaged.value * 0.08 }] }))
  const sprintStyle = useAnimatedStyle(() => ({ opacity: withTiming(sprint.value, { duration: 120 }) }))

  return <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: zoneTop, bottom: 0, zIndex: 10 }}>
    <GestureDetector gesture={look}>
      <View accessibilityLabel="Look area. Drag with your right thumb to look around." style={{ position: 'absolute', left: split, right: 0, top: 0, bottom: 0 }} />
    </GestureDetector>
    <GestureDetector gesture={move}>
      <View accessibilityLabel="Movement joystick. Drag with your left thumb to walk; push to the edge to sprint." style={{ position: 'absolute', left: 0, width: split, top: 0, bottom: 0 }}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: radius * 2, height: radius * 2, borderRadius: radius, backgroundColor: 'rgba(25,56,60,0.32)', alignItems: 'center', justifyContent: 'center' }, ringStyle]}>
          <View style={{ position: 'absolute', width: radius * 1.2, height: radius * 1.2, borderRadius: radius * 0.6, borderWidth: 1, borderColor: 'rgba(229,188,120,0.18)' }} />
          <Animated.View style={[{ width: knob * 2, height: knob * 2, borderRadius: knob, backgroundColor: 'rgba(239,210,160,0.9)', borderWidth: 2, borderColor: '#fff3d6', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, elevation: 6 }, knobStyle]} />
          <Animated.Text style={[{ position: 'absolute', top: -s(24), color: colors.goldBright, fontSize: s(11), fontWeight: '700', letterSpacing: 1.5 }, sprintStyle]}>SPRINT</Animated.Text>
        </Animated.View>
      </View>
    </GestureDetector>
    <ActionButtons controls={controls} nearby={nearby} onInteract={onInteract} interactLabel={interactLabel} simultaneousWith={[move, look]} />
  </View>
}

function RoundButton({ gesture, size, label, glyph, highlight, pressed, accessibilityLabel }) {
  const { s } = useScreen()
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - pressed.value * 0.08 }], opacity: 0.88 + pressed.value * 0.12 }))
  return <GestureDetector gesture={gesture}>
    <Animated.View accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: highlight ? 'rgba(229,188,120,0.9)' : 'rgba(25,56,60,0.55)', borderWidth: 1.5, borderColor: highlight ? '#fff0cf' : 'rgba(229,188,120,0.6)', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }, style]}>
      <Text style={{ fontSize: size * 0.34, color: highlight ? colors.primaryText : colors.goldBright }}>{glyph}</Text>
      {label && <Text numberOfLines={1} style={{ fontSize: s(10), fontWeight: '800', letterSpacing: 0.6, color: highlight ? colors.primaryText : colors.text, marginTop: -2 }}>{label}</Text>}
    </Animated.View>
  </GestureDetector>
}

function ActionButtons({ controls, nearby, onInteract, interactLabel, simultaneousWith }) {
  const { s, edge } = useScreen()
  const jumpPressed = useSharedValue(0), interactPressed = useSharedValue(0)
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (nearby) pulse.value = withRepeat(withSequence(withTiming(1.07, { duration: 650 }), withTiming(1, { duration: 650 })), -1)
    else { cancelAnimation(pulse); pulse.value = 1 }
  }, [nearby, pulse])
  const jump = useTapGesture({
    runOnJS: true, maxDuration: 100000, maxDistance: 1000, simultaneousWith,
    onBegin: () => { jumpPressed.value = withTiming(1, { duration: 60 }); controls.current?.jump() },
    onFinalize: () => { jumpPressed.value = withTiming(0, { duration: 120 }) },
  })
  const interact = useTapGesture({
    runOnJS: true, maxDuration: 2000, simultaneousWith,
    onBegin: () => { interactPressed.value = withTiming(1, { duration: 60 }) },
    onActivate: () => onInteract(),
    onFinalize: () => { interactPressed.value = withTiming(0, { duration: 120 }) },
  })
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))
  const jumpSize = s(64), interactSize = s(58)
  return <View pointerEvents="box-none" style={{ position: 'absolute', right: edge.right + s(14), bottom: edge.bottom + s(12), alignItems: 'flex-end' }}>
    {nearby && <Animated.View style={[{ marginBottom: s(10), marginRight: jumpSize * 0.62 }, pulseStyle]}>
      <RoundButton gesture={interact} size={interactSize} glyph="✦" label={interactLabel} highlight pressed={interactPressed} accessibilityLabel={`Interact: ${interactLabel}`} />
    </Animated.View>}
    <RoundButton gesture={jump} size={jumpSize} glyph="⤒" label="JUMP" pressed={jumpPressed} accessibilityLabel="Jump" />
  </View>
}
