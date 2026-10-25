import { useEffect, useRef } from 'react'

export default function CharacterSpeech({ title, children, onClose, anchor }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const focusFirst = () => {
      const visible = (selector) => [...dialog.querySelectorAll(selector)].find((item) => !item.matches(':disabled') && item.getClientRects().length > 0)
      const first = visible('[data-autofocus]') || visible('textarea, input') || visible('button, summary')
      ;(first || dialog).focus()
    }
    focusFirst()
    const keepFocus = () => { if (!dialog.contains(document.activeElement)) focusFirst() }
    document.addEventListener('focusin', keepFocus)
    const observer = new MutationObserver(keepFocus)
    observer.observe(dialog, { childList: true, subtree: true })
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current?.()
      }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll('button, textarea, input, select, summary, a[href]')].filter((item) => !item.matches(':disabled') && item.getClientRects().length > 0)
      const firstItem = items[0]
      const lastItem = items.at(-1)
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem?.focus() }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem?.focus() }
    }
    dialog.addEventListener('keydown', onKey)
    return () => {
      dialog.removeEventListener('keydown', onKey)
      observer.disconnect()
      document.removeEventListener('focusin', keepFocus)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  const x = Number.isFinite(anchor?.x) ? anchor.x : 50
  const y = Number.isFinite(anchor?.y) ? anchor.y : 18
  return <div className="guardian-speech-layer" style={{ '--speech-x': x + '%', '--speech-y': y + '%' }}>
    <section ref={ref} tabIndex={-1} className="palace-card backend-card guardian-speech" role="dialog" aria-modal="true" aria-labelledby="guardian-speech-title">
      <div className="dialog-heading"><p className="palace-kicker">Challenge</p>{onClose && <button className="close-button" onClick={onClose} aria-label="Close and return to exploration">✕</button>}</div>
      <h1 id="guardian-speech-title">{title}</h1>
      {children}
    </section>
  </div>
}
