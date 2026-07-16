import { useEffect, useRef, type CSSProperties } from 'react'
import type { OnboardingRole } from '@barbershop/shared'
import './DoodleAvatar.css'

export type DoodleAvatarId =
  | 'doodle:customer-1'
  | 'doodle:customer-2'
  | 'doodle:customer-3'
  | 'doodle:customer-4'
  | 'doodle:barber-1'
  | 'doodle:barber-2'
  | 'doodle:barber-3'
  | 'doodle:owner-1'
  | 'doodle:owner-2'
  | 'doodle:owner-3'

export type HairStyle = 'fringe' | 'round' | 'curls' | 'bob' | 'quiff' | 'cap' | 'fade' | 'bun' | 'spiky'
export type FaceShape = 'oval' | 'round' | 'square'
export type EyeStyle = 'dots' | 'happy' | 'wide' | 'sleepy'
export type NoseStyle = 'soft' | 'button' | 'long'
export type MouthStyle = 'smile' | 'grin' | 'neutral' | 'open'
export type AvatarAccessory = 'none' | 'glasses' | 'moustache' | 'freckles' | 'blush'
export type AvatarAccent = 'blue' | 'yellow' | 'pink' | 'purple' | 'green' | 'orange' | 'teal' | 'red'
export type SkinTone = 'paper' | 'sand' | 'tan' | 'brown' | 'deep'
/**
 * Role-locked equippable items, hiwalay sa cosmetic `AvatarAccessory` na
 * bukas sa lahat. Customer gear = cut stamp rewards; barber gear = mga
 * natapos na gupit sa chair nila. Ang UI at backend ay parehong nagre-reject
 * ng cross-role equipping.
 */
export type CustomerGear = 'none' | 'earring' | 'headphones' | 'sparkle' | 'crown'
export type BarberGear = 'none' | 'shears' | 'towel' | 'badge'
export type AvatarGear = CustomerGear | BarberGear

export interface CustomDoodleAvatar {
  face: FaceShape
  hair: HairStyle
  eyes: EyeStyle
  nose: NoseStyle
  mouth: MouthStyle
  accessory: AvatarAccessory
  accent: AvatarAccent
  skin: SkinTone
  gear: AvatarGear
}

export const DEFAULT_CUSTOM_DOODLE: CustomDoodleAvatar = {
  face: 'oval',
  hair: 'fringe',
  eyes: 'dots',
  nose: 'soft',
  mouth: 'smile',
  accessory: 'none',
  accent: 'blue',
  skin: 'paper',
  gear: 'none',
}

export const CUSTOM_AVATAR_CHOICES = {
  face: ['oval', 'round', 'square'] as const,
  hair: ['fringe', 'round', 'curls', 'bob', 'quiff', 'cap', 'fade', 'bun', 'spiky'] as const,
  eyes: ['dots', 'happy', 'wide', 'sleepy'] as const,
  nose: ['soft', 'button', 'long'] as const,
  mouth: ['smile', 'grin', 'neutral', 'open'] as const,
  accessory: ['none', 'glasses', 'moustache', 'freckles', 'blush'] as const,
  accent: ['blue', 'yellow', 'pink', 'purple', 'green', 'orange', 'teal', 'red'] as const,
  skin: ['paper', 'sand', 'tan', 'brown', 'deep'] as const,
  gear: ['none', 'earring', 'headphones', 'sparkle', 'crown', 'shears', 'towel', 'badge'] as const,
}

/**
 * Rewards catalogue ng customer gear: unlockAt = completed cuts na kailangan.
 * NOTE: dinuduplicate ito ng MockBackend enforcement (same precedent as
 * DOODLE_AVATAR_PATTERN) dahil hindi puwedeng mag-import ang services layer
 * mula sa components. Kapag nag-Supabase na, isang server-side table na ito.
 */
export const CUSTOMER_GEAR_CATALOG: Array<{ id: CustomerGear; label: string; unlockAt: number }> = [
  { id: 'none', label: 'Walang gear', unlockAt: 0 },
  { id: 'earring', label: 'Hoop earring', unlockAt: 1 },
  { id: 'headphones', label: 'Headphones', unlockAt: 3 },
  { id: 'sparkle', label: 'Fresh sparkles', unlockAt: 5 },
  { id: 'crown', label: 'Suki crown', unlockAt: 10 },
]

