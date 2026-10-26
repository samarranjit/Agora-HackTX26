import { ActivityIndicator, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fonts, useScreen } from './theme.js'
import Tap from './Tap.js'

export function Button({ variant = 'secondary', label, onPress, disabled = false, busy = false, full = false, accessibilityLabel, children, style }) {
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
    {label != null && <Text numberOfLines={2} className="text-center font-bold" style={{ fontSize: s(14), color: primary ? colors.primaryText : colors.text }}>{label}</Text>}
  </View>
  return <Tap accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [{ marginTop: full ? s(10) : 0, opacity: disabled ? 0.5 : pressed ? 0.82 : 1, transform: [{ scale: pressed && !disabled ? 0.985 : 1 }] }, full && { alignSelf: 'stretch' }, style]}>
    {primary
      ? <LinearGradient colors={[colors.goldLight, colors.goldDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: s(9), minHeight: s(46), paddingHorizontal: s(16), justifyContent: 'center' }}>{content}</LinearGradient>
      : <View className="justify-center border" style={{ borderRadius: s(9), minHeight: s(44), paddingHorizontal: s(14), backgroundColor: colors.moss, borderColor: 'rgba(212,193,138,0.33)' }}>{content}</View>}
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
