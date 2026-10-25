export async function pollJob(read, signal, { timeoutMs = 120000, intervalMs = 1500 } = {}) {
  const started = Date.now()
  while (!signal.aborted && Date.now() - started < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - started)
    const timeout = AbortSignal.timeout(Math.max(1, remaining))
    let data
    try { data = await read(AbortSignal.any([signal, timeout])) }
    catch (error) { if (!signal.aborted && !timeout.aborted) throw error; break }
    if (signal.aborted) break
    if (data.status === 'ready') return data
    if (data.status === 'failed') throw new Error(data.error || 'The backend could not prepare this content.')
    await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, intervalMs)
      signal.addEventListener('abort', done, { once: true })
      if (signal.aborted) done()
    })
  }
  throw new Error(signal.aborted ? 'PDF preparation was stopped.' : `Preparation is taking longer than ${Math.round(timeoutMs / 60000)} minutes. Please retry to keep waiting.`)
}
