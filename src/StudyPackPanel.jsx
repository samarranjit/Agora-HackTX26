import { useEffect, useRef, useState } from 'react'
import { PDF_MAX_BYTES, validateProfilePdf } from './api/profilePdf.js'
import { ServerError } from './BackendGame.jsx'

export default function StudyPackPanel({ session, state, file, onFile }) {
  const [error, setError] = useState(null), [checking, setChecking] = useState(false)
  const [topic, setTopic] = useState(''), [count, setCount] = useState(10), [dragging, setDragging] = useState(false)
  const revision = useRef(0), input = useRef(null)
  useEffect(() => () => { revision.current++ }, [])
  const blocked = state.busy || state.packBusy || !!state.attempt || !!state.result || !!state.unresolved
  async function select(candidate) {
    const version = ++revision.current
    setChecking(true); setError(null); onFile(null)
    try { await validateProfilePdf(candidate); if (version === revision.current) onFile(candidate) }
    catch (e) { if (version === revision.current) setError(e) }
    finally { if (version === revision.current) setChecking(false) }
  }
  const pack = state.pack
  return <div className="study-materials">
    <p>Upload once to prepare practice questions and all three guardian levels. Generation runs on the server. If it uses fake mode, questions are arithmetic fixtures unrelated to the PDF.</p>
    <fieldset disabled={blocked || checking}><legend>Your study PDF</legend>
      <input ref={input} aria-label="Choose study PDF" type="file" accept="application/pdf,.pdf" onChange={(e) => { if (e.target.files[0]) select(e.target.files[0]); e.target.value = '' }} />
      <button className={'pdf-dropzone' + (dragging ? ' is-dragging' : '')} type="button" onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (!blocked && !checking) { if (e.dataTransfer.files.length === 1) select(e.dataTransfer.files[0]); else setError(new Error('Drop one PDF at a time.')) } }}>Drop a PDF here, or click to choose · up to {PDF_MAX_BYTES / 1024 / 1024} MB</button>
      {file && <p>{file.name} · {(file.size / 1024).toFixed(1)} KB <button className="text-button" onClick={() => { revision.current++; onFile(null); setError(null) }}>Remove PDF</button></p>}
      <label>Topic (optional)<input maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
      <label>Practice questions (1–30)<input type="number" min="1" max="30" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
      <button className="primary full-width" disabled={!file || !Number.isInteger(count) || count < 1 || count > 30} onClick={() => session.preparePack(file, { topic, practiceCount: count })}>Upload PDF & prepare questions</button>
    </fieldset>
    {checking && <p role="status">Checking PDF…</p>}
    {blocked && !state.packBusy && <p>Finish review or recover the pending question before changing study packs.</p>}
    {state.packBusy && <p role="status">Preparing your study pack… <button className="secondary" onClick={() => session.cancelPack()}>Stop waiting</button></p>}
    <ServerError error={error || state.packError} />
    <button className="secondary full-width" disabled={state.packBusy} onClick={() => session.loadPacks()}>Refresh saved PDFs</button>
    <label>Saved study packs<select value={pack?.document_id || ''} disabled={blocked} onChange={(e) => session.selectPack(e.target.value)}><option value="">Choose a PDF</option>{state.packs.map((p) => <option key={p.document_id} value={p.document_id}>{p.name} · {p.status}</option>)}</select></label>
    {pack && <div className="demo-notice" role="status"><strong>{pack.name} · {pack.status}</strong><p>{{ indexing: 'Indexing the PDF', writing_questions: 'Writing practice and adventure questions', done: 'Questions ready', failed: 'Preparation failed' }[pack.stage]}</p>{pack.practice && <p>Practice: {pack.practice.status} · {pack.practice.question_count} questions</p>}{pack.adventure && <p>Adventure: {pack.adventure.status} · {pack.adventure.question_count} questions</p>}{pack.error && <p>{pack.error}</p>}<p className="api-id">{pack.document_id}</p>{['pending', 'processing'].includes(pack.status) && <button className="secondary" disabled={blocked} onClick={() => session.preparePack(null)}>Resume waiting</button>}</div>}
    <p className="small-print">Stopping or closing this panel does not delete server content. Waiting stops after ten minutes; refresh your saved PDFs or resume waiting. A lost upload response may still have created a pack: refresh the list before uploading again. Failed packs require a new upload. Account progress survives reload; selected file bytes stay in memory.</p>
  </div>
}
