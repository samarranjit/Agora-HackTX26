import { ApiError } from './client.js'
import { PDF_MAX_BYTES } from './config.js'
export { PDF_MAX_BYTES } from './config.js'
export async function validateProfilePdf(file, maxBytes = PDF_MAX_BYTES) {
  if (!file) throw new Error('Choose a PDF before continuing.')
  if (!file.size) throw new Error('This file is empty. Choose a readable PDF.')
  if (file.size > maxBytes) throw new Error(`Choose a PDF no larger than ${Math.round(maxBytes / 1024 / 1024 * 10) / 10} MB.`)
  if (!/\.pdf$/i.test(file.name) || file.type && !['application/pdf', 'application/octet-stream'].includes(file.type)) throw new Error('Only PDF files are accepted. Choose a file ending in .pdf.')
  if (!(await file.slice(0, 1024).text()).includes('%PDF-')) throw new Error('This file does not have a PDF header. Choose a valid PDF.')
  return file
}

export async function uploadProfilePdf(file, { api, topic = '', practiceCount = 10, maxBytes = PDF_MAX_BYTES, signal } = {}) {
  await validateProfilePdf(file, maxBytes)
  if (!api) throw new ApiError('PDF processing is not connected. Your file has not been uploaded.', { code: 'pdf_not_connected' })
  if (typeof topic !== 'string' || topic.trim().length > 200 || !Number.isInteger(practiceCount) || practiceCount < 1 || practiceCount > 30) throw new ApiError('Use a topic up to 200 characters and 1–30 practice questions.', { code: 'invalid_request' })
  return api.createStudyPack(file, { topic, practiceCount, signal })
}
