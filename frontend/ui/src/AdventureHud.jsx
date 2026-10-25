import { PLAYER_MAX_HEARTS } from './game/difficulty.js'
import { MAX_STAMINA } from './playerMotion.js'

export default function AdventureHud({ hearts, stamina, exhausted, nearBridge, respawned }) {
  return <>
    <div className="adventure-objective"><span className="objective-diamond" aria-hidden="true">◇</span><div><span className="hud-eyebrow">Your journey</span><p>Explore the palace courtyard</p></div></div>
    <div className="adventure-vitals">
      <div className="health-row"><span className="hud-eyebrow">Vitality</span><span className="heart-icons" aria-label={`${hearts} of ${PLAYER_MAX_HEARTS} hearts`}>{Array.from({ length: PLAYER_MAX_HEARTS }, (_, i) => <span key={i} className={i < hearts ? '' : 'empty-heart'} aria-hidden="true">♥</span>)}</span></div>
      <div className="stamina-label"><span>{exhausted ? 'Catch your breath · release Shift' : 'Stamina'}</span><span>{Math.round(stamina)}%</span></div>
      <div className="stamina-track" role="progressbar" aria-label="Stamina" aria-valuemin={0} aria-valuemax={MAX_STAMINA} aria-valuenow={Math.round(stamina)}><div style={{ width: `${stamina}%` }} /></div>
    </div>
    {nearBridge && <div className="bridge-notice"><span aria-hidden="true">♜</span><div><strong>The Crownwater gate</strong><p>The drawbridge is raised. The palace awaits a later chapter.</p></div></div>}
    {respawned && <div className="respawn-notice" role="status">Back on safe ground. Your progress is intact.</div>}
  </>
}
