import { useEffect, useRef } from 'react'

export default function PalaceDialog({ title, children, onClose, wide = false, adventure = false, kicker = 'Agora · Biology room' }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const first = dialog.querySelector('[data-autofocus]') || dialog.querySelector('textarea, input') || dialog.querySelector('button')
    first?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose?.()
      }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll('button, textarea, input, a[href]')].filter((item) => !item.disabled)
      const firstItem = items[0]
      const lastItem = items.at(-1)
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem?.focus() }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem?.focus() }
    }
    dialog.addEventListener('keydown', onKey)
    return () => {
      dialog.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [onClose])
  return <div className={'palace-overlay' + (adventure ? ' adventure-overlay' : '')}>
    <section ref={ref} className={'palace-card ' + (wide ? 'notes-card ' : '') + (adventure ? 'adventure-card' : '')} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-heading"><p className="palace-kicker">{kicker}</p>{onClose && <button className="close-button" onClick={onClose} aria-label="Close and return to exploration">✕</button>}</div>
      <h1 id="dialog-title">{title}</h1>
      {children}
    </section>
  </div>
}
