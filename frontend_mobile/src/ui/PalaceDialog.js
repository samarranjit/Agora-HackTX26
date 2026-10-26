import { useEffect, useRef } from 'react'
import { BackHandler, Platform, ScrollView, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import SoundControl from './SoundControl.js'
import { Kicker, Title } from './primitives.js'
import { colors, useKeyboardHeight, useScreen } from './theme.js'
import Tap from './Tap.js'

export function CloseButton({ onPress }) {
  const { s } = useScreen()
  return <Tap accessibilityRole="button" accessibilityLabel="Close and return to exploration" onPress={onPress} hitSlop={10}
    style={({ pressed }) => ({ width: s(34), height: s(34), borderRadius: s(9), alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)' })}>
    <Text style={{ color: colors.text, fontSize: s(16) }}>✕</Text>
  </Tap>
}

// Android's back gesture closes the topmost dialog, like Escape on the web.
export function useBackToClose(onClose) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!closeRef.current) return false
      closeRef.current()
      return true
    })
    return () => sub.remove()
  }, [])
}

export default function PalaceDialog({ title, children, onClose, wide = false, kicker, tools = true, titleSize }) {
  const { width, s, edge, compact } = useScreen()
  const keyboard = useKeyboardHeight()
  useBackToClose(onClose)
  const cardWidth = Math.min(wide ? 860 : 600, width - edge.left - edge.right, Math.max(wide ? width * 0.8 : width * 0.58, 380))
  return <Animated.View entering={FadeIn.duration(160)} className="absolute inset-0" style={{ zIndex: 30 }}>
    <LinearGradient pointerEvents="none" colors={['rgba(20,45,48,0.95)', 'rgba(29,51,56,0.71)', 'rgba(29,51,56,0.14)', 'transparent']} locations={[0, 0.4, 0.76, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', inset: 0 }} />
    <View style={{ flex: 1, justifyContent: 'center', paddingLeft: edge.left + (compact ? 4 : s(24)), paddingRight: edge.right, paddingTop: edge.top + s(6), paddingBottom: Platform.OS === 'android' && keyboard ? keyboard + s(6) : edge.bottom + s(6) }}>
      <Animated.View entering={FadeInDown.duration(200)} accessibilityViewIsModal className="border" style={{ width: cardWidth, maxHeight: '100%', borderRadius: s(14), backgroundColor: colors.card, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 }}>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator contentContainerStyle={{ padding: compact ? s(18) : s(24) }}>
          <View className="flex-row items-center justify-between" style={{ gap: s(10) }}>
            <Kicker style={{ flexShrink: 1, marginBottom: 0 }}>{kicker || 'Memory Palace'}</Kicker>
            <View className="flex-row items-center" style={{ gap: s(8) }}>{tools && <SoundControl />}{onClose && <CloseButton onPress={onClose} />}</View>
          </View>
          <Title size={titleSize || (compact ? 26 : 30)} style={{ marginTop: s(10) }}>{title}</Title>
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  </Animated.View>
}
