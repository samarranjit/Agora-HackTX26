import { Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fonts, useScreen } from './theme.js'
import Tap from './Tap.js'

const Eyebrow = ({ children }) => {
  const { s } = useScreen()
  return <Text className="uppercase" style={{ fontSize: s(9), letterSpacing: s(1.5), color: '#e0c799' }}>{children}</Text>
}

function progress(backendStatus, player) {
  const xp = Number.isFinite(backendStatus?.xp) ? backendStatus.xp : 0
  const unlock = Number.isFinite(player?.rules?.unlock_threshold) ? player.rules.unlock_threshold : 100
  const fill = unlock > 0 ? Math.max(0, Math.min(100, xp / unlock * 100)) : 0
  const defeated = player?.villains?.filter((v) => v.status === 'completed').length || 0
  return { xp, unlock, fill, defeated, total: player?.villains?.length || 3 }
}

function XpBar({ fill, xp, unlock, width, height }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="XP" accessibilityValue={{ min: 0, max: unlock, now: xp }} style={{ width, height, borderRadius: height, overflow: 'hidden', backgroundColor: '#11282b' }}>
    <LinearGradient colors={['#c9a15a', '#f0d48a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${fill}%`, height: '100%' }} />
  </View>
}

// One compact pill in the top-left corner: XP toward the castle and guardians defeated.
// Tapping it opens the leaderboard, like the web HUD's button.
export function StatusPill({ backendStatus, player, onPress }) {
  const { s } = useScreen()
  if (!backendStatus) return <View />
  const { xp, unlock, fill, defeated, total } = progress(backendStatus, player)
  return <Tap accessibilityRole="button" accessibilityLabel={`XP ${xp} of ${unlock}. ${defeated} of ${total} guardians defeated. Open leaderboard.`} onPress={onPress} hitSlop={6}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: s(8), height: s(32), paddingHorizontal: s(12), borderRadius: s(16), borderWidth: 1, borderColor: 'rgba(215,188,138,0.28)', backgroundColor: 'rgba(25,40,48,0.62)', opacity: pressed ? 0.75 : 1 })}>
    <Text style={{ fontSize: s(13), color: colors.gold }}>◇</Text>
    <Text className="font-bold text-snow" style={{ fontSize: s(12) }}>{xp}<Text className="text-sage" style={{ fontSize: s(10), fontWeight: '400' }}>/{unlock} XP</Text></Text>
    <XpBar fill={fill} xp={xp} unlock={unlock} width={s(64)} height={s(5)} />
    <View style={{ width: 1, height: s(14), backgroundColor: 'rgba(215,188,138,0.3)' }} />
    <Text className="text-parchment" style={{ fontSize: s(12) }}>⚔ {defeated}/{total}</Text>
  </Tap>
}

// The full journey status, shown in the pause menu instead of covering the scene.
export function JourneySummary({ backendStatus, player }) {
  const { s } = useScreen()
  const { xp, unlock, fill, defeated, total } = progress(backendStatus, player)
  return <View className="border" style={{ padding: s(10), borderRadius: s(9), borderColor: 'rgba(215,188,138,0.27)', backgroundColor: 'rgba(25,56,60,0.6)', gap: s(6) }}>
    <View className="flex-row items-center" style={{ gap: s(8) }}>
      <Text style={{ fontSize: s(16), color: colors.gold }}>◇</Text>
      <Text className="flex-1 text-parchment" style={{ fontSize: s(13) }}>{backendStatus?.adventure_completed ? 'The kingdom remembers your victory' : 'Follow the tales through the Storywood'}</Text>
    </View>
    <View className="flex-row items-center" style={{ gap: s(10) }}>
      <Eyebrow>XP</Eyebrow>
      <View style={{ flex: 1 }}><XpBar fill={fill} xp={xp} unlock={unlock} width="100%" height={s(6)} /></View>
      <Text className="font-bold text-snow" style={{ fontSize: s(12) }}>{xp} / {unlock}</Text>
    </View>
    <Text className="text-sage" style={{ fontSize: s(11) }}>{backendStatus?.adventure_completed ? 'Dragon defeated' : backendStatus?.adventure_unlocked ? 'Castle unlocked' : 'Castle locked'} · {defeated}/{total} guardians defeated · Item collection: unavailable</Text>
  </View>
}

