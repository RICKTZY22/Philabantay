import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Building } from '../components/Storefront'
import { heroSceneForHour } from '../lib/philippineHeroTime'
import { useJourneyScroll } from './useJourneyScroll'
import './LandingPage.css'

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

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [clockNow, setClockNow] = useState(() => new Date())
  const manilaClock = philippineClock(clockNow)
  const dayPhase = manilaClock.phase
  const heroScene = manilaClock.heroScene

  // Pauses the hero scene while the tab is hidden or the section is scrolled
  // out of view. Still worth keeping now that the hero is the only section:
  // its time-of-day artwork animates continuously otherwise.
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
              <Link className="phil-hero-primary" to="/signup">
                Request a Demo
              </Link>
            </div>
            <p className="phil-hero-login">
              May account ka na?{' '}
              <Link to="/login">Log in</Link>
            </p>
          </div>

        </section>

        {/* The hero is intentionally space-only. This is the legacy street
            source, kept out of the render tree rather than deleted. Nothing
            renders it today: the marketing sections below the hero were
            removed, so this is the only surviving copy of the city artwork. */}
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
    </div>
  )
}
