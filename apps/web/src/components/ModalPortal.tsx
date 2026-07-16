import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type ModalPortalProps = {
  backdropClassName: string
  dialogClassName: string
  labelledBy: string
  onClose: () => void
  children: ReactNode
}

/**
 * Shared top-level modal layer. Portaling outside `.app-shell` prevents a page
 * stacking context from putting the global header above a dialog.
 */
export function ModalPortal({
  backdropClassName,
  dialogClassName,
  labelledBy,
  onClose,
  children,
}: ModalPortalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const appShell = document.querySelector<HTMLElement>('.app-shell')
    const previousInert = appShell?.inert ?? false
    const previousOverflow = document.body.style.overflow
    const focusDialog = window.requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>('[data-dialog-initial-focus]')
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(preferred ?? first ?? dialogRef.current)?.focus()
    })

    if (appShell) appShell.inert = true
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
        .filter((element) => element.offsetParent !== null)
      if (focusables.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = focusables[0]
      const last = focusables.at(-1)!
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusDialog)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (appShell) appShell.inert = previousInert
      window.requestAnimationFrame(() => {
        if (previousActive?.isConnected) previousActive.focus()
      })
    }
  }, [onClose])

  return createPortal(
    <div className={backdropClassName} role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