export function BridgeNotice({ unlocked, top }) {
  const { s, width } = useScreen()
  const w = Math.min(s(330), width * 0.36)
  return <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} pointerEvents="none" className="absolute flex-row items-center border" style={{ top, left: (width - w) / 2, width: w, gap: s(10), paddingVertical: s(8), paddingHorizontal: s(12), borderRadius: s(9), borderColor: 'rgba(220,196,147,0.4)', backgroundColor: 'rgba(29,41,59,0.91)', zIndex: 12 }}>
    <Text style={{ fontSize: s(20), color: colors.gold }}>♜</Text>
    <View className="flex-1">
      <Text style={{ fontFamily: fonts.serif, fontSize: s(14), color: '#f5dfb7' }}>The Storywood drawbridge</Text>
      <Text style={{ fontSize: s(10), lineHeight: s(14), marginTop: s(2), color: '#d1d7dc' }}>{unlocked ? 'Follow the bridge into the castle.' : 'Continue your story challenges to open the castle.'}</Text>
    </View>
  </Animated.View>
}

export function RespawnNotice({ top }) {
  const { s, width } = useScreen()
  return <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(250)} pointerEvents="none" accessibilityLiveRegion="polite" className="absolute items-center" style={{ top, left: 0, right: 0, zIndex: 13 }}>
    <View className="border" style={{ maxWidth: width * 0.6, paddingHorizontal: s(14), paddingVertical: s(6), borderRadius: s(7), borderColor: 'rgba(162,204,188,0.4)', backgroundColor: 'rgba(32,62,68,0.91)' }}>
      <Text style={{ fontSize: s(12), color: '#e2f1df' }}>Back on safe ground.</Text>
    </View>
  </Animated.View>
}

// The web "door prompt": what is nearby and what tapping Interact will do. It sits in
// the right-thumb zone so it never covers the joystick.
export function InteractionPrompt({ title, action, onPress }) {
  const { s, width, edge } = useScreen()
  const w = Math.min(s(280), width * 0.27)
  return <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(140)} pointerEvents="box-none" className="absolute" style={{ bottom: edge.bottom + s(14), left: width * 0.42 + s(12), width: w, zIndex: 14 }}>
    <Tap accessibilityRole="button" accessibilityLabel={`${title}. ${action}`} onPress={onPress} style={({ pressed }) => ({ borderWidth: 1, paddingHorizontal: s(12), paddingVertical: s(7), borderRadius: s(10), borderColor: 'rgba(212,193,138,0.6)', backgroundColor: 'rgba(25,56,60,0.95)', opacity: pressed ? 0.85 : 1 })}>
      <Text numberOfLines={1} className="font-bold text-snow" style={{ fontSize: s(13) }}>{title}</Text>
      <Text className="text-parchment" numberOfLines={1} style={{ fontSize: s(11), lineHeight: s(15), marginTop: s(1) }}>{action}</Text>
    </Tap>
  </Animated.View>
}

export function ControlsHint() {
  const { s, width, edge } = useScreen()
  const w = Math.min(s(340), width * 0.34)
  return <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(400)} pointerEvents="none" className="absolute items-center border" style={{ bottom: edge.bottom + s(12), left: (width - w) / 2, width: w, paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(9), borderColor: 'rgba(215,188,138,0.15)', backgroundColor: 'rgba(27,41,60,0.85)', zIndex: 11 }}>
    <Text className="text-center" style={{ fontSize: s(10), lineHeight: s(14), color: '#e8dfd1' }}>
      <Text className="font-bold">Left thumb</Text> move · <Text className="font-bold">Right thumb</Text> look · push the stick to its edge to <Text className="font-bold">sprint</Text>
    </Text>
  </Animated.View>
}

export function Crosshair() {
  return <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,248,238,0.8)', zIndex: 9 }} />
}
