import { useContext } from 'react'
import { SoundContext } from './audio/soundContext.js'

export default function SoundControl() {
  const sound = useContext(SoundContext)
  if (!sound) return null
  return <button type="button" className="secondary sound-control" aria-label={sound.muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={sound.muted} onClick={sound.toggle}><span aria-hidden="true">♫</span> Sound {sound.muted ? 'off' : 'on'}</button>
}
