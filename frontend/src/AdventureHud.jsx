import { MAX_STAMINA } from './playerMotion.js'

export default function AdventureHud({ stamina, exhausted, nearBridge, respawned, backendStatus, player, onLeaderboard }) {
  return <>
    <div className="adventure-objective"><span className="objective-diamond" aria-hidden="true">◇</span><div><span className="hud-eyebrow">Your journey</span><p>{backendStatus?.adventure_completed ? 'The kingdom remembers your victory' : 'Follow the tales through the Storywood'}</p></div></div>
    <div className="adventure-vitals">
      {backendStatus && <><div className="health-row"><span className="hud-eyebrow">Health</span><strong>{backendStatus.health}/{backendStatus.max_health}</strong></div>
        <div className="health-track" role="progressbar" aria-label="Health" aria-valuemin={0} aria-valuemax={backendStatus.max_health} aria-valuenow={backendStatus.health}><div style={{ width: `${Math.max(0, Math.min(100, backendStatus.health / backendStatus.max_health * 100))}%` }} /></div>
        <div className="lives-label">Lives: unavailable</div></>}
      <div className="stamina-label"><span>{exhausted ? 'Catch your breath · release Shift' : 'Stamina'}</span><span>{Math.round(stamina)}%</span></div>
      <div className="stamina-track" role="progressbar" aria-label="Stamina" aria-valuemin={0} aria-valuemax={MAX_STAMINA} aria-valuenow={Math.round(stamina)}><div style={{ width: stamina + '%' }} /></div>
    </div>
    {backendStatus && <div className="backend-hud"><strong>{backendStatus.xp} XP</strong><span>{backendStatus.adventure_completed ? 'Dragon defeated' : backendStatus.adventure_unlocked ? 'Castle unlocked' : 'Castle locked'}</span><span>{player?.villains?.filter((v) => v.status === 'completed').length || 0}/{player?.villains?.length || 3} guardians defeated</span><span>Item collection: unavailable</span><button className="secondary hud-leaderboard" onClick={onLeaderboard}>Leaderboard</button></div>}
    {nearBridge && <div className="bridge-notice"><span aria-hidden="true">♜</span><div><strong>The Storywood drawbridge</strong><p>{backendStatus?.adventure_unlocked ? 'Follow the bridge into the castle.' : 'Continue your story challenges to open the castle.'}</p></div></div>}
    {respawned && <div className="respawn-notice" role="status">Back on safe ground.</div>}
  </>
}
