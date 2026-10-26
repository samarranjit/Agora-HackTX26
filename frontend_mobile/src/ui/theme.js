import { createContext, useContext, useEffect, useState } from 'react'
import { Keyboard, Platform, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Storywood palette, carried over from the web stylesheets.
export const colors = {
  ink: '#120f0c',
  storywood: '#273d3e',
  card: 'rgba(30,48,50,0.96)',
  panel: 'rgba(25,56,60,0.91)',
  panelSolid: '#19383c',
  moss: 'rgba(32,58,61,0.91)',
  border: 'rgba(210,193,141,0.4)',
  borderSoft: 'rgba(215,195,144,0.27)',
  gold: '#e5bc78',
  goldSoft: '#e8ce95',
  goldBright: '#edcf94',
  goldLight: '#efd2a0',
  goldDeep: '#d9aa61',
  cream: '#f5e7c9',
  text: '#f0e8d9',
  heading: '#fff8ee',
  sage: '#c7d3c6',
  sageLight: '#dbe1d2',
  primaryText: '#302536',
  error: '#542c36',
  errorBorder: '#efae9a',
  errorText: '#ffe5dc',
  focus: '#91d9f5',
  success: '#9aefbe',
  shade: 'rgba(12,18,20,0.84)',
}

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
}

// The measured root view. On edge-to-edge Android the window metrics can exclude the
// hidden navigation-bar area, so the app's own layout size is preferred.
export const ScreenSizeContext = createContext(null)

// Landscape layout metrics. `s` scales a design size by the short screen edge so the
// same layout reads well from small phones (≈360pt tall) to tablets (≈800pt tall).
export function useScreen() {
  const window = useWindowDimensions()
  const measured = useContext(ScreenSizeContext)
  const width = measured?.width || window.width, height = measured?.height || window.height
  const insets = useSafeAreaInsets()
  const short = Math.min(width, height)
  const factor = Math.min(1.4, Math.max(0.82, short / 400))
  const s = (size) => Math.round(size * factor)
  // In landscape the notch sits on a side; keep a comfortable edge on both sides.
  const edge = { left: Math.max(insets.left, 12), right: Math.max(insets.right, 12), top: Math.max(insets.top, 8), bottom: Math.max(insets.bottom, 8) }
  return { width, height, short, factor, s, edge, compact: short < 430, tablet: short >= 600, wide: width >= 720 }
}

// Height of the on-screen keyboard. Edge-to-edge Android no longer resizes the window.
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => setHeight(event.endCoordinates.height))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  return height
}