/** Barber-only gear; unlockAt = completed cuts na na-serve sa chair nila. */
export const BARBER_GEAR_CATALOG: Array<{ id: BarberGear; label: string; unlockAt: number }> = [
  { id: 'none', label: 'Walang gear', unlockAt: 0 },
  { id: 'shears', label: 'Shears sa tenga', unlockAt: 1 },
  { id: 'towel', label: 'Shoulder towel', unlockAt: 3 },
  { id: 'badge', label: 'Shop badge', unlockAt: 10 },
]

const ACCENT_CSS: Record<AvatarAccent, string> = {
  blue: 'var(--blue)',
  yellow: 'var(--yellow)',
  pink: 'var(--pink)',
  purple: 'var(--purple)',
  green: 'var(--green)',
  orange: 'var(--orange)',
  // Walang theme var ang dalawang ito; pastel hexes na kapareho ng palette.
  teal: '#b7e2df',
  red: '#f3b3a7',
}

const SKIN_CSS: Record<SkinTone, string> = {
  paper: 'var(--paper-soft)',
  sand: '#f7e3c8',
  tan: '#eac199',
  brown: '#c68e5e',
  deep: '#8d5a3a',
}

export interface DoodleAvatarOption {
  id: string
  label: string
  role: OnboardingRole
  hair: HairStyle
  glasses?: boolean
  moustache?: boolean
  freckles?: boolean
  blush?: boolean
  accent: string
  face?: FaceShape
  eyes?: EyeStyle
  nose?: NoseStyle
  mouth?: MouthStyle
  skin?: SkinTone
  gear?: AvatarGear
}

export const DOODLE_AVATARS: DoodleAvatarOption[] = [
  { id: 'doodle:customer-1', label: 'Friendly fringe', role: 'customer', hair: 'fringe', accent: 'var(--blue)' },
  { id: 'doodle:customer-2', label: 'Round crop', role: 'customer', hair: 'round', freckles: true, accent: 'var(--yellow)' },
  { id: 'doodle:customer-3', label: 'Soft curls', role: 'customer', hair: 'curls', accent: 'var(--pink)' },
  { id: 'doodle:customer-4', label: 'Bob cut', role: 'customer', hair: 'bob', freckles: true, accent: 'var(--purple)' },
  { id: 'doodle:barber-1', label: 'Fresh quiff', role: 'barber', hair: 'quiff', accent: 'var(--green)' },
  { id: 'doodle:barber-2', label: 'Classic moustache', role: 'barber', hair: 'cap', moustache: true, accent: 'var(--orange)' },
  { id: 'doodle:barber-3', label: 'Sharp fade', role: 'barber', hair: 'fade', accent: 'var(--blue)' },
  { id: 'doodle:owner-1', label: 'Smart glasses', role: 'shop_owner', hair: 'quiff', glasses: true, accent: 'var(--yellow)' },
  { id: 'doodle:owner-2', label: 'Shop captain', role: 'shop_owner', hair: 'cap', moustache: true, accent: 'var(--green)' },
  { id: 'doodle:owner-3', label: 'Creative owner', role: 'shop_owner', hair: 'bun', glasses: true, accent: 'var(--purple)' },
]

export const DEFAULT_AVATAR_BY_ROLE: Record<OnboardingRole, DoodleAvatarId> = {
  customer: 'doodle:customer-1',
  barber: 'doodle:barber-1',
  shop_owner: 'doodle:owner-1',
}

