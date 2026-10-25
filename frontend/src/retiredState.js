// Discard only the keys owned by the retired client. Never read or restore values.
export function discardRetiredState(browser) {
  for (const name of ['sessionStorage', 'localStorage']) {
    try {
      browser[name]?.removeItem('memory-palace.backend-session.v1')
      browser[name]?.removeItem('memory-palace.mode')
    } catch { /* Storage can be unavailable; current play never needs it. */ }
  }
}
