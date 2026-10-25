// Small synthesized palette. The factory itself never creates an AudioContext.
export function createStoryAudio({ Context = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let context = null, master = null, ambience = null, wind = null, drone = null, filter = null
  let noise = null, muted = false, active = false, hidden = false, environment = 'forest', disposed = false
  let failed = false
  const voices = new Set(), lastPlayed = new Map()
  const cooldown = { footstep: 0.28, approach: 1.2, interact: 0.25, correct: 0.2, incorrect: 0.3, heart: 0.35, collect: 0.5, bridge: 3, dragon: 2, victory: 1 }
  const mix = () => {
    if (!context || disposed) return
    master.gain.setTargetAtTime(muted || hidden ? 0 : 0.22, context.currentTime, 0.035)
    ambience.gain.setTargetAtTime(active && !hidden ? 1 : 0, context.currentTime, 0.3)
    filter.frequency.setTargetAtTime(environment === 'castle' ? 260 : 650, context.currentTime, 0.4)
    drone.frequency.setTargetAtTime(environment === 'castle' ? 82.4 : 196, context.currentTime, 0.4)
  }
  function release(voice) {
    if (!voices.delete(voice)) return
    voice.source.onended = null
    voice.source.disconnect(); voice.gain.disconnect(); voice.filter?.disconnect()
  }
  function stopEffects() {
    for (const voice of [...voices]) { try { voice.source.stop() } catch { /* Already ended. */ } release(voice) }
    lastPlayed.clear()
  }
  function dispose() {
    if (disposed) return
    disposed = true
    stopEffects()
    for (const source of [wind, drone]) { try { source?.stop() } catch { /* Not started. */ } source?.disconnect() }
    filter?.disconnect(); ambience?.disconnect(); master?.disconnect()
    // Includes all ambience branch gains and nodes, even after a partial initialization failure.
    ambienceNodes.forEach((node) => node.disconnect())
    if (context && context.state !== 'closed') { try { context.close()?.catch(() => {}) } catch { /* Audio is optional. */ } }
  }
  const ambienceNodes = []
  function initialize() {
    if (context || !Context || failed || disposed) return
    try {
      context = new Context()
      master = context.createGain(); master.gain.value = 0; master.connect(context.destination)
      ambience = context.createGain(); ambience.gain.value = 0; ambience.connect(master)
      noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
      const samples = noise.getChannelData(0)
      let seed = 173
      for (let i = 0; i < samples.length; i++) { seed = (seed * 16807) % 2147483647; samples[i] = seed / 1073741824 - 1 }
      filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650
      const windGain = context.createGain(); windGain.gain.value = 0.018; ambienceNodes.push(windGain)
      wind = context.createBufferSource(); wind.buffer = noise; wind.loop = true; wind.connect(filter); filter.connect(windGain); windGain.connect(ambience); wind.start()
      const droneGain = context.createGain(); droneGain.gain.value = 0.008; ambienceNodes.push(droneGain)
      drone = context.createOscillator(); drone.type = 'sine'; drone.frequency.value = 196; drone.connect(droneGain); droneGain.connect(ambience); drone.start()
      mix()
    } catch { failed = true; dispose() }
  }
  function voice(frequency, duration, volume, delay = 0, type = 'sine', endFrequency) {
    if (voices.size >= 16) return
    const source = frequency ? context.createOscillator() : context.createBufferSource()
    const gain = context.createGain(), start = context.currentTime + delay
    const entry = { source, gain, filter: null }
    if (frequency) { source.type = type; source.frequency.setValueAtTime(frequency, start); if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration) }
    else { source.buffer = noise; const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 480; entry.filter = lowpass; source.connect(lowpass); lowpass.connect(gain) }
    if (frequency) source.connect(gain)
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    gain.connect(master); source.onended = () => release(entry); voices.add(entry)
    source.start(start); source.stop(start + duration + 0.025)
  }
  return {
    unlock(event) {
      if (!event?.isTrusted || disposed || failed) return false
      initialize()
      if (!context || disposed) return false
      if (context.state === 'suspended') { try { context.resume()?.catch(() => {}) } catch { return false } }
      return true
    },
    setMuted(value) { muted = !!value; mix() },
    setActive(value) { active = !!value; mix() },
    setHidden(value) { hidden = !!value; mix() },
    setEnvironment(value) { environment = value; mix() },
    play(kind) {
      if (!context || disposed || muted || hidden || context.state !== 'running') return false
      if ((kind === 'footstep' || kind === 'approach') && !active) return false
      const now = context.currentTime
      if (now - (lastPlayed.get(kind) ?? -Infinity) < (cooldown[kind] ?? 0.25)) return false
      lastPlayed.set(kind, now)
      try {
        switch (kind) {
          case 'footstep': voice(0, 0.095, 0.15); voice(90, 0.085, 0.065); break
          case 'approach': voice(1046.5, 0.18, 0.035); break
          case 'interact': voice(523.25, 0.17, 0.07); voice(784, 0.22, 0.045, 0.06); break
          case 'correct': voice(659.25, 0.2, 0.09); voice(987.77, 0.32, 0.07, 0.08); break
          case 'incorrect': voice(220, 0.22, 0.08, 0, 'sine', 164.8); break
          case 'heart': voice(110, 0.2, 0.085, 0.14, 'sine', 73.4); break
          case 'collect': [523.25, 659.25, 784, 1046.5].forEach((f, i) => voice(f, 0.48, 0.065, i * 0.07)); break
          case 'bridge': voice(55, 1.9, 0.07, 0, 'triangle', 41.2); voice(82.4, 1.6, 0.045, 0.1, 'sine', 55); break
          case 'dragon': voice(146.8, 0.7, 0.08, 0, 'triangle', 65.4); voice(98, 0.8, 0.045, 0.1); break
          case 'wolf': voice(196, 0.6, 0.07, 0, 'sine', 294); voice(146.8, 0.45, 0.03, 0.15); break
          case 'victory': [392, 523.25, 659.25, 784].forEach((f, i) => voice(f, 0.75, 0.07, i * 0.1)); break
          default: return false
        }
        return true
      } catch { return false }
    },
    stopEffects, dispose,
  }
}
