import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AuthSlider } from '../components/AuthSlider'
import { WalkFigure } from '../components/WalkFigure'
import { Storefront, Building } from '../components/Storefront'
import { useJourneyScroll } from './useJourneyScroll'
import './LandingPage.css'

const ACCENT = '#f4b8c4'
const INK = '#2b2b2b'

type DayPhase = 'morning' | 'afternoon' | 'dusk' | 'night'

function localDayPhase(now = new Date()): DayPhase {
  const hour = now.getHours() + now.getMinutes() / 60
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 19.5) return 'dusk'
  return 'night'
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

interface CapabilityGroup {
  role: string
  eyebrow: string
  color: string
  items: string[]
}

const SYSTEM_STAGES: SystemStage[] = [
  {
    label: '01',
    title: 'Discover',
    body: 'Customers compare nearby shops, hours, services, prices, and live chair availability.',
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

const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    role: 'Customers',
    eyebrow: 'FIND, BOOK, FOLLOW',
    color: '#fbe7a2',
    items: [
      'Find shops, services, prices, barbers, and open slots',
      'Book once, then follow the reservation status and reminders',
      'Chat, keep cut history, and rate only after a completed visit',
    ],
  },
  {
    role: 'Barbers',
    eyebrow: 'PLAN, SERVE, FINISH',
    color: '#bee0f1',
    items: [
      'See reservations, shifts, exceptions, and attendance',
      'Keep cut notes and move visits through the correct status',
      'Track completed cuts, ratings, and performance signals',
    ],
  },
  {
    role: 'Shop owners',
    eyebrow: 'OPERATE, SUPPORT, GROW',
    color: '#f8cad6',
    items: [
      'Set up the shop, hours, services, prices, and staff',
      'Manage reservations, assignments, attendance, and messages',
      'Review revenue, visitors, services, ratings, and staff reports',
    ],
  },
]

