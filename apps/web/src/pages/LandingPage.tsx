import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { heroSceneForHour } from '../lib/philippineHeroTime'
import { useJourneyScroll } from './useJourneyScroll'
import './LandingPage.css'

const ACCENT = '#f4b8c4'

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
      </main>
    </div>
  )
}
