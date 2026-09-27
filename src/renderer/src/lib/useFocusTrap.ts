import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Keeps Tab / Shift+Tab inside `ref` while mounted. On close, focus goes to
// `returnTo` if given (the element that opened the dialog may have been
// disabled meanwhile, e.g. Start during a copy), else back to whatever had it
// before. Call it before any effect that moves focus into the dialog.
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  returnTo?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null

    const onKeyDown = (e: KeyboardEvent): void => {
      const container = ref.current
      if (e.key !== 'Tab' || !container) return
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!container.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      ;(returnTo?.current ?? previous)?.focus?.()
    }
  }, [ref, returnTo])
}
