import { useEffect, useRef } from 'react'
import SoundControl from './SoundControl.jsx'

export default function PalaceDialog({ title, children, onClose, wide = false, adventure = false, backend = false, kicker, tools = true }) {
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
  return <div className={'palace-overlay' + (adventure ? ' adventure-overlay' : '') + (backend ? ' backend-overlay' : '')}>
    <section ref={ref} tabIndex={-1} className={'palace-card ' + (wide ? 'notes-card ' : '') + (adventure ? 'adventure-card' : '') + (backend ? ' backend-card' : '')} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-heading"><p className="palace-kicker">{kicker || 'Memory Palace · A guest adventure'}</p><div className="dialog-tools">{tools && <SoundControl />}{onClose && <button className="close-button" onClick={onClose} aria-label="Close and return to exploration">✕</button>}</div></div>
      <h1 id="dialog-title">{title}</h1>
      {children}
    </section>
  </div>
}
