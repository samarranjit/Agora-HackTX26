import { TurboModuleRegistry } from 'react-native'

// Bridges react-native-audio-api to the small Web Audio surface used by storyAudio.js.
// Expo Go does not ship this native module, so sound is silently unavailable there.
export function loadAudioContext() {
  if (!TurboModuleRegistry.get('AudioAPIModule')) return undefined
  let AudioContext
  try { ({ AudioContext } = require('react-native-audio-api')) } catch { return undefined }
  if (typeof AudioContext !== 'function') return undefined
  return function MobileAudioContext() {
    const context = new AudioContext()
    const createBuffer = context.createBuffer.bind(context)
    context.createBuffer = (...args) => {
      const buffer = createBuffer(...args)
      const read = buffer.getChannelData.bind(buffer)
      buffer.getChannelData = (channel) => {
        const data = read(channel)
        if (channel === 0) buffer.pendingChannel = data
        return data
      }
      return buffer
    }
    const adapt = (node) => {
      // Web Audio uses `onended`; this library names the callback `onEnded`.
      Object.defineProperty(node, 'onended', { configurable: true, get: () => node.onEnded, set: (fn) => { node.onEnded = fn || null } })
      const start = node.start.bind(node)
      node.start = (...args) => {
        // Samples written through getChannelData are copied in case the view is not live.
        const buffer = node.buffer
        if (buffer?.pendingChannel) { try { buffer.copyToChannel(buffer.pendingChannel, 0) } catch { /* Already live. */ } buffer.pendingChannel = null }
        return start(...args)
      }
      return node
    }
    const createOscillator = context.createOscillator.bind(context)
    const createBufferSource = context.createBufferSource.bind(context)
    context.createOscillator = () => adapt(createOscillator())
    context.createBufferSource = (...args) => adapt(createBufferSource(...args))
    return context
  }
}