export function resolveDoodleAvatar(value: string | null | undefined, role: OnboardingRole = 'customer') {
  const custom = decodeCustomDoodleAvatar(value)
  if (custom) {
    return {
      id: encodeCustomDoodleAvatar(custom),
      label: 'Your custom doodle',
      role,
      hair: custom.hair,
      glasses: custom.accessory === 'glasses',
      moustache: custom.accessory === 'moustache',
      freckles: custom.accessory === 'freckles',
      blush: custom.accessory === 'blush',
      accent: ACCENT_CSS[custom.accent],
      face: custom.face,
      eyes: custom.eyes,
      nose: custom.nose,
      mouth: custom.mouth,
      skin: custom.skin,
      gear: custom.gear,
    } satisfies DoodleAvatarOption
  }
  return DOODLE_AVATARS.find((avatar) => avatar.id === value)
    ?? DOODLE_AVATARS.find((avatar) => avatar.id === DEFAULT_AVATAR_BY_ROLE[role])!
}

export function encodeCustomDoodleAvatar(config: CustomDoodleAvatar) {
  return `doodle:custom:${config.face}:${config.hair}:${config.eyes}:${config.nose}:${config.mouth}:${config.accessory}:${config.accent}:${config.skin}:${config.gear}`
}

export function decodeCustomDoodleAvatar(value: string | null | undefined): CustomDoodleAvatar | null {
  const parts = value?.split(':')
  // 9 parts = legacy format (walang skin/gear); 11 = kasalukuyang format.
  if (!parts || (parts.length !== 9 && parts.length !== 11) || parts[0] !== 'doodle' || parts[1] !== 'custom') return null
  const [, , face, hair, eyes, nose, mouth, accessory, accent, skin = 'paper', gear = 'none'] = parts
  if (!CUSTOM_AVATAR_CHOICES.face.includes(face as FaceShape)
    || !CUSTOM_AVATAR_CHOICES.hair.includes(hair as HairStyle)
    || !CUSTOM_AVATAR_CHOICES.eyes.includes(eyes as EyeStyle)
    || !CUSTOM_AVATAR_CHOICES.nose.includes(nose as NoseStyle)
    || !CUSTOM_AVATAR_CHOICES.mouth.includes(mouth as MouthStyle)
    || !CUSTOM_AVATAR_CHOICES.accessory.includes(accessory as AvatarAccessory)
    || !CUSTOM_AVATAR_CHOICES.accent.includes(accent as AvatarAccent)
    || !CUSTOM_AVATAR_CHOICES.skin.includes(skin as SkinTone)
    || !CUSTOM_AVATAR_CHOICES.gear.includes(gear as AvatarGear)) return null
  return { face, hair, eyes, nose, mouth, accessory, accent, skin, gear } as CustomDoodleAvatar
}

const cursorTrackers = new Map<HTMLSpanElement, boolean>()
let cursorFrame = 0
let cursorX = 0
let cursorY = 0

function resetTrackedAvatar(frame: HTMLSpanElement) {
  frame.style.removeProperty('--avatar-look-x')
  frame.style.removeProperty('--avatar-look-y')
  frame.style.removeProperty('--avatar-head-x')
  frame.style.removeProperty('--avatar-head-y')
  frame.style.removeProperty('--avatar-head-r')
}

function paintTrackedAvatars() {
  cursorFrame = 0
  cursorTrackers.forEach((visible, frame) => {
    if (!visible) return
    const rect = frame.getBoundingClientRect()
    const x = clamp((cursorX - (rect.left + rect.width / 2)) / Math.max(rect.width, 1), -1, 1)
    const y = clamp((cursorY - (rect.top + rect.height / 2)) / Math.max(rect.height, 1), -1, 1)
    frame.style.setProperty('--avatar-look-x', `${(x * 4.8).toFixed(2)}px`)
    frame.style.setProperty('--avatar-look-y', `${(y * 3.6).toFixed(2)}px`)
    frame.style.setProperty('--avatar-head-x', `${(x * 2.3).toFixed(2)}px`)
    frame.style.setProperty('--avatar-head-y', `${(y * 1.4).toFixed(2)}px`)
    frame.style.setProperty('--avatar-head-r', `${(x * 2.4).toFixed(2)}deg`)
  })
}

function onSharedPointerMove(event: PointerEvent) {
  cursorX = event.clientX
  cursorY = event.clientY
  if (!cursorFrame) cursorFrame = window.requestAnimationFrame(paintTrackedAvatars)
}

function resetAllTrackedAvatars() {
  cursorTrackers.forEach((_visible, frame) => resetTrackedAvatar(frame))
}

