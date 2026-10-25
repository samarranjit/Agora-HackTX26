import { useEffect, useRef, useState } from 'react'
import { ServerError } from './BackendGame.jsx'
import { pollJob } from './api/pollJob.js'

export default function StudyMaterials({ session, disabled }) {
  const [file, setFile] = useState(null)
  const [documentIds, setDocumentIds] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [setId, setSetId] = useState('')
  const [topic, setTopic] = useState('Study notes')
  const [count, setCount] = useState(5)
  const [min, setMin] = useState(1)
  const [max, setMax] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [jobs, setJobs] = useState([])
  const abortRef = useRef(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  const record = (data) => setJobs((old) => [data, ...old.filter((x) => (x.document_id || x.question_set_id) !== (data.document_id || data.question_set_id))].slice(0, 8))
  async function run(work) {
    if (abortRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true); setError(null)
    try { await work(controller.signal) } catch (e) { if (!controller.signal.aborted) setError(e) }
    finally { if (abortRef.current === controller) { abortRef.current = null; setBusy(false) } }
  }
  const watch = async (kind, id, signal) => {
    const data = await pollJob(async (s) => { const value = await session.api[kind](id, s); if (!s.aborted) record(value); return value }, signal)
    if (signal.aborted) return
    if (kind === 'document') setDocumentIds((old) => [...new Set([...old.split(/[\s,]+/).filter(Boolean), data.document_id])].join(', '))
  }
  return <div className="study-materials">
    <p>Upload a PDF, wait for it to be ready, then prepare both practice and adventure questions. Fake backend mode uses demo arithmetic and ignores PDF text.</p>
    <fieldset disabled={disabled || busy}><legend>Prepare study material · modifies content</legend>
      <label>PDF<input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
      <button className="secondary" disabled={!file} onClick={() => run(async (signal) => { const data = await session.api.upload(file, signal); record(data); setDocumentId(data.document_id); await watch('document', data.document_id, signal) })}>Upload PDF & wait</button>
      <label>Ready document IDs (comma separated)<input value={documentIds} onChange={(e) => setDocumentIds(e.target.value)} /></label>
      <label>Topic<input maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
      <div className="api-grid"><label>Count (1–50)<input type="number" min="1" max="50" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label><label>Min difficulty<input type="number" min="1" max="5" value={min} onChange={(e) => setMin(Number(e.target.value))} /></label><label>Max difficulty<input type="number" min="1" max="5" value={max} onChange={(e) => setMax(Number(e.target.value))} /></label></div>
      <div className="button-row">{['practice', 'adventure'].map((mode) => <button key={mode} className="secondary" disabled={!documentIds.trim() || !topic.trim() || count < 1 || count > 50 || min < 1 || max > 5 || min > max} onClick={() => run(async (signal) => {
        const data = await session.api.createSet({ document_ids: documentIds.split(/[\s,]+/).filter(Boolean), mode, topic, count, difficulty_min: min, difficulty_max: max }, signal)
        record(data); setSetId(data.question_set_id); await watch('questionSet', data.question_set_id, signal)
      })}>Create {mode} set & wait</button>)}</div>
    </fieldset>
    <fieldset disabled={disabled || busy}><legend>Check existing jobs · read only</legend>
      <label>Document ID<input value={documentId} onChange={(e) => setDocumentId(e.target.value)} /></label><button className="secondary" disabled={!documentId.trim()} onClick={() => run((s) => watch('document', documentId.trim(), s))}>Poll document</button>
      <label>Question set ID<input value={setId} onChange={(e) => setSetId(e.target.value)} /></label><button className="secondary" disabled={!setId.trim()} onClick={() => run((s) => watch('questionSet', setId.trim(), s))}>Poll question set</button>
    </fieldset>
    {busy && <p role="status">Waiting for the backend… <button className="secondary" onClick={() => { abortRef.current?.abort() }}>Stop waiting</button></p>}
    <ServerError error={error} />
    {jobs.map((job) => <div className="demo-notice" key={job.document_id || job.question_set_id}><strong>{job.name || `${job.mode} · ${job.topic}`} · {job.status}</strong><p className="api-id">{job.document_id || job.question_set_id}</p>{job.provider && <p>Provider: {job.provider}</p>}{job.error && <p>{job.error}</p>}</div>)}
  </div>
}
