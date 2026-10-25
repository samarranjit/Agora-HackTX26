import PalaceDialog from './PalaceDialog.jsx'

export default function AdventureMenu({ paused, onEnter, onDemo, onAccount, onPractice, onResume, onMaterials, onTester, signedIn, hasAttempt, username, feedback, forestRun, onJournal, onNewRun }) {
  return <PalaceDialog adventure kicker={forestRun ? 'A guest adventure · The Storywood' : 'Chapter I · The royal grounds'} title={paused ? 'A moment of quiet.' : forestRun ? 'Every tale leaves a trail.' : 'Welcome to Crownwater.'}>
    <p className="adventure-intro">{forestRun ? paused ? 'Your stories and remaining hearts will wait here while you pause.' : 'Follow the winding trail toward the castle. Five lost fairy tales hide among the trees; remember them to wake the sleeping bridge.' : paused ? 'The gardens will wait. Return when you’re ready to wander.' : 'A palace of possibilities, waiting to be remembered. Follow the garden paths to the gates of a sleeping kingdom.'}</p>
    <div className="adventure-rule" />
    <div className="adventure-controls">
      <span><kbd>W A S D</kbd> Wander</span><span><kbd>Mouse</kbd> Look around</span>
      <span><kbd>Space</kbd> Jump</span><span><kbd>Shift</kbd> Sprint</span>
      <span><kbd>Esc</kbd> Pause</span><span><kbd>Drag</kbd> Look fallback</span>
    </div>
    <button className="primary adventure-enter" data-autofocus onClick={onEnter}>{paused ? 'Resume exploration' : forestRun ? 'Begin offline guest adventure' : 'Enter courtyard'} <span aria-hidden="true">→</span></button>
    {forestRun ? <div className="backend-menu-actions"><button className="secondary" onClick={onJournal}>Stories & checkpoints · {forestRun.collectedIds.length}/5</button>{hasAttempt && <button className="secondary" onClick={onResume}>Resume story challenge</button>}{paused && <button className="secondary" onClick={onNewRun}>Start a fresh guest run</button>}{import.meta.env.DEV && <button className="secondary" onClick={onTester}>Backend API Tester</button>}</div> :
    import.meta.env.DEV && <div className="backend-menu-actions">
      <button className="secondary" onClick={onAccount}>{signedIn ? `Account · ${username}` : 'Sign in / register'}</button>
      <button className="secondary" onClick={onPractice}>Practice questions</button>
      {hasAttempt && <button className="secondary" onClick={onResume}>Resume pending question</button>}
      <button className="secondary" onClick={onMaterials}>Study material</button>
      {import.meta.env.DEV && <button className="secondary" onClick={onTester}>Backend API Tester</button>}
    </div>}
    {feedback}
    {onDemo && <button className="adventure-demo" onClick={onDemo}>Visit the indoor recall demo <span aria-hidden="true">↗</span></button>}
    <p className="adventure-note">{forestRun ? <>Medium · Three questions per item · {forestRun.rules.itemXp} XP per story.<br />All five items and {forestRun.rules.unlockXp} XP open the castle. Three mistakes end the run.<br />Offline prototype: leaving or refreshing erases this visit. Online guest sessions are not available yet.</> : <>Find the Forest Goblin beside the eastern garden path. Press E nearby to challenge.<br />Practice earns server XP. The drawbridge remains raised.</>}</p>
  </PalaceDialog>
}