function registerCursorTracker(frame: HTMLSpanElement) {
  const observer = new IntersectionObserver(([entry]) => {
    const visible = Boolean(entry?.isIntersecting)
    cursorTrackers.set(frame, visible)
    if (!visible) resetTrackedAvatar(frame)
  }, { rootMargin: '80px' })
  cursorTrackers.set(frame, true)
  observer.observe(frame)
  if (cursorTrackers.size === 1) {
    window.addEventListener('pointermove', onSharedPointerMove, { passive: true })
    window.addEventListener('blur', resetAllTrackedAvatars)
  }

  return () => {
    observer.disconnect()
    cursorTrackers.delete(frame)
    resetTrackedAvatar(frame)
    if (cursorTrackers.size === 0) {
      if (cursorFrame) window.cancelAnimationFrame(cursorFrame)
      cursorFrame = 0
      window.removeEventListener('pointermove', onSharedPointerMove)
      window.removeEventListener('blur', resetAllTrackedAvatars)
    }
  }
}

export function DoodleAvatar({
  avatarId,
  role = 'customer',
  size = 120,
  trackCursor = false,
  className = '',
}: {
  avatarId?: string | null
  role?: OnboardingRole
  size?: number
  trackCursor?: boolean
  className?: string
}) {
  const frameRef = useRef<HTMLSpanElement>(null)
  const avatar = resolveDoodleAvatar(avatarId, role)

  useEffect(() => {
    const frame = frameRef.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const finePointer = window.matchMedia?.('(pointer: fine)').matches
    if (!frame || !trackCursor || reduced || !finePointer) return undefined
    return registerCursorTracker(frame)
  }, [trackCursor])

  return (
    <span
      ref={frameRef}
      className={`doodle-avatar ${trackCursor ? 'is-tracking' : ''} ${className}`.trim()}
      style={{
        '--avatar-size': `${size}px`,
        '--avatar-accent': avatar.accent,
        '--avatar-skin': SKIN_CSS[avatar.skin ?? 'paper'],
      } as CSSProperties}
      role="img"
      aria-label={`${avatar.label} doodle avatar`}
    >
      <svg viewBox="0 0 160 180" aria-hidden="true">
        <path className="da-shadow" d="M20 176 Q25 139 55 126 Q80 115 106 126 Q137 140 142 176 Z" />
        <path className="da-body" d="M17 180 Q23 143 54 128 Q80 145 108 128 Q139 143 145 180 Z" />
        <path className="da-shirt-line" d="M54 128 Q80 146 108 128 M80 146 V178" />
        <BodyGear item={avatar.gear ?? 'none'} />
        <g className="da-head-track">
          {(avatar.hair === 'bob' || avatar.hair === 'curls' || avatar.hair === 'bun') && <BackHair style={avatar.hair} />}
          <path className="da-ear" d="M40 71 Q28 66 29 81 Q30 94 42 96" />
          <path className="da-ear" d="M120 71 Q132 66 131 81 Q130 94 118 96" />
          <path className="da-face" d={facePath(avatar.face ?? 'oval')} />
          <Hair style={avatar.hair} />
          <path className="da-brow" d="M54 71 Q61 66 68 71 M92 71 Q100 66 107 71" />
          <Eyes style={avatar.eyes ?? 'dots'} />
          {avatar.glasses && (
            <g className="da-glasses">
              <rect x="48" y="69" width="27" height="23" rx="8" />
              <rect x="86" y="69" width="27" height="23" rx="8" />
              <path d="M75 78 Q80 74 86 78 M48 76 L40 74 M113 76 L121 74" />
            </g>
          )}
          <path className="da-nose" d={nosePath(avatar.nose ?? 'soft')} />
          {avatar.freckles && (
            <g className="da-freckles"><circle cx="54" cy="93" r="1.4" /><circle cx="59" cy="96" r="1.2" /><circle cx="105" cy="93" r="1.4" /><circle cx="101" cy="97" r="1.2" /></g>
          )}
          {avatar.blush && (
            <g className="da-blush"><circle cx="53" cy="95" r="5.5" /><circle cx="107" cy="95" r="5.5" /></g>
          )}
          {avatar.moustache && <path className="da-moustache" d="M80 99 Q70 92 60 101 Q69 110 80 105 Q92 110 102 101 Q91 92 80 99 Z" />}
          <path className="da-mouth" d={mouthPath(avatar.mouth ?? 'smile', Boolean(avatar.moustache))} />
          <Gear item={avatar.gear ?? 'none'} />
        </g>
      </svg>
    </span>
  )
}

