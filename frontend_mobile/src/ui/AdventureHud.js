import { Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fonts, useScreen } from './theme.js'
import Tap from './Tap.js'

const Eyebrow = ({ children }) => {
  const { s } = useScreen()
  return <Text className="uppercase" style={{ fontSize: s(9), letterSpacing: s(1.5), color: '#e0c799' }}>{children}</Text>
}

// Top-left journey card: objective, XP toward the castle and guardian progress.
export function JourneyPanel({ backendStatus, player, onLeaderboard, top, right = false }) {
  const { s, edge, compact } = useScreen()
  const xp = Number.isFinite(backendStatus?.xp) ? backendStatus.xp : 0
  const unlock = Number.isFinite(player?.rules?.unlock_threshold) ? player.rules.unlock_threshold : 100
  const fill = unlock > 0 ? Math.max(0, Math.min(100, xp / unlock * 100)) : 0
  const defeated = player?.villains?.filter((v) => v.status === 'completed').length || 0
  return <View pointerEvents="box-none" style={{ position: 'absolute', [right ? 'right' : 'left']: right ? edge.right : edge.left, top, width: s(compact ? 236 : 262), zIndex: 12 }}>
    <View pointerEvents="none" className="flex-row items-center" style={{ gap: s(10), paddingVertical: s(8), paddingHorizontal: s(12), borderLeftWidth: 2, borderLeftColor: colors.gold, borderTopRightRadius: s(8), borderBottomRightRadius: s(8), backgroundColor: 'rgba(25,56,60,0.87)' }}>
      <Text style={{ fontSize: s(24), color: colors.gold }}>◇</Text>
      <View className="flex-1">
        <Eyebrow>Your journey</Eyebrow>
        <Text className="text-parchment" style={{ fontSize: s(12), marginTop: 2 }} numberOfLines={2}>{backendStatus?.adventure_completed ? 'The kingdom remembers your victory' : 'Follow the tales through the Storywood'}</Text>
      </View>
    </View>
    {backendStatus && <View className="border" style={{ marginTop: s(8), padding: s(11), borderRadius: s(9), borderColor: 'rgba(215,188,138,0.27)', backgroundColor: 'rgba(25,56,60,0.9)' }}>
      <View pointerEvents="none">
        <View className="flex-row items-center justify-between" style={{ marginBottom: s(6) }}>
          <Eyebrow>XP</Eyebrow>
          <Text className="font-bold text-snow" style={{ fontSize: s(14) }}>{xp}<Text className="text-sage" style={{ fontSize: s(11), fontWeight: '400' }}> / {unlock}</Text></Text>
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel="XP" accessibilityValue={{ min: 0, max: unlock, now: xp }} style={{ height: s(7), borderRadius: s(4), overflow: 'hidden', backgroundColor: '#11282b' }}>
          <LinearGradient colors={['#c9a15a', '#f0d48a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${fill}%`, height: '100%' }} />
        </View>
        <Text className="text-parchment" style={{ fontSize: s(11), marginTop: s(8) }}>{backendStatus.adventure_completed ? 'Dragon defeated' : backendStatus.adventure_unlocked ? 'Castle unlocked' : 'Castle locked'} · {defeated}/{player?.villains?.length || 3} guardians defeated</Text>
        <Text className="text-sage" style={{ fontSize: s(10), marginTop: s(3) }}>Item collection: unavailable</Text>
      </View>
      <Tap accessibilityRole="button" onPress={onLeaderboard} hitSlop={6} style={({ pressed }) => ({ alignSelf: 'flex-start', borderWidth: 1, marginTop: s(8), paddingHorizontal: s(10), paddingVertical: s(5), borderRadius: s(7), backgroundColor: colors.moss, borderColor: 'rgba(212,193,138,0.33)', opacity: pressed ? 0.75 : 1 })}>
        <Text className="font-bold text-parchment" style={{ fontSize: s(11) }}>Leaderboard</Text>
      </Tap>
    </View>}
  </View>
}

export function BridgeNotice({ unlocked, top }) {
  const { s, width } = useScreen()
  const w = Math.min(s(400), width * 0.42)
  return <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} pointerEvents="none" className="absolute flex-row items-center border" style={{ top, left: (width - w) / 2, width: w, gap: s(14), padding: s(14), borderRadius: s(9), borderColor: 'rgba(220,196,147,0.4)', backgroundColor: 'rgba(29,41,59,0.91)', zIndex: 12 }}>
    <Text style={{ fontSize: s(28), color: colors.gold }}>♜</Text>
    <View className="flex-1">
      <Text style={{ fontFamily: fonts.serif, fontSize: s(17), color: '#f5dfb7' }}>The Storywood drawbridge</Text>
      <Text style={{ fontSize: s(11), lineHeight: s(16), marginTop: s(4), color: '#d1d7dc' }}>{unlocked ? 'Follow the bridge into the castle.' : 'Continue your story challenges to open the castle.'}</Text>
    </View>
  </Animated.View>
}

export function RespawnNotice({ top }) {
  const { s, width } = useScreen()
  return <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(250)} pointerEvents="none" accessibilityLiveRegion="polite" className="absolute items-center" style={{ top, left: 0, right: 0, zIndex: 13 }}>
    <View className="border" style={{ maxWidth: width * 0.6, paddingHorizontal: s(18), paddingVertical: s(10), borderRadius: s(7), borderColor: 'rgba(162,204,188,0.4)', backgroundColor: 'rgba(32,62,68,0.91)' }}>
      <Text style={{ fontSize: s(12), color: '#e2f1df' }}>Back on safe ground.</Text>
    </View>
  </Animated.View>
}