const CUSTOMER_STEPS: Step[] = [
  {
    no: 1,
    title: 'Spot a free chair',
    color: '#fbe7a2',
    tags: ['LIVE STATUS', 'NEARBY'],
    footer: 'FIND A CHAIR',
    body: 'Buksan ang app, makikita agad kung sinong barbershop ang bukas o may pila.',
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
    title: 'Switch your chair on',
    color: '#f8cad6',
    tags: ['LIVE STATUS', 'ACCEPTING'],
    footer: 'GO LIVE',
    body: 'I-on ang shift at accepting bookings para alam ng customers na may libreng upuan.',
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
  const location = useLocation()
  const [dayPhase, setDayPhase] = useState<DayPhase>(() => localDayPhase())
  // /login and /signup redirect here carrying the desired form mode + `from`.
  const navState = location.state as { authMode?: 'signin' | 'signup'; from?: string } | null

  // Ambient scenes are paused when off-screen. The five-step journey itself
  // stays in normal document flow and never runs a scroll-frame JS loop.
  useJourneyScroll(rootRef)

  useEffect(() => {
    const updatePhase = () => setDayPhase(localDayPhase())
    const timer = window.setInterval(updatePhase, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const heroVars = { '--accent': ACCENT } as CSSProperties // --walk is set on .phil in CSS

  return (
    <div className="phil" ref={rootRef} style={heroVars} data-day-phase={dayPhase}>
      <main className="phil-hero-main" style={{ position: 'relative', zIndex: 1 }}>
        <SpaceDoodleBackdrop />
        <section className="phil-hero phil-hero-auth">
          {/* The auth slider IS the billboard now — one form, front and center. */}
          <div className="phil-billboard-col phil-billboard-col-wide phil-auth-station-wrap">
            <AuthSlider
              initialMode={navState?.authMode ?? 'signin'}
              from={navState?.from ?? '/dashboard'}
            />
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

      {/* How it works */}
      <section id="how" className="phil-how">
        <HowStreetBackdrop />

        <div className="phil-how-title">
          <div className="phil-how-label">how Philabantay works</div>
          <h2>One booking, clear from search<br />to finished cut.</h2>
        </div>

        <ol className="phil-system-lifecycle" aria-label="Appointment lifecycle">
          {SYSTEM_STAGES.map((stage, index) => (
            <li data-reveal key={stage.label} style={{ '--motion-index': index } as CSSProperties}>
              <span>{stage.label}</span>
              <div>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="phil-role-journeys">
          <JourneyGuide
            tone="customer"
            eyebrow="FOR THE PERSON IN THE CHAIR"
            title="The customer journey"
            description="From finding a real opening to reviewing a finished cut."
            steps={CUSTOMER_STEPS}
          />
          <JourneyGuide
            tone="shop"
            eyebrow="FOR BARBERS AND OWNERS"
            title="The shop-side workflow"
            description="From setting up the shop to serving, closing, and learning from each visit."
            steps={BARBER_STEPS}
          />
        </div>

        <section className="phil-capabilities" aria-labelledby="phil-capabilities-title">
          <header>
            <span>WHAT THE SYSTEM HANDLES</span>
            <h2 id="phil-capabilities-title">Useful before, during, and after every cut.</h2>
            <p>Each role gets the tools it needs without exposing another shop&apos;s work.</p>
          </header>
          <div className="phil-capability-grid">
            {CAPABILITY_GROUPS.map((group, index) => (
              <article
                data-reveal
                key={group.role}
                style={{ '--capability-color': group.color, '--motion-index': index } as CSSProperties}
              >
                <span>{group.eyebrow}</span>
                <h3>{group.role}</h3>
                <ul>
                  {group.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* The shop itself closes the page — walk in scruffy, walk out sharp. */}
        <div className="phil-shopfront-outro">
          <Storefront fullBleed />
        </div>
      </section>
    </div>
  )
}

function JourneyGuide({
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

function SpaceDoodleBackdrop() {
  return (
    <div className="phil-space-world" aria-hidden="true">
      <div className="phil-space-moon"><span /></div>
      <div className="phil-space-planet phil-space-planet-one"><span /></div>
      <div className="phil-space-planet phil-space-planet-two"><span /></div>
      <div className="phil-space-galaxy phil-space-galaxy-one">
        <i /><i /><i />
      </div>
      <div className="phil-space-galaxy phil-space-galaxy-two">
        <i /><i /><i />
      </div>
      <div className="phil-space-meteors">
        <i /><i /><i /><i />
      </div>
      <div className="phil-space-astronaut phil-space-astronaut-one">
        <WalkFigure
          view="front"
          walking={false}
          showGround={false}
          showMotionLines={false}
          costume="astronaut"
          hairStyle="curly"
          hair="#3f3029"
          skin="#d69b74"
          shirt="#f5f7fa"
          pants="#dbe7f2"
        />
      </div>
      <div className="phil-space-astronaut phil-space-astronaut-two">
        <WalkFigure
          view="front"
          walking={false}
          showGround={false}
          showMotionLines={false}
          costume="astronaut"
          hairStyle="bob"
          hair="#302a28"
          skin="#e0ad86"
          shirt="#f5f7fa"
          pants="#dbe7f2"
        />
      </div>
      <div className="phil-space-ship">
        <svg viewBox="0 0 210 100">
          <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
            <path d="M30 58 Q86 8 177 31 L199 51 Q126 83 35 72 Z" fill="#f8f5eb" />
            <path d="M73 43 Q96 9 128 30 L136 43 Z" fill="#8ecce6" />
            <path d="M36 59 L8 43 L19 71 Z" fill="#f4b8c4" />
            <circle cx="94" cy="55" r="8" fill="#ffd76a" />
            <circle cx="122" cy="51" r="8" fill="#9c87d8" />
            <circle cx="150" cy="47" r="8" fill="#6fc1c9" />
          </g>
        </svg>
      </div>
      <svg className="phil-space-constellation" viewBox="0 0 220 120">
        <path d="M18 83 L55 41 L98 64 L139 24 L194 56" />
        {[['18','83'], ['55','41'], ['98','64'], ['139','24'], ['194','56']].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" />
        ))}
      </svg>
      <div className="phil-space-horizon" />
    </div>
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
      {false && <>
      <div className="phil-how-sidewalk phil-how-sidewalk-top"><span /></div>
      <div className="phil-how-sidewalk phil-how-sidewalk-middle"><span /></div>

      <div className="phil-how-building-group phil-how-building-group-left">
        <Building
          pos={{ left: 18, top: 96 }}
          w={126}
          h={214}
          body="#dfd1bd"
          roof="#a89478"
          windows={[
            { l: 15, t: 25, w: 24, h: 26 }, { l: 78, t: 25, w: 24, h: 26 },
            { l: 15, t: 80, w: 24, h: 26 }, { l: 78, t: 80, w: 24, h: 26 },
            { l: 15, t: 135, w: 24, h: 26 }, { l: 78, t: 135, w: 24, h: 26 },
          ]}
        />
        <Building
          pos={{ left: 132, top: 164 }}
          w={98}
          h={146}
          body="#d5e3ec"
          roof="#93aebf"
          windows={[
            { l: 13, t: 24, w: 22, h: 24 }, { l: 57, t: 24, w: 22, h: 24 },
            { l: 13, t: 75, w: 22, h: 24 }, { l: 57, t: 75, w: 22, h: 24 },
          ]}
        />
      </div>

      <div className="phil-how-building-group phil-how-building-group-right">
        <Building
          pos={{ right: 20, top: 92 }}
          w={132}
          h={218}
          body="#d8dfea"
          roof="#929fb9"
          windows={[
            { l: 16, t: 25, w: 24, h: 26 }, { l: 81, t: 25, w: 24, h: 26 },
            { l: 16, t: 82, w: 24, h: 26 }, { l: 81, t: 82, w: 24, h: 26 },
            { l: 16, t: 139, w: 24, h: 26 }, { l: 81, t: 139, w: 24, h: 26 },
          ]}
        />
        <Building
          pos={{ right: 140, top: 155 }}
          w={102}
          h={155}
          body="#eddfbd"
          roof="#bcae77"
          windows={[
            { l: 13, t: 24, w: 23, h: 25 }, { l: 61, t: 24, w: 23, h: 25 },
            { l: 13, t: 77, w: 23, h: 25 }, { l: 61, t: 77, w: 23, h: 25 },
          ]}
        />
      </div>

      <div className="phil-how-walker phil-how-walker-one">
        <WalkFigure
          hairStyle="curly"
          hair="#3f3029"
          shirt="#4f6fd9"
          pants="#3a4668"
          skin="#d69b74"
          showMotionLines={false}
          showGround={false}
        />
      </div>
      <div className="phil-how-walker phil-how-walker-two">
        <WalkFigure
          direction="left"
          hairStyle="bob"
          hair="#2f2926"
          shirt="#d94f4f"
          pants="#6b4a3a"
          skin="#e0ad86"
          showMotionLines={false}
          showGround={false}
        />
      </div>
      <div className="phil-how-walker phil-how-walker-three">
        <WalkFigure
          hairStyle="low-fade"
          hair="#2f2926"
          shirt="#3f9b62"
          pants="#4a5d3a"
          skin="#a96f50"
          showMotionLines={false}
          showGround={false}
          fresh
        />
      </div>
      <div className="phil-how-walker phil-how-walker-four">
        <WalkFigure
          direction="left"
          hairStyle="spiky"
          hair="#2f2926"
          shirt="#e0913f"
          pants="#7a4a68"
          skin="#c98762"
          showMotionLines={false}
          showGround={false}
        />
      </div>
      </>}
      {false && <><JourneyCityBackdrop /><JourneyDoodles /><ScatterDoodles /></>}
    </div>
  )
}

function JourneyCityBackdrop() {
  return (
    <div className="phil-journey-city" aria-hidden="true">
      <div className="phil-journey-city-row phil-journey-city-row-one">
        <div className="phil-journey-skyline">
          <Building
            pos={{ left: 18, bottom: 76 }}
            w={118}
            h={188}
            body="#d5e3ec"
            roof="#93aebf"
            windows={[
              { l: 14, t: 24, w: 22, h: 24 }, { l: 70, t: 24, w: 22, h: 24 },
              { l: 14, t: 76, w: 22, h: 24 }, { l: 70, t: 76, w: 22, h: 24 },
              { l: 14, t: 128, w: 22, h: 24 }, { l: 70, t: 128, w: 22, h: 24 },
            ]}
          />
          <Building
            pos={{ left: 122, bottom: 76 }}
            w={92}
            h={132}
            body="#ead7d1"
            roof="#c5a29a"
            windows={[
              { l: 12, t: 23, w: 20, h: 23 }, { l: 52, t: 23, w: 20, h: 23 },
              { l: 12, t: 72, w: 20, h: 23 }, { l: 52, t: 72, w: 20, h: 23 },
            ]}
          />
          <Building
            pos={{ right: 22, bottom: 76 }}
            w={124}
            h={202}
            body="#eddfbd"
            roof="#bcae77"
            windows={[
              { l: 15, t: 25, w: 23, h: 25 }, { l: 76, t: 25, w: 23, h: 25 },
              { l: 15, t: 80, w: 23, h: 25 }, { l: 76, t: 80, w: 23, h: 25 },
              { l: 15, t: 135, w: 23, h: 25 }, { l: 76, t: 135, w: 23, h: 25 },
            ]}
          />
          <span className="phil-journey-city-tree phil-journey-city-tree-one" />
          <span className="phil-journey-city-lamp phil-journey-city-lamp-one" />
        </div>
        <div className="phil-journey-road"><span /></div>
        <div className="phil-journey-city-walker is-right">
          <WalkFigure
            hairStyle="messy"
            hair="#3f3029"
            shirt="#4f6fd9"
            pants="#3a4668"
            skin="#d69b74"
            showGround={false}
            showMotionLines={false}
          />
        </div>
      </div>

      <div className="phil-journey-city-row phil-journey-city-row-two">
        <div className="phil-journey-skyline">
          <Building
            pos={{ left: 10, bottom: 76 }}
            w={106}
            h={158}
            body="#dbe6d5"
            roof="#99b38f"
            windows={[
              { l: 13, t: 24, w: 22, h: 24 }, { l: 62, t: 24, w: 22, h: 24 },
              { l: 13, t: 76, w: 22, h: 24 }, { l: 62, t: 76, w: 22, h: 24 },
            ]}
          />
          <Building
            pos={{ right: 112, bottom: 76 }}
            w={98}
            h={140}
            body="#dfd1bd"
            roof="#a89478"
            windows={[
              { l: 13, t: 24, w: 21, h: 23 }, { l: 57, t: 24, w: 21, h: 23 },
              { l: 13, t: 73, w: 21, h: 23 }, { l: 57, t: 73, w: 21, h: 23 },
            ]}
          />
          <Building
            pos={{ right: 18, bottom: 76 }}
            w={102}
            h={186}
            body="#d8dfea"
            roof="#929fb9"
            windows={[
              { l: 13, t: 24, w: 22, h: 24 }, { l: 60, t: 24, w: 22, h: 24 },
              { l: 13, t: 77, w: 22, h: 24 }, { l: 60, t: 77, w: 22, h: 24 },
              { l: 13, t: 130, w: 22, h: 24 }, { l: 60, t: 130, w: 22, h: 24 },
            ]}
          />
          <span className="phil-journey-city-tree phil-journey-city-tree-two" />
          <span className="phil-journey-city-lamp phil-journey-city-lamp-two" />
        </div>
        <div className="phil-journey-road"><span /></div>
        <div className="phil-journey-city-walker is-left">
          <WalkFigure
            direction="left"
            hairStyle="bob"
            hair="#2f2926"
            shirt="#d94f4f"
            pants="#6b4a3a"
            skin="#e0ad86"
            showGround={false}
            showMotionLines={false}
          />
        </div>
      </div>

      <div className="phil-journey-city-row phil-journey-city-row-three">
        <div className="phil-journey-skyline">
          <Building
            pos={{ left: 20, bottom: 76 }}
            w={126}
            h={204}
            body="#eadcc8"
            roof="#bfa887"
            windows={[
              { l: 15, t: 25, w: 23, h: 25 }, { l: 77, t: 25, w: 23, h: 25 },
              { l: 15, t: 81, w: 23, h: 25 }, { l: 77, t: 81, w: 23, h: 25 },
              { l: 15, t: 137, w: 23, h: 25 }, { l: 77, t: 137, w: 23, h: 25 },
            ]}
          />
          <Building
            pos={{ left: 134, bottom: 76 }}
            w={88}
            h={136}
            body="#efd2cf"
            roof="#c59690"
            windows={[
              { l: 11, t: 23, w: 20, h: 23 }, { l: 50, t: 23, w: 20, h: 23 },
              { l: 11, t: 72, w: 20, h: 23 }, { l: 50, t: 72, w: 20, h: 23 },
            ]}
          />
          <Building
            pos={{ right: 24, bottom: 76 }}
            w={118}
            h={174}
            body="#d5e4d5"
            roof="#94b294"
            windows={[
              { l: 14, t: 24, w: 22, h: 24 }, { l: 70, t: 24, w: 22, h: 24 },
              { l: 14, t: 77, w: 22, h: 24 }, { l: 70, t: 77, w: 22, h: 24 },
              { l: 14, t: 128, w: 22, h: 24 }, { l: 70, t: 128, w: 22, h: 24 },
            ]}
          />
          <span className="phil-journey-city-tree phil-journey-city-tree-three" />
          <span className="phil-journey-city-lamp phil-journey-city-lamp-three" />
        </div>
        <div className="phil-journey-road"><span /></div>
        <div className="phil-journey-city-walker is-right is-late">
          <WalkFigure
            hairStyle="taper-fade"
            hair="#2f2926"
            shirt="#3f9b62"
            pants="#4a5d3a"
            skin="#a96f50"
            showGround={false}
            showMotionLines={false}
            fresh
          />
        </div>
      </div>
    </div>
  )
}

function JourneyDoodles() {
  return (
    <div className="phil-journey-doodles" aria-hidden="true">
      <div data-anim="doodle" data-depth="16" className="phil-journey-doodle phil-route-cloud phil-route-cloud-one">
        <div className="phil-cloud-float">
          <svg viewBox="0 0 150 82">
            <path d="M24 65 C8 63 7 42 23 36 C25 17 48 12 61 25 C72 4 108 10 111 36 C132 33 143 48 135 63 C132 69 122 72 111 72 H27 C19 72 15 69 24 65 Z" fill="#fffdf8" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
            <path d="M45 50 q8 7 16 0 M91 50 q8 7 16 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
            <circle cx="38" cy="56" r="5" fill="#f8cad6" opacity=".75" />
            <circle cx="116" cy="56" r="5" fill="#f8cad6" opacity=".75" />
          </svg>
        </div>
      </div>

      <div data-anim="doodle" data-depth="22" className="phil-journey-doodle phil-route-sun">
        <div className="phil-sun-spin">
          <svg viewBox="0 0 120 120">
            <g stroke={INK} strokeWidth="4" strokeLinecap="round">
              <path d="M60 4 V18 M60 102 V116 M4 60 H18 M102 60 H116 M20 20 L30 30 M90 90 L100 100 M100 20 L90 30 M30 90 L20 100" />
              <circle cx="60" cy="60" r="35" fill="#ffd76a" />
              <path d="M44 54 q5 -5 10 0 M66 54 q5 -5 10 0 M48 72 q12 10 24 0" fill="none" />
            </g>
            <circle cx="40" cy="66" r="5" fill="#f4b8c4" opacity=".8" />
            <circle cx="80" cy="66" r="5" fill="#f4b8c4" opacity=".8" />
          </svg>
        </div>
      </div>

      <div data-anim="doodle" data-depth="18" className="phil-journey-doodle phil-route-cloud phil-route-cloud-two">
        <div className="phil-cloud-float phil-cloud-float-late">
          <svg viewBox="0 0 130 70">
            <path d="M17 56 C3 52 7 35 21 32 C25 12 48 10 58 24 C71 5 101 13 102 35 C121 33 128 48 118 58 H20 Z" fill="#fffdf8" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
            <path d="M41 45 q6 5 12 0 M76 45 q6 5 12 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function ScatterDoodles() {
  return (
    <>
      <div data-anim="doodle" data-depth="50" style={{ position: 'absolute', left: -30, top: 70 }}>
        <div style={{ animation: 'wobble 3.2s ease-in-out infinite alternate' }}>
          <svg width="70" height="30" viewBox="0 0 70 30"><g stroke={INK} strokeWidth="3" strokeLinecap="round"><rect x="2" y="4" width="66" height="10" rx="5" fill="#f4efe2" /><line x1="10" y1="14" x2="10" y2="26" /><line x1="19" y1="14" x2="19" y2="26" /><line x1="28" y1="14" x2="28" y2="26" /><line x1="37" y1="14" x2="37" y2="26" /><line x1="46" y1="14" x2="46" y2="26" /><line x1="55" y1="14" x2="55" y2="26" /></g></svg>
        </div>
      </div>
      <div data-anim="doodle" data-depth="70" style={{ position: 'absolute', right: -20, top: 150 }}>
        <div style={{ animation: 'floatY 3.6s ease-in-out infinite alternate' }}>
          <svg width="64" height="40" viewBox="0 0 64 40"><g stroke={INK} strokeWidth="3" strokeLinejoin="round"><path d="M6 6 L28 16 L28 24 L6 34 Z" fill={ACCENT} /><path d="M58 6 L36 16 L36 24 L58 34 Z" fill={ACCENT} /><rect x="26" y="13" width="12" height="14" rx="3" fill="#fdf7ee" /></g></svg>
        </div>
      </div>
      <div data-anim="doodle" data-depth="35" style={{ position: 'absolute', left: -55, top: '44%' }}>
        <div style={{ animation: 'wobble 4.2s ease-in-out infinite alternate' }}>
          <svg width="54" height="54" viewBox="0 0 54 54"><path d="M27 27 Q31 23 27 19 Q21 15 15 21 Q9 29 17 37 Q27 45 39 37 Q49 27 43 15" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" /></svg>
        </div>
      </div>
      <div data-anim="doodle" data-depth="60" style={{ position: 'absolute', right: -40, top: '38%' }}>
        <div style={{ animation: 'sparkle 2.4s ease-in-out infinite' }}>
          <svg width="40" height="40" viewBox="0 0 40 40"><g stroke={INK} strokeWidth="3.5" strokeLinecap="round"><line x1="20" y1="4" x2="20" y2="36" /><line x1="4" y1="20" x2="36" y2="20" /><line x1="9" y1="9" x2="14" y2="14" /><line x1="31" y1="9" x2="26" y2="14" /><line x1="9" y1="31" x2="14" y2="26" /><line x1="31" y1="31" x2="26" y2="26" /></g></svg>
        </div>
      </div>
      <div data-anim="doodle" data-depth="55" style={{ position: 'absolute', right: '3%', bottom: 80 }}>
        <div style={{ animation: 'wobble 3.8s ease-in-out infinite alternate' }}>
          <svg width="60" height="60" viewBox="0 0 60 60"><g stroke={INK} strokeWidth="3" strokeLinecap="round"><rect x="8" y="34" width="34" height="12" rx="6" fill="#8d7260" transform="rotate(-35 25 40)" /><rect x="28" y="10" width="26" height="14" rx="3" fill="#f4efe2" transform="rotate(-35 41 17)" /></g></svg>
        </div>
      </div>
      {/* extra sprinkles */}
      <div data-anim="doodle" data-depth="42" style={{ position: 'absolute', left: '11%', top: '24%' }}>
        <div style={{ animation: 'floatY 3.4s ease-in-out infinite alternate' }}>
          <svg width="44" height="56" viewBox="0 0 44 56"><g stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="10" y="22" width="20" height="28" rx="5" fill="#bee0f1" /><path d="M14 22 v-6 h10 v6" fill="#f4efe2" /><path d="M24 16 h8 l-2 6" fill="#f4efe2" /><line x1="36" y1="10" x2="41" y2="7" /><line x1="37" y1="16" x2="43" y2="16" /><line x1="36" y1="22" x2="41" y2="25" /></g></svg>
        </div>
      </div>
      <div data-anim="doodle" data-depth="65" style={{ position: 'absolute', right: '9%', top: '58%' }}>
        <div style={{ animation: 'wobble 3.5s ease-in-out infinite alternate' }}>
          <svg width="22" height="48" viewBox="0 0 22 48"><rect x="2" y="2" width="18" height="44" rx="9" fill="#f6efe4" stroke={INK} strokeWidth="2.5" /><line x1="4" y1="12" x2="18" y2="20" stroke="#d94f4f" strokeWidth="4" strokeLinecap="round" /><line x1="4" y1="20" x2="18" y2="28" stroke="#4f6fd9" strokeWidth="4" strokeLinecap="round" /><line x1="4" y1="28" x2="18" y2="36" stroke="#d94f4f" strokeWidth="4" strokeLinecap="round" /></svg>
        </div>
      </div>
      <div data-anim="doodle" data-depth="38" style={{ position: 'absolute', left: '8%', top: '12%' }}>
        <div style={{ animation: 'sparkle 2.8s ease-in-out infinite' }}>
          <svg width="40" height="40" viewBox="0 0 40 40"><path d="M20 3 l4.6 9.8 10.4 1 -7.8 7 2.3 10.5 -9.5 -6 -9.5 6 2.3 -10.5 -7.8 -7 10.4 -1 z" fill="#ffd76a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" /></svg>
        </div>
      </div>
    </>
  )
}
