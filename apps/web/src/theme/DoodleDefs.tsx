/**
 * Renders once near the app root. Defines:
 *  - the `#rough` / `#rougher` SVG filters (the hand-drawn wobble trick), and
 *  - a sprite of line-art barbershop icons consumed via <DoodleIcon name="..." />.
 *
 * Any element with `filter: url('#rough')` gets its straight edges displaced by
 * fractal noise so it looks ink-drawn.
 */
export function DoodleDefs() {
  return (
    <svg className="icon-sprite" aria-hidden="true" focusable="false">
      <defs>
        <filter id="rough" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="rougher" x="-22%" y="-22%" width="144%" height="144%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="2" seed="9" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        <symbol id="i-scissors" viewBox="0 0 24 24">
          <circle cx="6" cy="6" r="2.4" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="6" cy="18" r="2.4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 7.5 L20 17 M8 16.5 L20 7 M11 12 l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-comb" viewBox="0 0 24 24">
          <path d="M3 8 h18 v3 H3 Z M6 11 v6 M9 11 v6 M12 11 v6 M15 11 v6 M18 11 v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-razor" viewBox="0 0 24 24">
          <path d="M14 3 l7 7 -9 2 -2 -2 z M10 12 l-6 6 M4 18 l2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-chair" viewBox="0 0 24 24">
          <path d="M6 4 v8 h10 V4 M5 12 h14 v3 H5 Z M8 15 v5 M16 15 v5 M6 8 h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </symbol>
        <symbol id="i-clock" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7 v5 l3.5 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-calendar" viewBox="0 0 24 24">
          <path d="M4 6 h16 v14 H4 Z M4 10 h16 M8 3 v4 M16 3 v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M8 14 h2 M14 14 h2 M8 17 h2 M14 17 h2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </symbol>
        <symbol id="i-chat" viewBox="0 0 24 24">
          <path d="M4 5 h16 v11 H9 l-4 4 v-4 H4 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 9 h8 M8 12 h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </symbol>
        <symbol id="i-user" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4 21 c0 -5 4 -7 8 -7 s8 2 8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-star" viewBox="0 0 24 24">
          <path d="M12 3 l2.6 5.6 6 .6 -4.5 4 1.3 6 -5.4 -3.4 -5.4 3.4 1.3 -6 -4.5 -4 6 -.6 z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="M4 13 l5 6 L20 4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M12 4 v16 M4 12 h16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24">
          <path d="M4 12 h15 M13 6 l6 6 -6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M5 5 l14 14 M19 5 l-14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-send" viewBox="0 0 24 24">
          <path d="M3 12 L21 4 l-6 16 -4 -6 z M11 14 l4 -6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </symbol>
        <symbol id="i-home" viewBox="0 0 24 24">
          <path d="M4 11.5 L12 4 l8 7.5 M6 10 v10 h12 V10 M10 20 v-6 h4 v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </symbol>
        <symbol id="i-gear" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 3 v3 M12 18 v3 M3 12 h3 M18 12 h3 M5.6 5.6 l2.1 2.1 M16.3 16.3 l2.1 2.1 M18.4 5.6 l-2.1 2.1 M7.7 16.3 l-2.1 2.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-heart" viewBox="0 0 24 24">
          <path d="M12 20 C5 14.5 3.5 9.5 6.5 6.8 C8.8 4.7 11.3 6.2 12 8 C12.7 6.2 15.2 4.7 17.5 6.8 C20.5 9.5 19 14.5 12 20 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-pole" viewBox="0 0 24 24">
          <rect x="8" y="3" width="8" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M9 6 l6 4 M9 10 l6 4 M9 14 l6 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
      </defs>
    </svg>
  )
}

const KNOWN = [
  'scissors', 'comb', 'razor', 'chair', 'clock', 'calendar',
  'chat', 'user', 'star', 'check', 'plus', 'arrow', 'x', 'send', 'pole',
  'home', 'gear', 'heart',
] as const

export type DoodleIconName = (typeof KNOWN)[number]

export function DoodleIcon({
  name,
  size = 24,
  className,
}: {
  name: DoodleIconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={['doodle-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#i-${name}`} />
    </svg>
  )
}