// The web "door prompt": what is nearby and what tapping Interact will do. It sits in
// the right-thumb zone so it never covers the joystick.
export function InteractionPrompt({ title, action, onPress }) {
  const { s, width, edge } = useScreen()
  const w = Math.min(s(330), width * 0.3)
  return <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(140)} pointerEvents="box-none" className="absolute" style={{ bottom: edge.bottom + s(14), left: width * 0.42 + s(12), width: w, zIndex: 14 }}>
    <Tap accessibilityRole="button" accessibilityLabel={`${title}. ${action}`} onPress={onPress} style={({ pressed }) => ({ borderWidth: 1, paddingHorizontal: s(16), paddingVertical: s(12), borderRadius: s(12), borderColor: 'rgba(212,193,138,0.6)', backgroundColor: 'rgba(25,56,60,0.95)', opacity: pressed ? 0.85 : 1 })}>
      <Text numberOfLines={1} className="font-bold text-snow" style={{ fontSize: s(15) }}>{title}</Text>
      <Text className="text-parchment" style={{ fontSize: s(12), lineHeight: s(17), marginTop: s(3) }}>{action}</Text>
    </Tap>
  </Animated.View>
}

export function ControlsHint() {
  const { s, width, edge } = useScreen()
  const w = Math.min(s(420), width * 0.4)
  return <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(400)} pointerEvents="none" className="absolute items-center border" style={{ bottom: edge.bottom + s(16), left: (width - w) / 2, width: w, paddingHorizontal: s(12), paddingVertical: s(8), borderRadius: s(9), borderColor: 'rgba(215,188,138,0.15)', backgroundColor: 'rgba(27,41,60,0.85)', zIndex: 11 }}>
    <Text className="text-center" style={{ fontSize: s(11), lineHeight: s(16), color: '#e8dfd1' }}>
      <Text className="font-bold">Left thumb</Text> move · <Text className="font-bold">Right thumb</Text> look · push the stick to its edge to <Text className="font-bold">sprint</Text>
    </Text>
  </Animated.View>
}

export function Crosshair() {
  return <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,248,238,0.8)', zIndex: 9 }} />
}
