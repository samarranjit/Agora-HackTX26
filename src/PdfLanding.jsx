import { useRef, useState } from 'react'
import PalaceDialog from './PalaceDialog.jsx'
import { PDF_MAX_BYTES } from './api/config.js'

export default function PdfLanding({ state, onSelect, onRetry }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)
  const busy = ['checking', 'uploading', 'processing'].includes(state.phase)
  return <PalaceDialog adventure backend wide tools={false} title="Your notes. A world to remember." kicker="Memory Palace">
    <div className="pdf-intro"><span className="pdf-crest" aria-hidden="true">♜</span><p>Upload a PDF to begin your adventure.</p></div>
    <input ref={input} className="pdf-file-input" type="file" accept="application/pdf,.pdf" aria-label="Choose study PDF" disabled={busy} onChange={(e) => { const selected = e.target.files[0]; e.target.value = ''; if (selected) onSelect(selected) }} />
    <button type="button" className={'pdf-dropzone' + (dragging ? ' is-dragging' : '')} disabled={busy} onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => {
      e.preventDefault(); setDragging(false)
      if (!busy) onSelect(e.dataTransfer.files.length === 1 ? e.dataTransfer.files[0] : null)
    }}>
      <span aria-hidden="true">↥</span><strong>Drop a PDF here, or click to choose</strong><small>PDF only · up to {PDF_MAX_BYTES / 1024 / 1024} MB</small>
    </button>
    {state.name && <p className="pdf-selected-name">{state.name}</p>}
    {busy && <p className="pdf-connection" role="status">{state.phase === 'checking' ? 'Checking your PDF…' : state.phase === 'uploading' ? 'Uploading your PDF…' : state.stage === 'indexing' ? 'Reading your PDF…' : 'Preparing your questions…'}</p>}
    {state.phase === 'error' && <div className="pdf-upload-error" role="alert"><p>{state.error?.message || 'Your PDF could not be prepared. Please retry.'}</p>{state.error?.ambiguous && <p className="small-print">The upload may have reached the server. Retrying can submit this PDF again.</p>}<button className="primary full-width" onClick={() => state.name ? onRetry() : input.current?.click()}>Retry</button></div>}
  </PalaceDialog>
}
