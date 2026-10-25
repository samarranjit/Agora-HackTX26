import { validResponse } from './responseValidation.js'

export class ApiError extends Error {
  constructor(message, { status = null, code = 'connection_failed', details = null, ambiguous = false } = {}) {
    super(message)
    this.name = 'ApiError'
    Object.assign(this, { status, code, details, ambiguous })
  }
}

export function sanitize(value, secrets = []) {
  if (typeof value === 'string') return secrets.filter(Boolean).reduce((s, secret) => s.split(secret).join('[redacted]'), value)
  if (Array.isArray(value)) return value.map((v) => sanitize(v, secrets))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) =>
    [key, /password|token|authorization|secret|api.?key/i.test(key) ? '[redacted]' : sanitize(v, secrets)]))
  return value
}

export function createApiClient({ baseUrl = 'http://127.0.0.1:8796', getToken = () => null, onUnauthorized = () => {}, onRequest = () => {}, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const base = baseUrl.replace(/\/+$/, '')
  async function request(path, { method = 'GET', body, key, auth = true, signal, responseMode = 'contract' } = {}) {
    if (!base) throw new ApiError('Backend mode is not configured. Set VITE_API_BASE_URL or use the offline demo.', { code: 'backend_not_configured' })
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected a backend-relative API path.')
    const started = performance.now()
    const token = auth ? getToken() : null
    const secrets = [token, body?.password]
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (signal?.aborted) abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, timeoutMs)
    let status = null
    let responseData = null
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData
    try {
      const response = await fetchImpl(base + path, {
        method, cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(new URL(base).hostname.endsWith('.ngrok-free.dev')
            ? { 'ngrok-skip-browser-warning': '1' }
            : {}),
          ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
      })
      status = response.status
      if (status === 401 && auth) onUnauthorized(token)
      const raw = status === 204 ? '' : await response.text()
      if (raw) {
        try { responseData = JSON.parse(raw) } catch {
          throw new ApiError('The backend returned an invalid JSON response. Check the API URL and retry.', { status, code: 'invalid_response', ambiguous: method !== 'GET' })
        }
      }
      if (!response.ok) {
        throw new ApiError(responseData?.error?.message || `Backend request failed (HTTP ${status}).`, {
          status, code: responseData?.error?.code || 'http_error', details: responseData?.error?.details,
          ambiguous: status >= 500,
        })
      }
      if (responseMode !== 'receipt' && (status !== 204 || path.startsWith('/api/')) && !validResponse(path, responseData, method)) {
        throw new ApiError('The backend returned an empty or invalid response.', { status, code: 'invalid_response', ambiguous: method !== 'GET' })
      }
      return responseMode === 'receipt' ? { status, data: responseData } : responseData
    } catch (cause) {
      const error = cause instanceof ApiError ? cause : new ApiError(controller.signal.aborted
        ? 'Request timed out or was cancelled. Retry the saved action to safely recover its result.'
        : 'Cannot reach the backend. Check the server, connection, API URL, and CORS origin.',
      { code: controller.signal.aborted ? 'timeout' : 'connection_failed', ambiguous: method !== 'GET' })
      responseData = { error: { code: error.code, message: error.message, details: error.details } }
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      onRequest({ method, path, status, duration: Math.round(performance.now() - started),
        request: sanitize(multipart ? { file: { name: body.get('file')?.name, size: body.get('file')?.size } } : body ?? null, secrets),
        response: sanitize(responseData, [...secrets, responseData?.access_token]), key: key || null })
    }
  }
  return {
    baseUrl: base, request,
    health: () => request('/healthz', { auth: false }),
    register: (body) => request('/api/auth/register', { method: 'POST', body, auth: false }),
    login: (body) => request('/api/auth/login', { method: 'POST', body, auth: false }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    status: () => request('/api/me/status'), state: () => request('/api/me/state'), active: () => request('/api/me/active-attempt'),
    upload: (file, signal) => { const body = new FormData(); body.append('file', file); return request('/api/documents', { method: 'POST', body, signal }) },
    document: (id, signal) => request(`/api/documents/${encodeURIComponent(id)}`, { signal }),
    createSet: (body, signal) => request('/api/question-sets', { method: 'POST', body, signal }),
    createStudyPack: (file, { topic = '', practiceCount = 10, signal } = {}) => {
      const body = new FormData(); body.append('file', file)
      if (topic.trim()) body.append('topic', topic.trim())
      body.append('practice_count', String(practiceCount))
      return request('/api/study-packs', { method: 'POST', body, signal })
    },
    studyPack: (id, signal) => request(`/api/study-packs/${encodeURIComponent(id)}`, { signal }),
    studyPacks: (signal) => request('/api/study-packs', { signal }),
    questionSet: (id, signal) => request(`/api/question-sets/${encodeURIComponent(id)}`, { signal }),
  }
}
