import { createGameSession } from './gameSession.js'
import { validateProfilePdf } from './profilePdf.js'
import { pollJob } from './pollJob.js'
import { validStudyPack } from './responseValidation.js'

const initial = () => ({ phase: 'auth', name: '', stage: null, error: null, packs: [], libraryStatus: 'idle', libraryError: null })
export function createPdfAdventure({ session = createGameSession(), pollOptions } = {}) {
  let state = initial(), file = null, pack = null, controller = null, generation = 0
  const listeners = new Set()
  const publish = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f()) }
  const stop = () => { generation++; controller?.abort(); controller = null; libraryController?.abort(); libraryController = null; libraryFlight = null; file = null; pack = null }
  const cancel = () => { stop(); session.clear(); state = initial(); listeners.forEach((f) => f()) }
  let libraryController = null, libraryFlight = null
  async function loadLibrary() {
    if (!session.getSnapshot().signedIn) return
    if (libraryFlight) return libraryFlight
    const version = generation, abort = new AbortController(); libraryController = abort
    publish({ libraryStatus: 'loading', libraryError: null })
    libraryFlight = (async () => {
      try {
        const response = await session.api.studyPacks(abort.signal)
        if (version === generation && !abort.signal.aborted) publish({ packs: response.study_packs, libraryStatus: 'ready' })
      } catch (error) {
        if (version === generation && !abort.signal.aborted) publish({ libraryStatus: 'error', libraryError: error })
      } finally { if (libraryController === abort) { libraryController = null; libraryFlight = null } }
    })()
    return libraryFlight
  }
  // Expiry during upload/play sends the player to the first mandatory screen.
  session.subscribe(() => {
    const server = session.getSnapshot()
    if (!server.signedIn && state.phase !== 'auth') { stop(); libraryController?.abort(); libraryController = null; libraryFlight = null; state = { ...initial(), error: server.error }; listeners.forEach((f) => f()) }
  })
  async function prepare() {
    if (!session.getSnapshot().signedIn) { publish({ phase: 'auth', error: new Error('Please sign in to begin.') }); return }
    if ((!file && !pack) || controller) return
    const version = generation, abort = new AbortController(); controller = abort
    publish({ phase: 'checking', error: null })
    try {
      if (file) await validateProfilePdf(file)
      if (version !== generation || abort.signal.aborted) return
      if (!pack) {
        publish({ phase: 'uploading', stage: null })
        const uploaded = await session.api.createStudyPack(file, { signal: abort.signal })
        if (version !== generation || abort.signal.aborted) return
        if (!validStudyPack(uploaded)) throw new Error('The server returned an incomplete PDF result. Please retry.')
        pack = uploaded
      }
      // A saved pack is read again before use. Retrying never creates a duplicate upload.
      else {
        const documentId = pack.document_id
        const latest = await session.api.studyPack(documentId, abort.signal)
        if (version !== generation || abort.signal.aborted) return
        if (!validStudyPack(latest) || latest.document_id !== documentId) throw new Error('The server returned a different or incomplete PDF. Please retry.')
        pack = latest
      }
      publish({ phase: 'processing', stage: pack.stage })
      if (pack.status === 'failed') throw new Error((pack.error || 'Your PDF could not be prepared.') + ' Retry checks this saved PDF again. If it still fails, choose another PDF or upload a new copy.')
      if (pack.status !== 'ready') {
        const documentId = pack.document_id
        const prepared = await pollJob(async (signal) => {
          const next = await session.api.studyPack(documentId, signal)
          if (!validStudyPack(next) || next.document_id !== documentId) throw new Error('The server returned a different or incomplete PDF. Please retry.')
          if (version === generation && !signal.aborted) { pack = next; publish({ stage: next.stage }) }
          return next
        }, abort.signal, { timeoutMs: 600000, ...pollOptions })
        if (version !== generation || abort.signal.aborted) return
        pack = prepared
      }
      if (version !== generation || abort.signal.aborted) return
      const accepted = await session.usePack(pack, abort.signal)
      if (!accepted) throw session.getSnapshot().error || new Error('Your questions are ready, but player state could not be loaded. Please retry.')
      if (version === generation && !abort.signal.aborted) publish({ phase: 'ready', stage: 'done' })
    } catch (error) { if (version === generation && !abort.signal.aborted) publish({ phase: 'error', error }) }
    finally { if (controller === abort) controller = null }
  }
  return {
    session, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) }, getSnapshot: () => state,
    clearError: () => { session.clearError(); publish({ error: null }) },
    authenticate: async (mode, body) => {
      if (state.phase !== 'auth') return
      const version = generation
      publish({ error: null })
      const result = await session.authenticate(mode, body)
      if (version !== generation) return null
      if (result && session.getSnapshot().signedIn) { publish({ phase: 'upload', error: null }); await loadLibrary() }
      else publish({ error: session.getSnapshot().error || new Error('Sign in failed. Please retry.') })
      return result
    },
    select: (selected) => {
      if (!session.getSnapshot().signedIn) { publish({ phase: 'auth', error: new Error('Please sign in to begin.') }); return Promise.resolve() }
      if (controller || session.getSnapshot().busy || session.getSnapshot().unresolved) return Promise.resolve()
      stop(); file = selected
      if (!selected) { publish({ phase: 'error', name: '', error: new Error('Choose one PDF at a time.') }); return Promise.resolve() }
      publish({ name: selected.name }); return prepare()
    },
    selectPack: (documentId) => {
      if (!session.getSnapshot().signedIn || controller || session.getSnapshot().busy || session.getSnapshot().unresolved) return Promise.resolve()
      const selected = state.packs.find((entry) => entry.document_id === documentId)
      if (!selected) return Promise.resolve()
      stop(); pack = selected; publish({ name: selected.name }); return prepare()
    },
    openLibrary: async () => {
      if (!session.getSnapshot().signedIn) return
      if (session.getSnapshot().busy || session.getSnapshot().unresolved || controller) return
      stop(); publish({ phase: 'upload', name: '', stage: null, error: null }); await loadLibrary()
    },
    loadLibrary,
    retry: () => state.phase === 'error' ? prepare() : Promise.resolve(),
    cancel: () => { libraryController?.abort(); libraryController = null; libraryFlight = null; cancel() },
  }
}