/** Body-anchored gear (towel, badge) — gino-guhit pagkatapos ng body pero
    bago ang head group para natural ang overlap ng ulo. */
function BodyGear({ item }: { item: AvatarGear }) {
  if (item === 'towel') {
    return (
      <g className="da-gear-towel">
        <path className="da-gear-towel-cloth" d="M48 136 Q61 124 75 129 L71 160 Q58 165 46 158 Z" />
        <path className="da-gear-towel-line" d="M56 133 L52 156 M64 130 L61 159" />
      </g>
    )
  }
  if (item === 'badge') {
    return (
      <g className="da-gear-badge">
        <circle cx="103" cy="151" r="8.5" />
        <path d="M103 145.5 l1.7 3.3 3.7.4 -2.7 2.5 .7 3.6 -3.4 -1.8 -3.4 1.8 .7 -3.6 -2.7 -2.5 3.7 -.4 Z" />
      </g>
    )
  }
  return null
}

/** Head-anchored gear — huling gino-guhit para nakapatong sa hair/face. */
function Gear({ item }: { item: AvatarGear }) {
  if (item === 'earring') {
    return <circle className="da-gear-earring" cx="126" cy="98" r="3.8" />
  }
  if (item === 'shears') {
    return (
      <g className="da-gear-shears">
        <path d="M119 58 L133 80 M133 58 L119 80" />
        <circle cx="117" cy="55" r="3.4" />
        <circle cx="135" cy="55" r="3.4" />
      </g>
    )
  }
  if (item === 'headphones') {
    return (
      <g className="da-gear-headphones">
        <path className="da-gear-band" d="M36 64 Q38 16 80 12 Q122 16 124 64" />
        <rect x="28" y="62" width="15" height="26" rx="7" />
        <rect x="117" y="62" width="15" height="26" rx="7" />
      </g>
    )
  }
  if (item === 'sparkle') {
    return (
      <g className="da-gear-sparkle">
        <path d="M26 44 V60 M18 52 H34" />
        <path d="M136 30 V42 M130 36 H142" />
        <path d="M132 62 V70 M128 66 H136" />
      </g>
    )
  }
  if (item === 'crown') {
    return <path className="da-gear-crown" d="M56 24 L61 4 L72 17 L80 2 L88 17 L99 4 L104 24 Z" />
  }
  return null
}

function Eyes({ style }: { style: EyeStyle }) {
  if (style === 'happy') {
    return <g className="da-happy-eyes"><path d="M54 82 Q62 73 70 82" /><path d="M91 82 Q99 73 107 82" /></g>
  }
  if (style === 'sleepy') {
    return <g className="da-happy-eyes"><path d="M54 78 Q62 85 70 78" /><path d="M91 78 Q99 85 107 78" /></g>
  }
  if (style === 'wide') {
    return (
      <g className="da-eye-track">
        <circle className="da-eye-white" cx="62" cy="80" r="7" />
        <circle className="da-eye-white" cx="99" cy="80" r="7" />
        <circle className="da-eye" cx="62" cy="80" r="2.8" />
        <circle className="da-eye" cx="99" cy="80" r="2.8" />
      </g>
    )
  }
  return <g className="da-eye-track"><circle className="da-eye" cx="62" cy="80" r="3.7" /><circle className="da-eye" cx="99" cy="80" r="3.7" /></g>
}

function facePath(shape: FaceShape) {
  if (shape === 'round') return 'M39 55 Q46 25 80 24 Q114 25 121 55 L119 91 Q112 120 80 125 Q48 120 41 91 Z'
  if (shape === 'square') return 'M40 52 Q49 27 80 26 Q111 27 120 52 L118 99 Q105 123 80 126 Q55 123 42 99 Z'
  return 'M40 54 Q49 28 80 26 Q111 28 120 55 L117 94 Q110 121 80 126 Q49 121 42 94 Z'
}

