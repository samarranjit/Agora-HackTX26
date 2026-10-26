import { useState } from 'react'
import { Pressable } from 'react-native'

// Pressable with a resolved style. NativeWind's JSX transform drops Pressable's
// function-form `style`, so pressed state is tracked here and passed as a plain style.
export default function Tap({ style, children, onPressIn, onPressOut, ...props }) {
  const [pressed, setPressed] = useState(false)
  return <Pressable {...props}
    onPressIn={(event) => { setPressed(true); onPressIn?.(event) }}
    onPressOut={(event) => { setPressed(false); onPressOut?.(event) }}
    style={typeof style === 'function' ? style({ pressed }) : style}>
    {typeof children === 'function' ? children({ pressed }) : children}
  </Pressable>
}
