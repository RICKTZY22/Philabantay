import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Building } from '../components/Storefront'
import { RiveScene } from '../components/RiveScene'
import type { LandingOutletContext } from '../components/Layout'
import { heroSceneForHour } from '../lib/philippineHeroTime'
import { useJourneyScroll } from './useJourneyScroll'
import './LandingPage.css'

type FeatureId = 'booking' | 'schedule' | 'facts'

/**
 * Bottom-section feature rows. Copy describes behavior the product actually
 * has: one advancing reservation, owner-authored schedules, and published shop
 * facts with no invented queue or wait estimates.
 */
const LANDING_FEATURES: Array<{
  id: FeatureId
  title: string
  body: string
  cta: string
  mode: 'signin' | 'signup'
  sceneLabel: string
  /** Optional .riv in `public/rive`. Without it the static glyph is used. */
  riveSrc?: string
  /**
   * State machine to run. Required for any .riv whose motion lives in a state
   * machine rather than a plain timeline: without it Rive plays the first
   * timeline, and the pointer listeners the state machine declares are never
   * attached, so the artwork loads and then sits perfectly still.
   */
  riveStateMachine?: string
}> = [
  {
    id: 'booking',
    title: 'You send one request, the shop takes it from there',
    body: 'A service, barber, date, and time become a single reservation. Accepting, checking in, and finishing all advance that same booking instead of creating another version of the truth.',
    cta: 'See how booking works',
    mode: 'signup',
    sceneLabel: 'One booking request advancing through its stages',
    riveSrc: '/rive/character-follow.riv',
    // Names read out of the file itself. Its motion (Blinking, Head rotation)
    // and its Head enter/exit and Left/Right pointer listeners all live on this
    // state machine, so naming it is what makes the character animate at all.
    riveStateMachine: 'State Machine 1',
  },
  {
    id: 'schedule',
    title: 'Owners set the roster, barbers ask to change it',
    body: 'The shop owner authors weekly shifts and day exceptions. Barbers see the authoritative schedule and submit a request; approving one writes the change straight onto the calendar.',
    cta: 'Explore the schedule tools',
    mode: 'signup',
    sceneLabel: 'A weekly roster with an approved change request',
  },
  {
    id: 'facts',
    title: 'Only the shop facts that are actually published',
    body: 'Hours, closures, services, and prices come from the shop itself. Nothing is estimated and nothing is filled in with samples, so what you read before booking is what the shop set.',
    cta: 'Browse real shops',
    mode: 'signin',
    sceneLabel: 'A shop profile showing published hours and prices',
  },
]

const ACCENT = '#f4b8c4'
const INK = '#2b2b2b'

type DayPhase = 'morning' | 'afternoon' | 'dusk' | 'night'

const PH_CLOCK_PARTS = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function dayPhaseForHour(hour: number): DayPhase {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 19.5) return 'dusk'
  return 'night'
}

function philippineClock(now: Date) {
  const parts = Object.fromEntries(
    PH_CLOCK_PARTS
      .formatToParts(now)
      .filter(({ type }) => type === 'hour' || type === 'minute')
      .map(({ type, value }) => [type, Number(value)]),
  )
  const hour = parts.hour ?? 0
  const minute = parts.minute ?? 0

  return {
    phase: dayPhaseForHour(hour + minute / 60),
    heroScene: heroSceneForHour(hour + minute / 60),
  }
}

interface Step {
  no: number
  title: string
  body: string
  icon: ReactNode
  color: string
  tags: [string, string]
  footer: string
}

interface SystemStage {
  label: string
  title: string
  body: string
}


const SYSTEM_STAGES: SystemStage[] = [
  {
    label: '01',
    title: 'Discover',
    body: 'Customers compare published shop details, hours, services, and prices before sending a request.',
  },
  {
    label: '02',
    title: 'Request',
    body: 'A service, barber, date, and time become one trackable reservation request.',
  },
  {
    label: '03',
    title: 'Confirm',
    body: 'The shop accepts or declines the request, so everyone sees the same booking status.',
  },
  {
    label: '04',
    title: 'Serve',
    body: 'Chat, cut notes, check-in, and in-progress updates keep the visit clear.',
  },
  {
    label: '05',
    title: 'Complete',
    body: 'An authorized barber or owner marks the service finished and closes the appointment.',
  },
  {
    label: '06',
    title: 'Improve',
    body: 'Only completed visits unlock ratings, history, revenue, and performance insights.',
  },
]


