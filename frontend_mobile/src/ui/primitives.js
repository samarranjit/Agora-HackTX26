import { createContext, useContext } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fonts, useScreen } from './theme.js'
import Tap from './Tap.js'

// `compact` buttons are shorter, for footer rows inside single-screen dialogs.
export function Button({ variant = 'secondary', label, onPress, disabled = false, busy = false, full = false, compact = false, accessibilityLabel, children, style }) {
  const { s } = useScreen()
  const primary = variant === 'primary'
  if (variant === 'text') {
    return <Tap accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} disabled={disabled} onPress={onPress} hitSlop={8} style={[{ alignSelf: 'flex-start', paddingVertical: 8, opacity: disabled ? 0.5 : 1 }, style]}>
      {({ pressed }) => <Text className="text-[#e5c9a0] underline" style={{ fontSize: s(13), opacity: pressed ? 0.7 : 1 }}>{label}</Text>}
    </Tap>
  }
  const content = <View className="flex-row items-center justify-center" style={{ gap: s(8) }}>
    {busy && <ActivityIndicator size="small" color={primary ? colors.primaryText : colors.goldSoft} />}
    {children}
    {label != null && <Text numberOfLines={2} className="text-center font-bold" style={{ fontSize: s(compact ? 13 : 14), color: primary ? colors.primaryText : colors.text }}>{label}</Text>}
  </View>
  return <Tap accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [{ marginTop: full ? s(compact ? 8 : 10) : 0, opacity: disabled ? 0.5 : pressed ? 0.82 : 1, transform: [{ scale: pressed && !disabled ? 0.985 : 1 }] }, full && { alignSelf: 'stretch' }, style]}>
    {primary
      ? <LinearGradient colors={[colors.goldLight, colors.goldDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: s(9), minHeight: s(compact ? 38 : 44), paddingHorizontal: s(compact ? 12 : 16), justifyContent: 'center' }}>{content}</LinearGradient>
      : <View className="justify-center border" style={{ borderRadius: s(9), minHeight: s(compact ? 38 : 42), paddingHorizontal: s(compact ? 10 : 14), backgroundColor: colors.moss, borderColor: 'rgba(212,193,138,0.33)' }}>{content}</View>}
  </Tap>
}

export function Kicker({ children, style }) {
  const { s } = useScreen()
  return <Text className="uppercase text-gold" style={[{ fontSize: s(10), letterSpacing: s(2.2), marginBottom: s(6) }, style]}>{children}</Text>
}

export function Title({ children, size = 30, style }) {
  const { s } = useScreen()
  return <Text accessibilityRole="header" className="text-snow" style={[{ fontFamily: fonts.serif, fontSize: s(size), lineHeight: s(size * 1.12), letterSpacing: -0.5, marginBottom: s(10) }, style]}>{children}</Text>
}

export function Body({ children, style, muted = false }) {
  const { s } = useScreen()
  return <Text style={[{ color: muted ? colors.sage : colors.text, fontSize: s(14), lineHeight: s(21) }, style]}>{children}</Text>
}

export function SmallPrint({ children, style }) {
  const { s } = useScreen()
  return <Text className="text-sage" style={[{ fontSize: s(12), lineHeight: s(18), marginTop: s(10) }, style]}>{children}</Text>
}

export function ServerError({ error }) {
  const { s } = useScreen()
  if (!error) return null
  return <View accessibilityRole="alert" className="border" style={{ marginVertical: s(10), padding: s(12), borderRadius: s(9), backgroundColor: colors.error, borderColor: colors.errorBorder }}>
    <Text style={{ color: colors.errorText, fontSize: s(13), lineHeight: s(19) }}>{error.message}</Text>
  </View>
}

export function Divider({ style }) {
  return <View style={[{ height: 1, backgroundColor: colors.borderSoft }, style]} />
}

// Set by containers too narrow for two columns (the guardian side panel).
export const StackedContext = createContext(false)

// Two columns side by side in landscape; stacked on narrow screens or panels. Lets dialog
// content spread across the width instead of scrolling down.
export function Columns({ left, right, ratio = 1, gap = 20, style }) {
  const { s, width } = useScreen()
  const stacked = useContext(StackedContext)
  if (width < 600 || stacked) return <View style={[{ gap: s(10) }, style]}>{left}{right}</View>
  return <View style={[{ flexDirection: 'row', gap: s(gap) }, style]}>
    <View style={{ flex: ratio, minWidth: 0 }}>{left}</View>
    <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
  </View>
}

// Equal-width buttons in one row, used for dialog footers.
export function ActionRow({ children, style }) {
  const { s } = useScreen()
  const items = [children].flat(Infinity).filter(Boolean)
  return <View style={[{ flexDirection: 'row', gap: s(10), marginTop: s(10) }, style]}>
    {items.map((child, index) => <View key={index} style={{ flex: 1 }}>{child}</View>)}
  </View>
}
