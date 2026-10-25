import { useRef, useState } from 'react'
import PalaceDialog from './PalaceDialog.jsx'
import { PDF_MAX_BYTES } from './api/config.js'

export default function PdfLanding({ state, onSelect, onRetry, onSelectPack, onRefresh }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)
  const busy = ['checking', 'uploading', 'processing'].includes(state.phase)
  return <PalaceDialog adventure backend wide tools={false} title="Your notes. A world to remember." kicker="Memory Palace">
    <div className="pdf-intro"><span className="pdf-crest" aria-hidden="true">♜</span><p>Upload a PDF to begin your adventure.</p></div>
    <section className="study-library" aria-label="Saved study sets" aria-busy={state.libraryStatus === 'loading'}>
      <h2>Your study sets</h2>
      <p className="small-print">Continue saved questions or upload a new PDF. Your current health, XP and guardian progress are shared across your study sets.</p>
      {state.libraryStatus === 'loading' && <p role="status">Loading your study sets…</p>}
      {state.libraryStatus === 'ready' && !state.packs?.length && <p>No saved study sets yet. Choose your first PDF below.</p>}
      {state.libraryError && <div role="alert"><p>{state.libraryError.message}</p><button className="secondary" disabled={busy} onClick={onRefresh}>Retry study sets</button></div>}
      <ul className="study-set-list">{state.packs?.map((pack) => <li className="pdf-selection" key={pack.document_id}>
        <div><strong>{pack.name}</strong><span>{pack.topic}</span><span>{pack.status === 'ready' ? 'Questions ready' : pack.status === 'failed' ? 'Processing failed' : 'Processing'}{pack.error ? ` · ${pack.error}` : ''}</span></div>
        <button className="secondary" disabled={busy} onClick={() => onSelectPack(pack.document_id)}>{pack.status === 'ready' ? 'Continue' : pack.status === 'failed' ? 'Check again' : 'Continue processing'}<span className="visually-hidden"> {pack.name}</span></button>
      </li>)}</ul>
      {state.libraryStatus === 'ready' && <button className="text-button" disabled={busy} onClick={onRefresh}>Refresh study sets</button>}
    </section>
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
