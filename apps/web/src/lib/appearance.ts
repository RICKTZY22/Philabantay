import type { AccountPreferences } from '@barbershop/shared'

/**
 * Reflects the account's accessibility preferences onto the document root so CSS
 * can act on them.
 *
 * Plan section 9 requires a readable-font/text-size mode, a contrast mode, and a
 * reduced-motion path for every role. P4-08 built the controls and stored the
 * values, but nothing in the app read them back: choosing "Larger" or "Higher
 * contrast" persisted to the server and changed nothing on screen. These three
 * attributes are the seam between the stored preference and `theme/studio.css`.
 *
 * The device's own `prefers-reduced-motion` is honoured separately by a media
 * query and stays authoritative on its own; this preference can only add to it,
 * never turn it off.
 */
export type AppearancePreferences = Pick<
  AccountPreferences,
  'text_size' | 'high_contrast' | 'reduce_motion'
>

function set(root: HTMLElement, attribute: string, value: string | null): void {
  if (value === null) root.removeAttribute(attribute)
  else root.setAttribute(attribute, value)
}

export function applyAppearance(preferences: AppearancePreferences | null): void {
  const root = document.documentElement
  set(root, 'data-text-size', preferences && preferences.text_size !== 'default' ? preferences.text_size : null)
  set(root, 'data-contrast', preferences?.high_contrast ? 'high' : null)
  set(root, 'data-motion', preferences?.reduce_motion ? 'reduce' : null)
}

/** Signing out must not leave the next person on this device zoomed or inverted. */
export function clearAppearance(): void {
  applyAppearance(null)
}