const CUSTOMER_STEPS: Step[] = [
  {
    no: 1,
    title: 'Find the right shop',
    color: '#fbe7a2',
    tags: ['LIVE STATUS', 'NEARBY'],
    footer: 'FIND A CHAIR',
    body: 'Buksan ang app para makita ang published shop details, oras, services, at presyo.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><circle cx="32" cy="32" r="24" fill="#f4efe2" /><line x1="32" y1="32" x2="32" y2="18" /><line x1="32" y1="32" x2="43" y2="38" /></g></svg>
    ),
  },
  {
    no: 2,
    title: 'Book it in one tap',
    color: '#f8cad6',
    tags: ['ONE TAP', 'NO CALLS'],
    footer: 'LOCK THE SLOT',
    body: 'I-tap ang available slot — walang tawag, walang antay sa phone.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><rect x="10" y="14" width="44" height="40" rx="6" fill="#f4efe2" /><line x1="10" y1="26" x2="54" y2="26" /><line x1="22" y1="8" x2="22" y2="18" /><line x1="42" y1="8" x2="42" y2="18" /><path d="M24 40 L30 46 L42 34" stroke="#3f9b62" /></g></svg>
    ),
  },
  {
    no: 3,
    title: 'Sort the details in chat',
    color: '#bee0f1',
    tags: ['DIRECT CHAT', 'CUT NOTES'],
    footer: 'TALK TO THE SHOP',
    body: 'I-message ang barbershop kung anong gupit — fade, trim, o full buzz.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><rect x="8" y="12" width="48" height="32" rx="10" fill="#f4efe2" /><path d="M22 44 L20 56 L34 44" /><circle cx="21" cy="28" r="2.5" fill={INK} /><circle cx="32" cy="28" r="2.5" fill={INK} /><circle cx="43" cy="28" r="2.5" fill={INK} /></g></svg>
    ),
  },
  {
    no: 4,
    title: 'Get a scribbly nudge',
    color: '#c7e7c4',
    tags: ['REMINDER', 'ON TIME'],
    footer: 'HEAD OUT',
    body: 'May paalala bago dumating ang turn mo — sakto lang para makalakad papunta.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><path d="M32 10 Q46 12 46 28 L48 42 L16 42 L18 28 Q18 12 32 10 Z" fill="#f4efe2" /><path d="M27 48 Q32 54 37 48" /><line x1="32" y1="5" x2="32" y2="10" /><path d="M52 14 Q56 20 54 26" strokeWidth="3" /><path d="M12 14 Q8 20 10 26" strokeWidth="3" /></g></svg>
    ),
  },
  {
    no: 5,
    title: 'Strut out and rate the cut',
    color: '#fad4b8',
    tags: ['CUT HISTORY', 'RATE IT'],
    footer: 'LOOK SHARP',
    body: 'Mag-iwan ng doodle-star rating pagkatapos, at naka-save lahat ng cut history mo.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M32 6 L39 23 L57 24 L43 35 L48 53 L32 42 L16 53 L21 35 L7 24 L25 23 Z" fill="#ffd76a" /></g></svg>
    ),
  },
]

