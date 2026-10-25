export async function pollJob(read, signal, { timeoutMs = 120000, intervalMs = 1500 } = {}) {
  const started = Date.now()
  while (!signal.aborted && Date.now() - started < timeoutMs) {
    const data = await read(signal)
    if (data.status === 'ready') return data
    if (data.status === 'failed') throw new Error(data.error || 'The backend could not prepare this content.')
    await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, intervalMs)
      signal.addEventListener('abort', done, { once: true })
      if (signal.aborted) done()
    })
  }
  throw new Error(signal.aborted ? 'Polling stopped. You can check this job again by ID.' : 'Preparation is taking longer than two minutes. Check this job again by ID.')
}
