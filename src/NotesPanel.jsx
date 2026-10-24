import PalaceDialog from './PalaceDialog.jsx'

export default function NotesPanel({ notes, onNotesChange, onCreate, onReset, onClose, loaded }) {
  return <PalaceDialog title="Give your notes a place." onClose={onClose} wide>
    <p>Place a thought. Take a walk. Remember it at the door.</p>
    <div className="demo-notice"><strong>Sample mode</strong> · No API key needed. Your notes stay in this tab; this demo always creates the same three biology memories.</div>
    <label htmlFor="study-notes">Your study notes <span>(optional for this demo)</span></label>
    <textarea id="study-notes" value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Paste your study notes here…" rows={5} />
    <ol className="steps"><li>Load the three sample memories.</li><li>Walk to each pedestal to read its fact and visual cue.</li><li>Turn around, approach the wooden door, and press E.</li></ol>
    <div className="button-row"><button className="primary" onClick={onCreate}>Create Memories</button><button className="secondary" onClick={onCreate}>Load samples again</button></div>
    {loaded && <button className="text-button" onClick={onReset}>Reset room &amp; clear notes</button>}
    <p className="small-print">WASD move · Mouse or drag to look · E at door · Esc pause</p>
  </PalaceDialog>
}
