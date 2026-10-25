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
