// All public Vite backend settings are read here. An unset URL means offline-only.
export function normalizeApiBase(value) {
  const text = (value || '').trim().replace(/\/+$/, '')
  if (!text) return ''
  const url = new URL(text)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) backend URL without credentials, query parameters or a fragment.')
  return text
}
const env = import.meta.env || {}
let baseUrl = '', error = ''
try { baseUrl = normalizeApiBase(env.VITE_API_BASE_URL) } catch { error = 'VITE_API_BASE_URL is invalid. Use an HTTP(S) backend URL.' }
export const API_BASE_URL = baseUrl
export const BACKEND_CONFIG_ERROR = error
const limit = Number(env.VITE_PDF_MAX_MB)
export const PDF_MAX_BYTES = (Number.isFinite(limit) && limit > 0 ? limit : 20) * 1024 * 1024
