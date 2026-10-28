import { Platform, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { CloseButton, useBackToClose } from './PalaceDialog.js'
import { Kicker, StackedContext } from './primitives.js'
import { colors, fonts, useKeyboardHeight, useScreen } from './theme.js'

// The guardian's challenge, shown as a side panel on the half of the screen away from the
// guardian so it stays in view. The pointer faces the guardian's projected position
// (percent of screen). Content stacks into one column to fit the panel's height.
export default function CharacterSpeech({ title, children, onClose, anchor }) {
  const { width, height, s, edge, compact } = useScreen()
  const keyboard = useKeyboardHeight()
  useBackToClose(onClose)
  const x = Number.isFinite(anchor?.x) ? anchor.x : 50
  const y = Number.isFinite(anchor?.y) ? anchor.y : 18
  const cardWidth = Math.min(560, Math.max(width * 0.44, 340), width - edge.left - edge.right)
  const onRight = x <= 50
  const left = onRight ? width - edge.right - cardWidth : edge.left
  const top = edge.top + s(4)
  const bottomInset = Platform.OS === 'android' && keyboard ? keyboard : edge.bottom
  const maxHeight = height - top - bottomInset - s(4)
  const arrowY = Math.min(maxHeight * 0.5, Math.max(s(30), y / 100 * height - top + s(30)))
  const arrow = s(11)
  return <Animated.View entering={FadeIn.duration(180)} className="absolute inset-0" style={{ zIndex: 35 }}>
    <View accessibilityViewIsModal style={{ position: 'absolute', left, top, width: cardWidth, maxHeight }}>
      <View style={{ position: 'absolute', top: arrowY - arrow, [onRight ? 'left' : 'right']: -arrow + 1, width: 0, height: 0, borderTopWidth: arrow, borderBottomWidth: arrow, borderTopColor: 'transparent', borderBottomColor: 'transparent', [onRight ? 'borderRightWidth' : 'borderLeftWidth']: arrow, [onRight ? 'borderRightColor' : 'borderLeftColor']: colors.card }} />
      <View className="border" style={{ flexShrink: 1, borderRadius: s(14), backgroundColor: colors.card, borderColor: colors.border, elevation: 12, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: s(compact ? 14 : 18), paddingTop: s(compact ? 10 : 14) }}>
          <View className="flex-row items-start justify-between" style={{ gap: s(10), marginBottom: s(6) }}>
            <View style={{ flexShrink: 1 }}>
              <Kicker style={{ marginBottom: s(2) }}>Challenge</Kicker>
              <Text accessibilityRole="header" className="text-snow" style={{ fontFamily: fonts.serif, fontSize: s(21), lineHeight: s(25) }}>{title}</Text>
            </View>
            {onClose && <CloseButton onPress={onClose} />}
          </View>
          <StackedContext.Provider value={true}>{children}</StackedContext.Provider>
        </ScrollView>
      </View>
    </View>
  </Animated.View>
}
