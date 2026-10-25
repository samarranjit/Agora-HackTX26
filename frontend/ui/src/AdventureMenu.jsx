import PalaceDialog from './PalaceDialog.jsx'

export default function AdventureMenu({ paused, onEnter, onDemo }) {
  return <PalaceDialog adventure kicker="Chapter I · The royal grounds" title={paused ? 'A moment of quiet.' : 'Welcome to Crownwater.'}>
    <p className="adventure-intro">{paused ? 'The gardens will wait. Return when you’re ready to wander.' : 'A palace of possibilities, waiting to be remembered. Follow the garden paths to the gates of a sleeping kingdom.'}</p>
    <div className="adventure-rule" />
    <div className="adventure-controls">
      <span><kbd>W A S D</kbd> Wander</span><span><kbd>Mouse</kbd> Look around</span>
      <span><kbd>Space</kbd> Jump</span><span><kbd>Shift</kbd> Sprint</span>
      <span><kbd>Esc</kbd> Pause</span><span><kbd>Drag</kbd> Look fallback</span>
    </div>
    <button className="primary adventure-enter" data-autofocus onClick={onEnter}>{paused ? 'Resume exploration' : 'Enter courtyard'} <span aria-hidden="true">→</span></button>
    <button className="adventure-demo" onClick={onDemo}>Visit the indoor recall demo <span aria-hidden="true">↗</span></button>
    <p className="adventure-note">Explore freely. The drawbridge stays raised in this chapter.<br />Falling into the moat returns you safely to the garden.</p>
  </PalaceDialog>
}
