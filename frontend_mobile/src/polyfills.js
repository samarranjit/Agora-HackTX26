// Browser APIs the shared web modules expect, provided for React Native/Hermes.
import 'react-native-url-polyfill/auto'
import { randomUUID } from 'expo-crypto'

if (!globalThis.crypto) globalThis.crypto = {}
if (typeof globalThis.crypto.randomUUID !== 'function') globalThis.crypto.randomUUID = randomUUID

if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), ms)
    return controller.signal
  }
}
if (typeof AbortSignal.any !== 'function') {
  AbortSignal.any = (signals) => {
    const controller = new AbortController()
    for (const signal of signals) {
      if (signal.aborted) { controller.abort(); break }
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    return controller.signal
  }
}
