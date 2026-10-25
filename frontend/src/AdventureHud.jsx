export default function AdventureHud({ nearBridge, respawned, backendStatus, player, onLeaderboard }) {
  const xp = Number.isFinite(backendStatus?.xp) ? backendStatus.xp : 0
  const unlock = Number.isFinite(player?.rules?.unlock_threshold) ? player.rules.unlock_threshold : 100
  const fill = unlock > 0 ? Math.max(0, Math.min(100, xp / unlock * 100)) : 0
  return <>
    <div className="adventure-objective"><span className="objective-diamond" aria-hidden="true">◇</span><div><span className="hud-eyebrow">Your journey</span><p>{backendStatus?.adventure_completed ? 'The kingdom remembers your victory' : 'Follow the tales through the Storywood'}</p></div></div>
    {backendStatus && <div className="adventure-vitals">
      <div className="health-row"><span className="hud-eyebrow">XP</span><strong>{xp}</strong></div>
      <div className="xp-track" role="progressbar" aria-label="XP" aria-valuemin={0} aria-valuemax={unlock} aria-valuenow={xp}><div style={{ width: `${fill}%` }} /></div>
    </div>}
    {backendStatus && <div className="backend-hud"><span>{backendStatus.adventure_completed ? 'Dragon defeated' : backendStatus.adventure_unlocked ? 'Castle unlocked' : 'Castle locked'}</span><span>{player?.villains?.filter((v) => v.status === 'completed').length || 0}/{player?.villains?.length || 3} guardians defeated</span><span>Item collection: unavailable</span><button className="secondary hud-leaderboard" onClick={onLeaderboard}>Leaderboard</button></div>}
    {nearBridge && <div className="bridge-notice"><span aria-hidden="true">♜</span><div><strong>The Storywood drawbridge</strong><p>{backendStatus?.adventure_unlocked ? 'Follow the bridge into the castle.' : 'Continue your story challenges to open the castle.'}</p></div></div>}
    {respawned && <div className="respawn-notice" role="status">Back on safe ground.</div>}
  </>
}
