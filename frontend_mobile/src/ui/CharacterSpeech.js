import { Platform, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { CloseButton, useBackToClose } from './PalaceDialog.js'
import { Kicker } from './primitives.js'
import { colors, fonts, useKeyboardHeight, useScreen } from './theme.js'

// A speech bubble anchored under the guardian's projected position (percent of screen).
export default function CharacterSpeech({ title, children, onClose, anchor }) {
  const { width, height, s, edge, compact } = useScreen()
  const keyboard = useKeyboardHeight()
  useBackToClose(onClose)
  const x = Number.isFinite(anchor?.x) ? anchor.x : 50
  const y = Number.isFinite(anchor?.y) ? anchor.y : 18
  const cardWidth = Math.min(compact ? 440 : 520, width * 0.56, width - edge.left - edge.right)
  const centerX = x / 100 * width
  const left = Math.min(width - edge.right - cardWidth, Math.max(edge.left, centerX - cardWidth / 2))
  // Leave room for the question; on short screens the bubble rises toward the top bar.
  const top = Math.min(height * 0.24, Math.max(edge.top + s(10), y / 100 * height))
  const bottomInset = Platform.OS === 'android' && keyboard ? keyboard : edge.bottom
  const arrow = Math.min(cardWidth - s(28), Math.max(s(28), centerX - left))
  return <Animated.View entering={FadeIn.duration(180)} className="absolute inset-0" style={{ zIndex: 35, backgroundColor: 'rgba(18,15,12,0.18)' }}>
    <View accessibilityViewIsModal style={{ position: 'absolute', left, top, width: cardWidth, maxHeight: height - top - bottomInset - s(6) }}>
      <View style={{ position: 'absolute', top: -s(11), left: arrow - s(10), width: 0, height: 0, borderLeftWidth: s(10), borderRightWidth: s(10), borderBottomWidth: s(12), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.card }} />
      <View className="border" style={{ flexShrink: 1, borderRadius: s(14), backgroundColor: colors.card, borderColor: colors.border, elevation: 12, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: s(16) }}>
          <View className="flex-row items-center justify-between">
            <Kicker style={{ marginBottom: 0 }}>Challenge</Kicker>
            {onClose && <CloseButton onPress={onClose} />}
          </View>
          <Text accessibilityRole="header" className="text-snow" style={{ fontFamily: fonts.serif, fontSize: s(22), lineHeight: s(26), marginVertical: s(6) }}>{title}</Text>
          {children}
        </ScrollView>
      </View>
    </View>
  </Animated.View>
}
