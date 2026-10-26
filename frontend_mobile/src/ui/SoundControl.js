import { createContext, useContext } from 'react'
import { Text } from 'react-native'
import { colors, useScreen } from './theme.js'
import Tap from './Tap.js'

export const SoundContext = createContext(null)

export default function SoundControl() {
  const sound = useContext(SoundContext)
  const { s } = useScreen()
  if (!sound) return null
  return <Tap accessibilityRole="switch" accessibilityLabel={sound.muted ? 'Unmute sound' : 'Mute sound'} accessibilityState={{ checked: !sound.muted }} onPress={sound.toggle} hitSlop={6}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', borderWidth: 1, gap: s(6), paddingHorizontal: s(11), paddingVertical: s(8), borderRadius: s(9), backgroundColor: colors.moss, borderColor: 'rgba(212,193,138,0.33)', opacity: pressed ? 0.8 : 1 })}>
    <Text style={{ color: colors.goldSoft, fontSize: s(14) }}>♫</Text>
    <Text className="font-bold" style={{ color: '#e8d9ba', fontSize: s(11) }}>Sound {sound.muted ? 'off' : 'on'}</Text>
  </Tap>
}
