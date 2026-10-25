// Small boundary checks for fields consumed by the UI. Contract: backend OpenAPI v1.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const number = (v) => Number.isFinite(v)
const string = (v) => typeof v === 'string'
const boolean = (v) => typeof v === 'boolean'
const fields = (v, spec) => object(v) && Object.entries(spec).every(([key, check]) => check(v[key]))
const balance = { xp: number, health: number, state_version: number }
const status = { ...balance, max_health: number, adventure_unlocked: boolean, adventure_completed: boolean, location: string }
function question(v) {
  return fields(v, { attempt_id: string, question_id: string, mode: (x) => ['practice', 'adventure'].includes(x),
    prompt: string, type: (x) => ['numeric', 'multiple_choice'].includes(x), topic: string, difficulty: number }) &&
    (v.type === 'numeric' ? v.options == null : Array.isArray(v.options) && v.options.length >= 2 && new Set(v.options.map((o) => o.id)).size === v.options.length && v.options.every((o) => fields(o, { id: string, text: string }))) &&
    (v.learning_objective == null || string(v.learning_objective)) &&
    (v.sources == null || Array.isArray(v.sources) && v.sources.every((s) => fields(s, { document_id: string, document_name: (x) => x === null || string(x), pages: (x) => Array.isArray(x) && x.every((p) => Number.isInteger(p) && p > 0) }))) &&
    (v.battle == null || fields(v.battle, { villain_name: string, question_number: number, question_count: number, correct_count: number }))
}
const jobStatus = (v) => ['pending', 'processing', 'ready', 'failed'].includes(v)
const packSet = (v, mode) => v === null || fields(v, { question_set_id: (x) => string(x) && !!x, mode: (x) => x === mode, status: jobStatus, error: (x) => x === null || string(x), question_count: (x) => Number.isInteger(x) && x >= 0 })
export function validStudyPack(v) {
  return fields(v, { document_id: (x) => string(x) && !!x, name: string, topic: string, status: jobStatus,
    stage: (x) => ['indexing', 'writing_questions', 'done', 'failed'].includes(x), error: (x) => x === null || string(x), created_at: string, updated_at: string }) &&
    packSet(v.practice, 'practice') && packSet(v.adventure, 'adventure') &&
    (v.status !== 'ready' || v.stage === 'done' && v.practice?.status === 'ready' && v.adventure?.status === 'ready')
}
export function validResponse(path, data, method = 'GET') {
  if (path === '/api/auth/logout') return data === null
  if (path === '/healthz') return fields(data, { status: string, game_master: string })
  if (path === '/api/auth/login') return fields(data, { access_token: string, token_type: string, expires_at: string })
  if (path === '/api/auth/register') return fields(data, { user_id: string, username: string })
  if (path === '/api/me/status') return fields(data, status)
  if (path === '/api/me/state') return fields(data, { ...status, username: string, rules: object, villains: Array.isArray })
  if (path === '/api/me/active-attempt') return object(data) && (data.attempt === null || question(data.attempt))
  if (path === '/api/practice/attempts') return fields(data, { created: boolean, attempt: question })
  if (path === '/api/adventure/battles') return fields(data, { ...balance, battle_attempt_id: string, villain_name: string, villain_id: string, entry_cost: number, attempt: question })
  if (/^\/api\/attempts\/[^/]+\/answer$/.test(path)) return fields(data, { ...balance, max_health: number, attempt_id: string, correct: boolean,
    feedback: (v) => fields(v, { explanation: string, correct_answer: string }), xp_delta: number, health_delta: number,
    encounter: (v) => fields(v, { mode: string, outcome: (x) => ['none', 'in_progress', 'won', 'lost', 'knocked_out'].includes(x), adventure_unlocked_now: boolean, adventure_completed: boolean }),
    next_attempt: (v) => v === null || question(v) })
  if (path === '/api/study-packs') return method === 'POST' ? validStudyPack(data) : fields(data, { study_packs: (items) => Array.isArray(items) && items.every(validStudyPack) })
  if (path.startsWith('/api/study-packs/')) return validStudyPack(data)
  if (path === '/api/documents' || path.startsWith('/api/documents/')) return fields(data, { document_id: string, status: (v) => ['pending', 'processing', 'ready', 'failed'].includes(v) })
  if (path === '/api/question-sets' || path.startsWith('/api/question-sets/')) return fields(data, { question_set_id: string, mode: string, status: (v) => ['pending', 'processing', 'ready', 'failed'].includes(v) })
  return object(data)
}