function nosePath(style: NoseStyle) {
  if (style === 'button') return 'M75 89 Q80 96 87 90 Q84 97 77 95'
  if (style === 'long') return 'M80 76 Q74 91 77 99 Q82 103 89 96'
  return 'M78 78 Q74 91 80 94 Q85 95 88 91'
}

function mouthPath(style: MouthStyle, moustache: boolean) {
  if (moustache) return style === 'neutral' ? 'M72 112 H89' : 'M71 111 Q80 117 90 111'
  if (style === 'grin') return 'M66 102 Q80 119 95 102 Q80 112 66 102 Z'
  if (style === 'neutral') return 'M70 106 Q80 104 91 106'
  if (style === 'open') return 'M73 103 Q80 98 87 103 Q89 112 80 115 Q71 112 73 103 Z'
  return 'M68 103 Q80 116 93 103'
}

function BackHair({ style }: { style: HairStyle }) {
  if (style === 'bob') return <path className="da-hair" d="M34 57 Q35 22 79 18 Q125 20 126 60 L123 122 L106 123 L104 57 L54 57 L54 123 L36 121 Z" />
  if (style === 'bun') return <><circle className="da-hair" cx="113" cy="27" r="21" /><path className="da-hair" d="M35 60 Q37 22 80 20 Q123 23 125 62 L119 116 L105 118 L101 54 L57 54 L54 118 L39 115 Z" /></>
  return <path className="da-hair" d="M33 64 Q31 41 46 27 Q59 12 78 20 Q96 9 113 26 Q129 42 126 70 L119 114 L105 119 L102 54 L57 54 L54 118 L40 113 Z" />
}

function Hair({ style }: { style: HairStyle }) {
  if (style === 'round') return <path className="da-hair" d="M39 62 Q36 27 80 22 Q124 27 121 63 Q105 48 80 51 Q55 48 39 62 Z" />
  if (style === 'curls') return <path className="da-hair" d="M39 66 Q29 56 41 47 Q32 34 47 30 Q48 15 63 22 Q72 7 84 20 Q99 8 105 24 Q123 20 120 38 Q134 45 121 62 Q103 55 91 40 Q76 57 59 48 Q50 64 39 66 Z" />
  if (style === 'bob') return <path className="da-hair" d="M37 60 Q41 23 80 20 Q119 24 123 61 Q104 48 80 49 Q57 48 37 60 Z" />
  if (style === 'quiff') return <path className="da-hair" d="M40 62 Q32 43 47 34 Q45 18 61 20 Q72 5 83 19 Q98 7 104 23 Q121 21 119 39 Q129 49 119 65 Q105 54 96 38 Q83 53 66 46 Q56 63 40 62 Z" />
  if (style === 'cap') return <><path className="da-cap" d="M39 52 Q43 20 80 17 Q116 20 121 52 Z" /><path className="da-cap-line" d="M39 52 H127 Q119 62 105 60" /></>
  if (style === 'fade') return <path className="da-hair" d="M40 61 Q38 31 64 24 Q89 13 117 35 L119 58 Q103 48 92 36 Q75 51 57 48 Q50 59 40 61 Z" />
  if (style === 'bun') return <path className="da-hair" d="M39 61 Q40 27 80 21 Q119 27 121 61 Q104 47 91 38 Q76 53 58 48 Q51 59 39 61 Z" />
  if (style === 'spiky') return <path className="da-hair" d="M39 62 L44 38 L52 54 L59 28 L68 50 L80 24 L92 50 L101 28 L108 54 L116 38 L121 62 Q104 53 92 41 Q76 55 60 48 Q51 62 39 62 Z" />
  return <path className="da-hair" d="M39 62 Q35 36 58 25 Q80 13 91 27 Q107 19 120 39 L121 59 Q105 57 94 42 Q78 57 62 49 Q53 62 39 62 Z" />
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
