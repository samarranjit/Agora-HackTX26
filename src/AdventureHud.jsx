import { PLAYER_MAX_HEARTS } from './game/difficulty.js'
import { MAX_STAMINA } from './playerMotion.js'

export default function AdventureHud({ hearts, stamina, exhausted, nearBridge, respawned, backendStatus, signedIn, forestRun }) {
  return <>
    <div className="adventure-objective"><span className="objective-diamond" aria-hidden="true">◇</span><div><span className="hud-eyebrow">Your journey</span><p>{forestRun ? forestRun.stage === 'castle' ? forestRun.dragonDefeated ? 'The Storykeeper is at peace' : 'Meet the Storykeeper Dragon' : 'Find five lost fairy tales' : 'Explore the palace courtyard'}</p></div></div>
    <div className="adventure-vitals">
      {backendStatus ? <div className="health-row"><span className="hud-eyebrow">Health</span><strong>{backendStatus.health}/{backendStatus.max_health}</strong></div> : !signedIn && <div className="health-row"><span className="hud-eyebrow">{forestRun ? 'Guest hearts' : 'Exploration hearts'}</span><span className="heart-icons" aria-label={`${hearts} of ${PLAYER_MAX_HEARTS} hearts`}>{Array.from({ length: PLAYER_MAX_HEARTS }, (_, i) => <span key={i} className={i < hearts ? '' : 'empty-heart'} aria-hidden="true">♥</span>)}</span></div>}
      <div className="stamina-label"><span>{exhausted ? 'Catch your breath · release Shift' : 'Stamina'}</span><span>{Math.round(stamina)}%</span></div>
      <div className="stamina-track" role="progressbar" aria-label="Stamina" aria-valuemin={0} aria-valuemax={MAX_STAMINA} aria-valuenow={Math.round(stamina)}><div style={{ width: `${stamina}%` }} /></div>
    </div>
    <div className="backend-hud">{forestRun ? <><strong>{forestRun.collectedIds.length} / 5 items · {forestRun.xp} / {forestRun.rules.unlockXp} prototype XP</strong><span>Offline guest · Medium · {forestRun.bridgeState === 'raised' ? 'Castle locked' : forestRun.bridgeState === 'lowering' ? 'Drawbridge lowering…' : 'Castle open'}</span><span>Checkpoint: {forestRun.checkpoint.name}</span></> : backendStatus ? <><strong>{backendStatus.xp} XP · {backendStatus.adventure_completed ? 'Adventure complete' : backendStatus.adventure_unlocked ? 'Adventure unlocked' : 'Adventure locked'}</strong><span>{backendStatus.location} · Menu: practice & study material</span></> : <span>{signedIn ? 'Backend status unavailable · Menu to reconnect' : 'Guest exploration · Menu to sign in and practice'}</span>}</div>
    {nearBridge && <div className="bridge-notice"><span aria-hidden="true">♜</span><div><strong>{forestRun ? 'The Storywood drawbridge' : 'The Crownwater gate'}</strong><p>{forestRun ? forestRun.bridgeState === 'lowered' ? 'The bridge is down. Walk through the arch to enter the castle.' : forestRun.bridgeState === 'lowering' ? 'Stand back while the bridge lowers and the portcullis rises.' : `The entrance is sealed. Earn ${forestRun.rules.unlockXp} prototype XP through completed stories. Press E for details.` : 'The drawbridge is raised. The palace awaits a later chapter.'}</p></div></div>}
    {respawned && <div className="respawn-notice" role="status">Back on safe ground. Your progress is intact.</div>}
  </>
}
