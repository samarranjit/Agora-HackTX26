import { File, FileMode } from 'expo-file-system'
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy'
import { PDF_MAX_BYTES } from './config.js'
export { PDF_MAX_BYTES } from './config.js'

// Reads the first bytes of a picked document, or null when the platform will not let
// this app read it (Expo Go scopes file access away from the picker's cache folder).
// The backend validates every upload, so the header check is a courtesy, not a gate.
async function readHeader(uri) {
  try {
    const handle = new File(uri).open(FileMode.ReadOnly)
    try { return String.fromCharCode(...handle.readBytesSync(1024)) } finally { handle.close() }
  } catch { /* Fall back to the legacy reader below. */ }
  try { return atob(await readAsStringAsync(uri, { encoding: EncodingType.Base64, position: 0, length: 1024 })) }
  catch { return null }
}

// `file` is a picked asset: { uri, name, size, type }.
export async function validateProfilePdf(file, maxBytes = PDF_MAX_BYTES) {
  if (!file) throw new Error('Choose a PDF before continuing.')
  if (!file.size) throw new Error('This file is empty. Choose a readable PDF.')
  if (file.size > maxBytes) throw new Error(`Choose a PDF no larger than ${Math.round(maxBytes / 1024 / 1024 * 10) / 10} MB.`)
  if (!/\.pdf$/i.test(file.name) || file.type && !['application/pdf', 'application/octet-stream'].includes(file.type)) throw new Error('Only PDF files are accepted. Choose a file ending in .pdf.')
  const header = await readHeader(file.uri)
  if (header !== null && !header.includes('%PDF-')) throw new Error('This file does not have a PDF header. Choose a valid PDF.')
  return file
}
