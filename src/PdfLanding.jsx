import { useEffect, useRef, useState } from 'react'
import PalaceDialog from './PalaceDialog.jsx'
import { PDF_MAX_BYTES, validateProfilePdf } from './api/profilePdf.js'
import { API_BASE_URL, BACKEND_CONFIG_ERROR } from './api/config.js'

export default function PdfLanding({ file, onFile, onContinue, onGuestDemo, onBackend, onTester }) {
  const inputRef = useRef(null), revision = useRef(0)
  const [error, setError] = useState(''), [checking, setChecking] = useState(false), [dragging, setDragging] = useState(false)
  const busy = false
  const connected = !!API_BASE_URL
  useEffect(() => () => { revision.current++ }, [])
  async function selectFile(candidate) {
    const version = ++revision.current
    onFile(null); setError(''); setChecking(true)
    try { await validateProfilePdf(candidate); if (version === revision.current) onFile(candidate) }
    catch (problem) { if (version === revision.current) setError(problem.message) }
    finally { if (version === revision.current) setChecking(false) }
  }
  const remove = () => { revision.current++; onFile(null); setError(''); setChecking(false); if (inputRef.current) inputRef.current.value = '' }
  async function submit(event) {
    event.preventDefault()
    if (checking) return
    if (!file) { setError('Choose a PDF before continuing, or explicitly choose the guest demo.'); return }
    onContinue()
  }
  return <PalaceDialog adventure backend wide title="Your notes. A world to remember." kicker="Memory Palace · A guest adventure">
    <div className="pdf-intro"><span className="pdf-crest" aria-hidden="true">♜</span><p>Choose a study PDF, then follow five fairy tales through the forest to an immense castle. This guest prototype still uses placeholder questions.</p></div>
    <form onSubmit={submit}>
      <input ref={inputRef} className="pdf-file-input" type="file" accept="application/pdf,.pdf" aria-label="Choose study PDF" disabled={busy} onChange={(e) => { if (e.target.files[0]) selectFile(e.target.files[0]); e.target.value = '' }} />
      <button type="button" className={'pdf-dropzone' + (dragging ? ' is-dragging' : '')} disabled={busy || checking} onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy && !checking) { if (e.dataTransfer.files.length !== 1) setError('Drop one PDF at a time.'); else selectFile(e.dataTransfer.files[0]) } }}>
        <span aria-hidden="true">↥</span><strong>{checking ? 'Checking your PDF…' : file ? 'Choose a different PDF' : 'Drop a PDF here, or click to choose'}</strong><small>PDF only · up to {Math.round(PDF_MAX_BYTES / 1024 / 1024 * 10) / 10} MB</small>
      </button>
      {file && <div className="pdf-selection"><div><strong>{file.name}</strong><span>{file.size < 1024 ? `${file.size} bytes` : file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`} · kept in memory for this visit</span></div><button type="button" className="secondary" disabled={busy} onClick={remove}>Remove PDF</button></div>}
      {error && <p className="api-error" role="alert">{error}</p>}
      <p className="pdf-connection" role="status">Your file stays in this tab until you sign in and explicitly upload it in account mode. Offline guest play uses placeholder questions.</p>
      <button className="primary full-width" disabled={!file || busy || checking}>Continue with this PDF locally</button>
      {onBackend && <button type="button" className="secondary full-width" disabled={!connected || checking} onClick={() => onBackend(file)}>Sign in / register · PDF learning & saved progress</button>}
      {!connected && <p className="small-print">{BACKEND_CONFIG_ERROR || 'Account mode is not configured. Set VITE_API_BASE_URL to enable PDF processing and saved progress.'}</p>}
      <button type="button" className="text-button" disabled={busy} onClick={onGuestDemo}>{file ? 'Explore the local guest demo with this file kept in memory' : 'Explore the guest demo without a PDF'}</button>
    </form>
    <p className="small-print">WASD move · Mouse or drag to look · E interact · Esc pause. Nothing is saved after you leave.</p>
    {import.meta.env.DEV && <button className="secondary full-width" disabled={busy} onClick={onTester}>Backend API Tester</button>}
  </PalaceDialog>
}
