import { validResponse } from './responseValidation.js'
import { API_BASE_URL } from './config.js'

export class ApiError extends Error {
  constructor(message, { status = null, code = 'connection_failed', details = null, ambiguous = false } = {}) {
    super(message); this.name = 'ApiError'
    Object.assign(this, { status, code, details, ambiguous })
  }
}

// Shared transport. Tokens come from the page-memory coordinator, never storage.
export function createApiClient({ baseUrl = API_BASE_URL, fetchImpl = globalThis.fetch, timeoutMs = 20000, getToken = () => null, onUnauthorized = () => {} } = {}) {
  const base = baseUrl.replace(/\/+$/, '')
  async function request(path, { method = 'GET', body, signal, auth = true, key } = {}) {
    if (!base) throw new ApiError('The service is unavailable. Please try again later.', { code: 'backend_not_configured' })
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected a backend-relative API path.')
    const controller = new AbortController(), abort = () => controller.abort()
    if (signal?.aborted) abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, timeoutMs)
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData
    const token = auth ? getToken() : null
    try {
      const response = await fetchImpl(base + path, {
        method, cache: 'no-store', credentials: 'omit', signal: controller.signal,
        headers: { Accept: 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
          ...(new URL(base).hostname.endsWith('.ngrok-free.dev')
            ? { 'ngrok-skip-browser-warning': '1' }
            : {}),
          ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
      })
      if (response.status === 401 && auth) onUnauthorized(token)
      if (response.headers.get('ngrok-error-code') === 'ERR_NGROK_3200') throw new ApiError('The service is currently offline. Please try again shortly.', { status: response.status, code: 'backend_unavailable' })
      let data
      try { data = response.status === 204 ? null : await response.json() } catch { throw new ApiError('The service returned an unreadable response. Please retry.', { status: response.status, code: 'invalid_response', ambiguous: method !== 'GET' && response.ok }) }
      if (!response.ok) throw new ApiError(data?.error?.message || 'Your request could not be completed. Please retry.', { status: response.status, code: data?.error?.code || 'http_error', details: data?.error?.details, ambiguous: method !== 'GET' && response.status >= 500 })
      if (!validResponse(path, data, method)) throw new ApiError('The service returned an incomplete response. Please retry.', { status: response.status, code: 'invalid_response', ambiguous: method !== 'GET' })
      return data
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(controller.signal.aborted ? 'The request timed out or was cancelled. Please retry.' : 'Cannot reach the service. Check your connection and retry.', { code: controller.signal.aborted ? 'timeout' : 'connection_failed', ambiguous: method !== 'GET' })
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  return {
    request,
    register: (body) => request('/api/auth/register', { method: 'POST', body, auth: false }),
    login: (body) => request('/api/auth/login', { method: 'POST', body, auth: false }),
    status: () => request('/api/me/status'), state: () => request('/api/me/state'), active: () => request('/api/me/active-attempt'),
    studyPacks: (signal) => request('/api/study-packs', { signal }),
    createStudyPack: (file, { signal } = {}) => { const body = new FormData(); body.append('file', file); return request('/api/study-packs', { method: 'POST', body, signal }) },
    studyPack: (id, signal) => request('/api/study-packs/' + encodeURIComponent(id), { signal }),
    questionSet: (id, signal) => request('/api/question-sets/' + encodeURIComponent(id), { signal }),
  }
}