const BARBER_STEPS: Step[] = [
  {
    no: 1,
    title: 'Build your shop profile',
    color: '#fbe7a2',
    tags: ['SHOP PROFILE', 'SERVICES'],
    footer: 'SET THE SHOP UP',
    body: 'Ilagay ang shop details, services, presyo, at regular working hours.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M8 27 H56 L52 15 H12 Z" fill="#f8cad6" /><path d="M12 27 V55 H52 V27" fill="#f4efe2" /><path d="M25 55 V38 H39 V55" /><path d="M8 27 Q12 36 20 27 Q24 36 32 27 Q36 36 44 27 Q48 36 56 27" fill="#bee0f1" /></g></svg>
    ),
  },
  {
    no: 2,
    title: 'Set the working day',
    color: '#f8cad6',
    tags: ['LIVE STATUS', 'ACCEPTING'],
    footer: 'GO LIVE',
    body: 'Ayusin ang working hours at shop status para iisa ang malinaw na schedule ng team.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><path d="M32 8 V28" /><path d="M20 16 Q8 24 11 39 Q14 54 32 55 Q50 54 53 39 Q56 24 44 16" fill="#c7e7c4" /><circle cx="32" cy="36" r="3" fill={INK} /></g></svg>
    ),
  },
  {
    no: 3,
    title: 'Watch bookings land',
    color: '#bee0f1',
    tags: ['BOOKINGS', 'DAILY QUEUE'],
    footer: 'PLAN THE DAY',
    body: 'Makikita agad ang confirmed slots at pila para maayos ang takbo ng bawat chair.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="12" y="9" width="40" height="48" rx="6" fill="#f4efe2" /><path d="M22 9 V5 M42 9 V5 M20 22 H44 M21 34 L27 40 L43 27" stroke="#3f9b62" /></g></svg>
    ),
  },
  {
    no: 4,
    title: 'Chat before the cut',
    color: '#c7e7c4',
    tags: ['CUSTOMER CHAT', 'CUT NOTES'],
    footer: 'GET THE DETAILS',
    body: 'Linawin ang style, oras, at special requests bago pa umupo ang customer.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><rect x="8" y="12" width="48" height="32" rx="10" fill="#f4efe2" /><path d="M22 44 L20 56 L34 44" /><circle cx="21" cy="28" r="2.5" fill={INK} /><circle cx="32" cy="28" r="2.5" fill={INK} /><circle cx="43" cy="28" r="2.5" fill={INK} /></g></svg>
    ),
  },
  {
    no: 5,
    title: 'Finish, update, repeat',
    color: '#fad4b8',
    tags: ['CUT HISTORY', 'REVIEWS'],
    footer: 'GROW THE SHOP',
    body: 'Markahan ang tapos na cut, bantayan ang reviews, at balikan ang shop activity.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M10 52 H55 M15 48 L27 36 L36 42 L53 21" /><path d="M43 21 H53 V31" /><path d="M18 12 L22 20 L31 21 L24 27 L26 36 L18 31 L10 36 L12 27 L5 21 L14 20 Z" fill="#ffd76a" strokeWidth="3" /></g></svg>
    ),
  },
]

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [clockNow, setClockNow] = useState(() => new Date())
  const { openLandingAuth } = useOutletContext<LandingOutletContext>()
  const manilaClock = philippineClock(clockNow)
  const dayPhase = manilaClock.phase
  const heroScene = manilaClock.heroScene

  // Ambient scenes are paused when off-screen. The five-step journey itself
  // stays in normal document flow and never runs a scroll-frame JS loop.
  useJourneyScroll(rootRef)

  useEffect(() => {
    const resetHorizontalDrift = () => {
      if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY })
    }
    resetHorizontalDrift()
    window.addEventListener('resize', resetHorizontalDrift)
    return () => window.removeEventListener('resize', resetHorizontalDrift)
  }, [])

  useEffect(() => {
    const updateClock = () => setClockNow(new Date())
    const timer = window.setInterval(updateClock, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const heroVars = { '--accent': ACCENT } as CSSProperties // --walk is set on .phil in CSS

  return (
    <div
      className="phil"
      ref={rootRef}
      style={heroVars}
      data-day-phase={dayPhase}
      data-hero-scene={heroScene}
    >
      <main className="phil-hero-main" style={{ position: 'relative', zIndex: 1 }}>
        <div className="phil-hero-time-scenes" aria-hidden="true">
          <span className="phil-hero-time-scene is-morning" />
          <span className="phil-hero-time-scene is-afternoon" />
          <span className="phil-hero-time-scene is-evening" />
          <span className="phil-hero-time-scene is-midnight" />
        </div>
        <section id="home" className="phil-hero phil-hero-marketing" aria-labelledby="phil-hero-title">
          <div className="phil-hero-copy">
            <span className="phil-hero-kicker">THE LOCAL BARBER BOOKING DESK</span>
            <h1 id="phil-hero-title">
              <strong>Local shops. Clear bookings.</strong>
              <span>Better barber days.</span>
            </h1>
            <p className="phil-hero-lead">
              One place for customers to find a cut, barbers to follow their
              day, and owners to keep the shop moving.
            </p>
            <div className="phil-hero-actions">
              <button
                className="phil-hero-primary"
                type="button"
                aria-haspopup="dialog"
                onClick={() => openLandingAuth('signup')}
              >
                Request a Demo
              </button>
              <a
                className="phil-hero-secondary"
                href="#how"
                aria-label="Watch the Philabantay product walkthrough"
              >
                Watch the Video
              </a>
            </div>
            <p className="phil-hero-login">
              May account ka na?{' '}
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => openLandingAuth('signin')}
              >
                Log in
              </button>
            </p>
          </div>

        </section>

        {/* The hero is intentionally space-only. Keep the legacy street source
            out of the render tree while the city lives in the final chapter. */}
        {false && <div className="phil-street">
          <div className="phil-city-label" aria-hidden="true">Paranaque City</div>
          <Building pos={{ left: '2%', bottom: 136 }} w={110} h={214} body="#e7d9c5" roof="#b8a68c" windows={[{ l: 14, t: 22, w: 24, h: 26 }, { l: 60, t: 22, w: 24, h: 26 }, { l: 14, t: 74, w: 24, h: 26 }, { l: 60, t: 74, w: 24, h: 26 }, { l: 14, t: 126, w: 24, h: 26 }, { l: 60, t: 126, w: 24, h: 26 }]} />
          <Building pos={{ left: '12%', bottom: 136 }} w={88} h={150} body="#d9e2ea" roof="#9fb3c2" windows={[{ l: 12, t: 20, w: 22, h: 24 }, { l: 50, t: 20, w: 22, h: 24 }, { l: 12, t: 66, w: 22, h: 24 }, { l: 50, t: 66, w: 22, h: 24 }]} />
          <Building pos={{ left: '20%', bottom: 136 }} w={72} h={108} body="#f0d8b9" roof="#c59a75" windows={[{ l: 10, t: 18, w: 18, h: 22 }, { l: 42, t: 18, w: 18, h: 22 }, { l: 10, t: 58, w: 18, h: 22 }, { l: 42, t: 58, w: 18, h: 22 }]} />
          <Building pos={{ left: '29%', bottom: 136 }} w={78} h={118} body="#ead9d3" roof="#c9a99f" windows={[{ l: 11, t: 20, w: 20, h: 22 }, { l: 46, t: 20, w: 20, h: 22 }, { l: 11, t: 62, w: 20, h: 22 }, { l: 46, t: 62, w: 20, h: 22 }]} />
          <Building pos={{ left: '38%', bottom: 136 }} w={90} h={168} body="#d5e4d5" roof="#94b294" windows={[{ l: 12, t: 22, w: 22, h: 24 }, { l: 52, t: 22, w: 22, h: 24 }, { l: 12, t: 70, w: 22, h: 24 }, { l: 52, t: 70, w: 22, h: 24 }, { l: 12, t: 116, w: 22, h: 24 }, { l: 52, t: 116, w: 22, h: 24 }]} />
          <Building pos={{ left: '49%', bottom: 136 }} w={82} h={126} body="#eadcc8" roof="#bfa887" windows={[{ l: 11, t: 20, w: 20, h: 22 }, { l: 47, t: 20, w: 20, h: 22 }, { l: 11, t: 62, w: 20, h: 22 }, { l: 47, t: 62, w: 20, h: 22 }]} />
          <Building pos={{ left: '58%', bottom: 136 }} w={104} h={198} body="#d7deea" roof="#94a8c0" windows={[{ l: 13, t: 22, w: 22, h: 24 }, { l: 63, t: 22, w: 22, h: 24 }, { l: 13, t: 70, w: 22, h: 24 }, { l: 63, t: 70, w: 22, h: 24 }, { l: 13, t: 118, w: 22, h: 24 }, { l: 63, t: 118, w: 22, h: 24 }]} />
          <Building pos={{ left: '70%', bottom: 136 }} w={76} h={116} body="#efd2cf" roof="#c59690" windows={[{ l: 10, t: 18, w: 19, h: 23 }, { l: 44, t: 18, w: 19, h: 23 }, { l: 10, t: 60, w: 19, h: 23 }, { l: 44, t: 60, w: 19, h: 23 }]} />
          <Building pos={{ left: '79%', bottom: 136 }} w={86} h={148} body="#e5dfbd" roof="#b9ae76" windows={[{ l: 11, t: 20, w: 21, h: 23 }, { l: 49, t: 20, w: 21, h: 23 }, { l: 11, t: 66, w: 21, h: 23 }, { l: 49, t: 66, w: 21, h: 23 }]} />
          <Building pos={{ right: '1%', bottom: 136 }} w={96} h={176} body="#d9e2ea" roof="#9fb3c2" windows={[{ l: 13, t: 22, w: 22, h: 24 }, { l: 55, t: 22, w: 22, h: 24 }, { l: 13, t: 70, w: 22, h: 24 }, { l: 55, t: 70, w: 22, h: 24 }]} />

          {/* street lamps */}
          <div style={{ position: 'absolute', left: '19%', bottom: 136, width: 4, height: 118, background: INK, borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: '19%', bottom: 246, width: 18, height: 18, marginLeft: -7, borderRadius: '50%', background: '#ffd76a', border: `2.5px solid ${INK}`, boxShadow: '0 0 14px 4px rgba(255,205,90,.7)', animation: 'blink 3.6s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', left: '36%', bottom: 136, width: 4, height: 118, background: INK, borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: '36%', bottom: 246, width: 18, height: 18, marginLeft: -7, borderRadius: '50%', background: '#ffd76a', border: `2.5px solid ${INK}`, boxShadow: '0 0 14px 4px rgba(255,205,90,.7)', animation: 'blink 4.4s ease-in-out infinite' }} />
          <div className="phil-city-lamp phil-city-lamp-right" aria-hidden="true"><span /></div>

          {/* bushes + hydrant */}
          <div style={{ position: 'absolute', left: '9%', bottom: 136, width: 70, height: 38, background: '#a8d8b9', border: `2.5px solid ${INK}`, borderRadius: '35px 35px 0 0' }} />
          <div style={{ position: 'absolute', left: '33.5%', bottom: 136, width: 54, height: 30, background: '#a8d8b9', border: `2.5px solid ${INK}`, borderRadius: '27px 27px 0 0' }} />
          <div className="phil-city-tree phil-city-tree-one" aria-hidden="true"><span /></div>
          <div className="phil-city-tree phil-city-tree-two" aria-hidden="true"><span /></div>
          <div style={{ position: 'absolute', left: '24%', bottom: 136, width: 22, height: 32, background: '#d94f4f', border: `2.5px solid ${INK}`, borderRadius: '8px 8px 2px 2px' }}>
            <div style={{ position: 'absolute', left: 5, top: -8, width: 12, height: 8, background: '#d94f4f', border: `2px solid ${INK}`, borderRadius: '4px 4px 0 0' }} />
          </div>

          {/* road */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, background: '#e9dfcd', borderTop: `3px solid ${INK}`, borderBottom: `2px solid ${INK}` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 16, height: 120, background: '#cbc3b5', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 60, height: 5, background: 'repeating-linear-gradient(90deg,#fdf7ee 0 26px,transparent 26px 56px)' }} />
            {/* blue car — far lane, scaled 1.45, passes BEHIND the taxi */}
            <div style={{ position: 'absolute', left: 0, top: 38, width: 152, height: 66, zIndex: 1, animation: 'carDriveFull 14s linear infinite' }}>
              <div style={{ position: 'absolute', inset: 0, transform: 'scale(1.45)', transformOrigin: '50% 100%' }}>
              <div style={{ position: 'absolute', left: 30, top: 0, width: 66, height: 25, background: '#4f6fd9', border: `3px solid ${INK}`, borderRadius: '14px 14px 0 0' }} />
              <div style={{ position: 'absolute', left: 39, top: 6, width: 20, height: 13, background: '#f4efe2', border: `2px solid ${INK}`, borderRadius: 3 }} />
              <div style={{ position: 'absolute', left: 66, top: 6, width: 20, height: 13, background: '#f4efe2', border: `2px solid ${INK}`, borderRadius: 3 }} />
              <div style={{ position: 'absolute', left: 0, top: 21, width: 146, height: 29, background: '#4f6fd9', border: `3px solid ${INK}`, borderRadius: '8px 20px 6px 6px' }} />
              <div style={{ position: 'absolute', left: 139, top: 28, width: 11, height: 9, background: '#ffd76a', border: `2px solid ${INK}`, borderRadius: 3 }} />
              <div style={{ position: 'absolute', left: 20, top: 38, width: 26, height: 26, borderRadius: '50%', background: '#f4efe2', border: `3px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 3, height: 18, background: INK, borderRadius: 2, animation: 'wheelSpin .5s linear infinite' }} /></div>
              <div style={{ position: 'absolute', left: 100, top: 38, width: 26, height: 26, borderRadius: '50%', background: '#f4efe2', border: `3px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 3, height: 18, background: INK, borderRadius: 2, animation: 'wheelSpin .5s linear infinite' }} /></div>
              </div>
            </div>
            {/* taxi — near lane, scaled 1.45, passes IN FRONT of the blue car */}
            <div style={{ position: 'absolute', left: 0, top: 48, width: 160, height: 70, zIndex: 2, animation: 'carDriveBack 19s linear infinite -7s' }}>
              <div style={{ transform: 'scaleX(-1) scale(1.45)', transformOrigin: '50% 100%', position: 'absolute', inset: 0 }}>
                <div style={{ position: 'absolute', left: 26, top: 0, width: 74, height: 26, background: '#e0913f', border: `3px solid ${INK}`, borderRadius: '12px 12px 0 0' }} />
                <div style={{ position: 'absolute', left: 47, top: -11, width: 34, height: 13, background: '#fdf7ee', border: `2px solid ${INK}`, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Gochi Hand', cursive", fontSize: 10, lineHeight: 1, transform: 'scaleX(-1)' }}>TAXI</div>
                <div style={{ position: 'absolute', left: 35, top: 6, width: 22, height: 14, background: '#f4efe2', border: `2px solid ${INK}`, borderRadius: 3 }} />
                <div style={{ position: 'absolute', left: 65, top: 6, width: 22, height: 14, background: '#f4efe2', border: `2px solid ${INK}`, borderRadius: 3 }} />
                <div style={{ position: 'absolute', left: 0, top: 22, width: 154, height: 30, background: '#e0913f', border: `3px solid ${INK}`, borderRadius: '8px 22px 6px 6px' }} />
                <div style={{ position: 'absolute', left: 12, top: 30, width: 130, height: 6, background: 'repeating-linear-gradient(90deg,#2b2b2b 0 6px,#fdf7ee 6px 12px)', borderRadius: 3 }} />
                <div style={{ position: 'absolute', left: 146, top: 30, width: 11, height: 9, background: '#ffd76a', border: `2px solid ${INK}`, borderRadius: 3 }} />
                <div style={{ position: 'absolute', left: 22, top: 40, width: 26, height: 26, borderRadius: '50%', background: '#f4efe2', border: `3px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 3, height: 18, background: INK, borderRadius: 2, animation: 'wheelSpin .5s linear infinite' }} /></div>
                <div style={{ position: 'absolute', left: 106, top: 40, width: 26, height: 26, borderRadius: '50%', background: '#f4efe2', border: `3px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 3, height: 18, background: INK, borderRadius: 2, animation: 'wheelSpin .5s linear infinite' }} /></div>
              </div>
            </div>
          </div>
        </div>}
      </main>

      <section id="how" className="phil-workflow" aria-labelledby="phil-workflow-title">
        <HowStreetBackdrop />

        {/* One continuous notebook sheet. The How-it-works heading, its three
            chapters, and the feature rows all sit on this single page, so they
            read as one document instead of separate floating cards. The doodle
            wallpaper stays visible in the gutters either side of it. */}
        <div className="phil-notebook">
        <header className="phil-workflow-heading">
          <span>HOW PHILABANTAY WORKS</span>
          <h2 id="phil-workflow-title">One clear flow for every side of the chair.</h2>
          <p>
            Follow the booking from discovery to completion, then see exactly
            what the customer, barber, and shop owner control.
          </p>
        </header>

        <div className="phil-workflow-shell">
          <div className="phil-workflow-content">
            <section
              id="workflow-lifecycle"
              className="phil-workflow-chapter is-lifecycle"
              data-workflow-section
              aria-labelledby="workflow-lifecycle-title"
            >
              <header>
                <span>01 · ONE BOOKING FLOW</span>
                <h3 id="workflow-lifecycle-title">From a published shop to a finished visit.</h3>
                <p>Every status advances the same reservation instead of creating separate versions of the truth.</p>
              </header>
              <ol className="phil-workflow-lifecycle" aria-label="Appointment lifecycle">
                {SYSTEM_STAGES.map((stage, index) => (
                  <li data-reveal key={stage.label} style={{ '--motion-index': index } as CSSProperties}>
                    <span>{stage.label}</span>
                    <div>
                      <h4>{stage.title}</h4>
                      <p>{stage.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section
              id="workflow-customer"
              className="phil-workflow-chapter is-customer"
              data-workflow-section
              aria-labelledby="workflow-customer-title"
            >
              <header>
                <span>02 · CUSTOMER SIDE</span>
                <h3 id="workflow-customer-title">Less guessing before and after the cut.</h3>
                <p>Published shop facts, one booking request, and one place to follow what happens next.</p>
              </header>
              <ol className="phil-workflow-steps">
                {CUSTOMER_STEPS.map((step) => (
                  <li data-reveal key={step.no} style={{ '--step-color': step.color } as CSSProperties}>
                    <div className="phil-workflow-step-icon" aria-hidden="true">{step.icon}</div>
                    <span>STEP {step.no}</span>
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section
              id="workflow-shop"
              className="phil-workflow-chapter is-shop"
              data-workflow-section
              aria-labelledby="workflow-shop-title"
            >
              <header>
                <span>03 · SHOP-SIDE FLOW</span>
                <h3 id="workflow-shop-title">The working day stays owner-authoritative.</h3>
                <p>Barbers see their assigned work while owners keep control of shop facts, staff, and decisions.</p>
              </header>
              <ol className="phil-workflow-steps">
                {BARBER_STEPS.map((step) => (
                  <li data-reveal key={step.no} style={{ '--step-color': step.color } as CSSProperties}>
                    <div className="phil-workflow-step-icon" aria-hidden="true">{step.icon}</div>
                    <span>STEP {step.no}</span>
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                  </li>
                ))}
              </ol>
            </section>

          </div>
        </div>

        {/* Alternating feature rows. Each `RiveScene` currently renders its
            static fallback; pass a `src` once the .riv artwork exists and the
            row animates with no other change. */}
        <section id="services" className="phil-features" aria-labelledby="phil-features-title">
          <h2 id="phil-features-title" className="phil-visually-hidden">
            What Philabantay handles for you
          </h2>

          {LANDING_FEATURES.map((feature, index) => (
            <article
              key={feature.id}
              className={`phil-feature-row${index % 2 === 1 ? ' is-reversed' : ''}`}
              data-reveal=""
            >
              <div className="phil-feature-copy">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <button
                  type="button"
                  className="phil-feature-cta"
                  aria-haspopup="dialog"
                  onClick={() => openLandingAuth(feature.mode)}
                >
                  {feature.cta}
                </button>
              </div>
              <div className="phil-feature-art">
                <RiveScene
                  src={feature.riveSrc}
                  stateMachine={feature.riveStateMachine}
                  label={feature.sceneLabel}
                  fallback={<FeatureGlyph kind={feature.id} />}
                />
              </div>
            </article>
          ))}
        </section>
        </div>

        {/* Centered closing band: one heading, one line of context, one action,
            then a wide scene. Swap in a .riv via `src` when the artwork lands. */}
        <section id="contact" className="phil-cta-band" aria-labelledby="phil-contact-title">
          <div className="phil-cta-copy">
            <h2 id="phil-contact-title">Bring the whole barber day into one clear desk.</h2>
            <p>
              Set up your shop, or log in to pick up where your last cut left off.
            </p>
            <button
              type="button"
              className="phil-cta-button"
              aria-haspopup="dialog"
              onClick={() => openLandingAuth('signup')}
            >
              Create your shop account
            </button>
            <p className="phil-cta-alt">
              May account ka na?{' '}
              <button type="button" aria-haspopup="dialog" onClick={() => openLandingAuth('signin')}>
                Log in
              </button>
            </p>
          </div>
          <div className="phil-cta-scene">
            <RiveScene
              label="A barbershop counter with the day's bookings in view"
              fallback={<CtaBandGlyph />}
            />
          </div>
        </section>

        {/* Every destination here is a route or anchor that actually exists.
            No blog, careers, or policy columns until those pages are real. */}
        <footer className="phil-footer">
          <div className="phil-footer-top">
            <div className="phil-footer-brand">
              <span className="phil-footer-mark">
                <span className="brand-pole" aria-hidden="true" />
                Philabantay
              </span>
              <p>The local barber booking desk. Real shop facts, one clear booking.</p>
            </div>

            <nav className="phil-footer-nav" aria-label="Footer">
              <div>
                <h2>Product</h2>
                <ul>
                  <li><a href="#how">How it works</a></li>
                  <li><a href="#services">What it handles</a></li>
                                  </ul>
              </div>
              <div>
                <h2>Account</h2>
                <ul>
                  <li><Link to="/login">Log in</Link></li>
                  <li><Link to="/signup">Create an account</Link></li>
                </ul>
              </div>
              <div>
                <h2>Get in touch</h2>
                <ul>
                  <li><a href="#contact">Request a demo</a></li>
                </ul>
              </div>
            </nav>
          </div>

          <p className="phil-footer-legal">
            © {new Date().getFullYear()} Philabantay. Built for Philippine barbershops.
          </p>
        </footer>

      </section>
    </div>
  )
}

export function JourneyGuide({
  tone,
  eyebrow,
  title,
  description,
  steps,
}: {
  tone: 'customer' | 'shop'
  eyebrow: string
  title: string
  description: string
  steps: Step[]
}) {
  return (
    <section className={`phil-journey-guide is-${tone}`} aria-labelledby={`phil-${tone}-journey-title`}>
      <header data-reveal>
        <span>{eyebrow}</span>
        <h2 id={`phil-${tone}-journey-title`}>{title}</h2>
        <p>{description}</p>
      </header>
      <ol className="phil-journey-list">
        {steps.map((step) => (
          <li
            data-reveal
            key={step.no}
            style={{ '--step-color': step.color, '--motion-index': step.no } as CSSProperties}
          >
            <div className="phil-journey-step-icon" aria-hidden="true">{step.icon}</div>
            <div className="phil-journey-step-copy">
              <span>STEP {step.no} · {step.footer}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** One lightweight sky layer stays pinned behind the compact workflow guide. */
function HowStreetBackdrop() {
  return (
    <div className="phil-how-neighborhood" aria-hidden="true">
      <div className="phil-sky-cloud phil-sky-cloud-one" />
      <div className="phil-sky-balloon">
        <svg viewBox="0 0 100 150">
          <g stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M50 8 C20 8 8 30 13 57 C18 84 34 101 50 112 C66 101 82 84 87 57 C92 30 80 8 50 8 Z" fill="#f4b8c4" />
            <path d="M50 10 C35 22 32 77 50 109 C68 77 65 22 50 10 Z" fill="#fbe7a2" />
            <path d="M18 53 H82" fill="none" opacity=".45" />
            <path d="M37 107 L32 126 M63 107 L68 126" fill="none" />
            <path d="M29 125 H71 L66 143 H34 Z" fill="#c99563" />
          </g>
        </svg>
      </div>
      <div className="phil-sky-birds phil-sky-birds-one">
        <svg viewBox="0 0 180 55"><path d="M5 35 Q22 14 39 35 Q56 14 73 35 M96 29 Q109 12 123 29 Q137 12 153 29" /></svg>
      </div>
    </div>
  )
}

/**
 * Static artwork behind each feature row. These are the honest baseline the
 * page reads with when motion is reduced or a `.riv` file has not been supplied
 * yet, so they must stand on their own rather than look like a loading state.
 */
function FeatureGlyph({ kind }: { kind: FeatureId }) {
  const stroke = { fill: 'none', stroke: INK, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false" className="phil-feature-glyph">
      <circle cx="100" cy="100" r="86" fill={kind === 'schedule' ? '#e8f4f6' : '#fdeef1'} />
      {kind === 'booking' && (
        <g {...stroke}>
          <rect x="52" y="46" width="96" height="112" rx="10" fill="#fff" />
          <path d="M68 78h64M68 100h64M68 122h40" />
          <circle cx="140" cy="140" r="24" fill={ACCENT} />
          <path d="M130 140l7 7 13-14" stroke="#fff" strokeWidth="3.4" />
        </g>
      )}
      {kind === 'schedule' && (
        <g {...stroke}>
          <rect x="42" y="56" width="116" height="94" rx="10" fill="#fff" />
          <path d="M42 82h116M72 56v-12M128 56v-12" />
          <rect x="58" y="96" width="26" height="16" rx="4" fill="#bfe4ea" />
          <rect x="92" y="96" width="26" height="16" rx="4" fill="#bfe4ea" />
          <rect x="58" y="122" width="26" height="16" rx="4" fill={ACCENT} />
          <path d="M126 130l7 7 14-15" strokeWidth="3.4" />
        </g>
      )}
      {kind === 'facts' && (
        <g {...stroke}>
          <path d="M56 152V84l44-30 44 30v68z" fill="#fff" />
          <path d="M84 152v-34h32v34" />
          <path d="M74 100h16M110 100h16" />
          <circle cx="148" cy="62" r="18" fill={ACCENT} />
          <path d="M148 54v9l6 4" stroke="#fff" strokeWidth="3.2" />
        </g>
      )}
    </svg>
  )
}

/** Wide static scene for the closing band, in the same doodle vocabulary. */
function CtaBandGlyph() {
  const stroke = { fill: 'none', stroke: INK, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 420 180" aria-hidden="true" focusable="false" className="phil-cta-glyph">
      <rect x="18" y="112" width="384" height="8" rx="4" fill="#cfe8ec" />
      <g {...stroke}>
        <rect x="42" y="42" width="128" height="70" rx="8" fill="#fff" />
        <path d="M58 62h96M58 78h96M58 94h60" />
        <rect x="196" y="26" width="92" height="86" rx="8" fill="#fff" />
        <path d="M212 48h60M212 66h60M212 84h36" />
        <circle cx="266" cy="96" r="12" fill={ACCENT} />
        <path d="M260 96l4 4 8-8" stroke="#fff" strokeWidth="2.8" />
        <rect x="316" y="54" width="62" height="58" rx="8" fill="#fff" />
        <path d="M330 72h34M330 88h22" />
        <path d="M347 54V34" />
        <circle cx="347" cy="28" r="7" fill="#9fdbe4" />
      </g>
    </svg>
  )
}
