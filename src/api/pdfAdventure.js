import { createGameSession } from './gameSession.js'
import { validateProfilePdf } from './profilePdf.js'
import { pollJob } from './pollJob.js'
import { validStudyPack } from './responseValidation.js'

const initial = () => ({ phase: 'auth', name: '', stage: null, error: null })
export function createPdfAdventure({ session = createGameSession(), pollOptions } = {}) {
  let state = initial(), file = null, pack = null, controller = null, generation = 0
  const listeners = new Set()
  const publish = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f()) }
  const stop = () => { generation++; controller?.abort(); controller = null; file = null; pack = null }
  const cancel = () => { stop(); session.clear(); state = initial(); listeners.forEach((f) => f()) }
  // Expiry during upload/play sends the player to the first mandatory screen.
  session.subscribe(() => {
    const server = session.getSnapshot()
    if (!server.signedIn && state.phase !== 'auth') { stop(); state = { ...initial(), error: server.error }; listeners.forEach((f) => f()) }
  })
  async function prepare() {
    if (!session.getSnapshot().signedIn) { publish({ phase: 'auth', error: new Error('Please sign in to begin.') }); return }
    if (!file || controller) return
    const version = generation, abort = new AbortController(); controller = abort
    publish({ phase: 'checking', error: null })
    try {
      await validateProfilePdf(file)
      if (version !== generation || abort.signal.aborted) return
      if (!pack || pack.status === 'failed') {
        publish({ phase: 'uploading', stage: null })
        const uploaded = await session.api.createStudyPack(file, { signal: abort.signal })
        if (version !== generation || abort.signal.aborted) return
        if (!validStudyPack(uploaded)) throw new Error('The server returned an incomplete PDF result. Please retry.')
        pack = uploaded
      }
      publish({ phase: 'processing', stage: pack.stage })
      if (pack.status === 'failed') throw new Error(pack.error || 'Your PDF could not be prepared. Please retry.')
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
      if (result && session.getSnapshot().signedIn) publish({ phase: 'upload', error: null })
      else publish({ error: session.getSnapshot().error || new Error('Sign in failed. Please retry.') })
      return result
    },
    select: (selected) => {
      if (!session.getSnapshot().signedIn) { publish({ phase: 'auth', error: new Error('Please sign in to begin.') }); return Promise.resolve() }
      stop(); file = selected
      if (!selected) { publish({ phase: 'error', name: '', error: new Error('Choose one PDF at a time.') }); return Promise.resolve() }
      publish({ name: selected.name }); return prepare()
    },
    retry: () => state.phase === 'error' ? prepare() : Promise.resolve(), cancel,
  }
}
