import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SHOP_NAME } from '@barbershop/shared'
import { CurtainLink } from '../components/CurtainTransition'
import './LandingPage.css'

gsap.registerPlugin(ScrollTrigger)

const COLORS = ['#4f6fd9', '#d94f4f', '#3f9b62', '#e0913f', '#8e5fc9', '#3aa6a6']
const PANTS = ['#3a4668', '#6b4a3a', '#4a5d3a', '#7a4a68']
const ACCENT = '#f4b8c4'
const INK = '#2b2b2b'
const EASE = 'cubic-bezier(.37,0,.63,1)'

const vis = (on: boolean): CSSProperties => ({ visibility: on ? 'visible' : 'hidden' })

interface Win { l: number; t: number; w: number; h: number }
function Building({
  pos,
  w,
  h,
  body,
  roof,
  windows,
}: {
  pos: CSSProperties
  w: number
  h: number
  body: string
  roof: string
  windows: Win[]
}) {
  return (
    <div style={{ position: 'absolute', width: w, height: h, background: body, border: `3px solid ${INK}`, borderRadius: '6px 6px 0 0', ...pos }}>
      <div style={{ position: 'absolute', left: -6, top: -14, right: -6, height: 12, background: roof, border: `2.5px solid ${INK}`, borderRadius: 4 }} />
      {windows.map((wd, i) => (
        <div key={i} style={{ position: 'absolute', left: wd.l, top: wd.t, width: wd.w, height: wd.h, background: '#f4efe2', border: `2.5px solid ${INK}`, borderRadius: 3 }} />
      ))}
    </div>
  )
}

const bird = (w: number, h: number) => (
  <svg width={w} height={h} viewBox="0 0 34 14">
    <path d="M2 10 Q9 2 16 10 M16 10 Q23 2 32 10" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

interface Step {
  no: number
  title: string
  body: string
  icon: ReactNode
}

const CUSTOMER_STEPS: Step[] = [
  {
    no: 1,
    title: 'Spot a free chair',
    body: 'Buksan ang app, makikita agad kung sinong barbershop ang bukas o may pila.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><circle cx="32" cy="32" r="24" fill="#f4efe2" /><line x1="32" y1="32" x2="32" y2="18" /><line x1="32" y1="32" x2="43" y2="38" /></g></svg>
    ),
  },
  {
    no: 2,
    title: 'Book it in one tap',
    body: 'I-tap ang available slot — walang tawag, walang antay sa phone.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><rect x="10" y="14" width="44" height="40" rx="6" fill="#f4efe2" /><line x1="10" y1="26" x2="54" y2="26" /><line x1="22" y1="8" x2="22" y2="18" /><line x1="42" y1="8" x2="42" y2="18" /><path d="M24 40 L30 46 L42 34" stroke="#3f9b62" /></g></svg>
    ),
  },
  {
    no: 3,
    title: 'Sort the details in chat',
    body: 'I-message ang barbershop kung anong gupit — fade, trim, o full buzz.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><rect x="8" y="12" width="48" height="32" rx="10" fill="#f4efe2" /><path d="M22 44 L20 56 L34 44" /><circle cx="21" cy="28" r="2.5" fill={INK} /><circle cx="32" cy="28" r="2.5" fill={INK} /><circle cx="43" cy="28" r="2.5" fill={INK} /></g></svg>
    ),
  },
  {
    no: 4,
    title: 'Get a scribbly nudge',
    body: 'May paalala bago dumating ang turn mo — sakto lang para makalakad papunta.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><path d="M32 10 Q46 12 46 28 L48 42 L16 42 L18 28 Q18 12 32 10 Z" fill="#f4efe2" /><path d="M27 48 Q32 54 37 48" /><line x1="32" y1="5" x2="32" y2="10" /><path d="M52 14 Q56 20 54 26" strokeWidth="3" /><path d="M12 14 Q8 20 10 26" strokeWidth="3" /></g></svg>
    ),
  },
  {
    no: 5,
    title: 'Strut out and rate the cut',
    body: 'Mag-iwan ng doodle-star rating pagkatapos, at naka-save lahat ng cut history mo.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M32 6 L39 23 L57 24 L43 35 L48 53 L32 42 L16 53 L21 35 L7 24 L25 23 Z" fill="#ffd76a" /></g></svg>
    ),
  },
]

const OWNER_STEPS: Step[] = [
  {
    no: 1,
    title: 'Set up your shop',
    body: 'Ilagay ang shop name, address, at services — parang gumagawa ka lang ng sign sa bintana.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="12" y="26" width="40" height="24" rx="3" fill="#f4efe2" /><path d="M8 26 L14 12 h36 l6 14 Z" fill={ACCENT} /><line x1="32" y1="36" x2="32" y2="50" /><rect x="18" y="34" width="9" height="9" fill="#fdf7ee" strokeWidth="3" /><rect x="37" y="34" width="9" height="9" fill="#fdf7ee" strokeWidth="3" /></g></svg>
    ),
  },
  {
    no: 2,
    title: 'Add your barbers',
    body: 'I-list ang mga barbers mo at ang oras nila — sino nasa upuan, sino may break.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><circle cx="23" cy="22" r="9" fill="#f4efe2" /><path d="M8 52 c0 -12 7 -16 15 -16 s15 4 15 16" /><circle cx="45" cy="24" r="7" fill="#f4efe2" /><path d="M37 52 c0 -9 3 -13 8 -13 s11 4 11 13" /></g></svg>
    ),
  },
  {
    no: 3,
    title: 'Flip the status',
    body: 'Toggle lang: Open, Busy, o Full. Real-time, walang katext-text.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"><rect x="8" y="22" width="48" height="20" rx="10" fill="#f4efe2" /><circle cx="46" cy="32" r="9" fill="#a8d8b9" /></g></svg>
    ),
  },
  {
    no: 4,
    title: 'Watch it come in',
    body: 'Makikita ang income at tips habang dumadating ang customers — parang jar na napupuno.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="10" x2="42" y2="10" /><path d="M18 16 q0 -4 6 -4 h16 q6 0 6 4 v30 q0 6 -6 6 H24 q-6 0 -6 -6 z" fill="#f4efe2" /><circle cx="32" cy="34" r="8" fill="#ffd76a" strokeWidth="3" /><line x1="32" y1="29" x2="32" y2="39" strokeWidth="2.5" /><line x1="28.5" y1="31.5" x2="35.5" y2="31.5" strokeWidth="2.5" /><line x1="28.5" y1="34.5" x2="35.5" y2="34.5" strokeWidth="2.5" /></g></svg>
    ),
  },
  {
    no: 5,
    title: 'Check your scribbly reports',
    body: 'Tignan kung anong best day at sino best barber — lahat naka-log, walang lost na kita.',
    icon: (
      <svg width="84" height="84" viewBox="0 0 64 64"><g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 10 v42 h42" /><rect x="20" y="36" width="8" height="16" fill={ACCENT} strokeWidth="3" /><rect x="32" y="28" width="8" height="24" fill="#f4efe2" strokeWidth="3" /><rect x="44" y="18" width="8" height="34" fill="#ffd76a" strokeWidth="3" /></g></svg>
    ),
  },
]

export function LandingPage() {
  const [s, setS] = useState({ inHair: 0, outCut: 0, colorIdx: 0, body: 2, pantsIdx: 0 })
  const [side, setSide] = useState<'customer' | 'owner'>('customer')
  const firstSide = useRef(true)
  const rootRef = useRef<HTMLDivElement>(null)
  const fxRef = useRef<HTMLDivElement>(null)
  const walkerRef = useRef<HTMLDivElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Reshuffle the walker's look on each loop.
  useEffect(() => {
    const w = walkerRef.current
    if (!w) return
    const pick = (n: number, prev: number) => {
      let v: number
      do {
        v = Math.floor(Math.random() * n)
      } while (v === prev && n > 1)
      return v
    }
    const onIter = (e: AnimationEvent) => {
      if (e.animationName !== 'walkIn') return
      setS((p) => ({
        inHair: pick(5, p.inHair),
        outCut: pick(6, p.outCut),
        colorIdx: pick(6, p.colorIdx),
        body: pick(3, p.body),
        pantsIdx: pick(4, p.pantsIdx),
      }))
    }
    w.addEventListener('animationiteration', onIter)
    return () => w.removeEventListener('animationiteration', onIter)
  }, [])

  // Scroll-driven reveals for the "how it works" section.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      const title = root.querySelector('[data-anim="s2title"]')
      if (title) {
        gsap.fromTo(title, { y: 70, opacity: 0, rotation: -2 }, { y: 0, opacity: 1, rotation: 0, duration: 0.9, ease: 'power2.out', scrollTrigger: { trigger: title, start: 'top 88%' } })
      }
      root.querySelectorAll<HTMLElement>('[data-anim="card"]').forEach((el) => {
        // clearProps on finish so the CSS :hover lift can take over from GSAP's inline transform
        gsap.fromTo(el, { y: 80, opacity: 0, rotation: Number.parseFloat(el.dataset.tilt ?? '3') }, { y: 0, opacity: 1, rotation: 0, duration: 0.8, ease: 'back.out(1.4)', scrollTrigger: { trigger: el, start: 'top 87%' }, onComplete: () => gsap.set(el, { clearProps: 'transform' }) })
      })
      root.querySelectorAll<HTMLElement>('[data-anim="icon"]').forEach((el) => {
        const rot = Number.parseFloat(el.dataset.rot ?? '0')
        gsap.fromTo(el, { scale: 0.3, opacity: 0, rotation: -14 }, { scale: 1, opacity: 1, rotation: rot, duration: 0.7, ease: 'back.out(2)', scrollTrigger: { trigger: el, start: 'top 87%' } })
      })
      root.querySelectorAll<HTMLElement>('[data-anim="badge"]').forEach((el) => {
        gsap.fromTo(el, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.5)', scrollTrigger: { trigger: el, start: 'top 87%' } })
      })
      root.querySelectorAll<HTMLElement>('[data-anim="doodle"]').forEach((el) => {
        gsap.fromTo(el, { scale: 0, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(2)', scrollTrigger: { trigger: el, start: 'top 94%' } })
        const d = Number.parseFloat(el.dataset.depth ?? '40')
        gsap.to(el, { y: -d * 2, ease: 'none', scrollTrigger: { trigger: el.closest('section'), start: 'top bottom', end: 'bottom top', scrub: 0.5 } })
      })
      const wrap = root.querySelector<HTMLElement>('[data-anim="stepswrap"]')
      const path = root.querySelector<HTMLElement>('[data-anim="path"]')
      const walker = root.querySelector<HTMLElement>('[data-anim="s2walker"]')
      if (wrap && path) {
        gsap.fromTo(path, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: wrap, start: 'top 70%', end: 'bottom 65%', scrub: 0.4 } })
      }
      if (wrap && walker) {
        const badges = Array.from(root.querySelectorAll<HTMLElement>('.phil-badge-no'))
        const applyCut = () => {
          const sr = walker.getBoundingClientRect()
          const cutY = sr.top + sr.height * 0.5 // the blade-crossing point
          badges.forEach((b) => {
            const br = b.getBoundingClientRect()
            b.classList.toggle('is-cut', cutY >= br.top + br.height / 2)
          })
        }
        gsap.fromTo(
          walker,
          { y: 0 },
          {
            y: () => wrap.offsetHeight - 100,
            ease: 'none',
            immediateRender: true,
            scrollTrigger: { trigger: wrap, start: 'top 70%', end: 'bottom 65%', scrub: 0.4, invalidateOnRefresh: true },
            onUpdate: applyCut,
          },
        )
      }
    }, root)

    return () => ctx.revert()
  }, [])

  // Little pop when switching sides so the content swap feels alive.
  useEffect(() => {
    if (firstSide.current) {
      firstSide.current = false
      return
    }
    const root = rootRef.current
    if (!root || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const targets = root.querySelectorAll('[data-anim="card"], .phil-icon-card')
    gsap.fromTo(targets, { scale: 0.94 }, { scale: 1, duration: 0.35, ease: 'back.out(2)', stagger: 0.03, clearProps: 'scale' })
  }, [side])

  function slash(x: number, y: number, a: number) {
    const ov = fxRef.current
    if (!ov) return
    const wrap = document.createElement('div')
    wrap.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${a}rad);pointer-events:none;`
    const blade = document.createElement('div')
    blade.style.cssText = 'width:74px;height:4px;border-radius:4px;background:linear-gradient(90deg,rgba(43,43,43,0),#2b2b2b 30%,#2b2b2b 70%,rgba(43,43,43,0));animation:slashFx .38s ease-out forwards;'
    wrap.appendChild(blade)
    for (let k = 0; k < 2; k++) {
      const h = document.createElement('div')
      h.style.cssText = `position:absolute;left:${Math.round(Math.random() * 44 - 22)}px;top:3px;width:9px;height:2.5px;background:#2b2b2b;border-radius:2px;transform:rotate(${Math.round(Math.random() * 120)}deg);animation:hairFall .7s ease-in forwards;`
      wrap.appendChild(h)
    }
    ov.appendChild(wrap)
    setTimeout(() => wrap.remove(), 760)
  }

  function onHeadMove(e: React.MouseEvent) {
    const ov = fxRef.current
    if (!ov) return
    const r = ov.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (last.current) {
      const dx = x - last.current.x
      const dy = y - last.current.y
      if (Math.hypot(dx, dy) > 36) {
        slash((x + last.current.x) / 2, (y + last.current.y) / 2, Math.atan2(dy, dx))
        last.current = { x, y }
      }
    } else {
      last.current = { x, y }
    }
  }

  const personColor = COLORS[s.colorIdx]
  const pantsColor = PANTS[s.pantsIdx]
  const steps = side === 'customer' ? CUSTOMER_STEPS : OWNER_STEPS
  const heroVars = { '--accent': ACCENT, '--walk': '12s' } as CSSProperties

  return (
    <div className="phil" ref={rootRef} style={heroVars}>
      <main className="phil-hero-main" style={{ position: 'relative', zIndex: 1 }}>
        <section className="phil-hero">
          {/* Billboard column */}
          <div className="phil-billboard-col">
            <div className="phil-billboard">
              <span className="phil-bulb" style={{ left: 30 }} />
              <span className="phil-bulb" style={{ left: '30%', animationDelay: '.55s' }} />
              <span className="phil-bulb" style={{ left: '55%' }} />
              <span className="phil-bulb" style={{ right: 36, animationDelay: '.55s' }} />
              <div style={{ position: 'absolute', right: 74, top: -22 }}>{bird(30, 16)}</div>

              <div className="phil-badge">✂ {SHOP_NAME} · your local city barber</div>
              <h1 className="phil-title" onMouseMove={onHeadMove} onMouseLeave={() => (last.current = null)}>
                Walk in scruffy,<br />walk out sharp.
              </h1>
              <p className="phil-lead">
                See which barber is free right now, book the chair, and strut out with a fresh cut. No lines, no phone calls — all in one scribbly little app.
              </p>
              <div className="phil-actions">
                <CurtainLink to="/signup" className="phil-btn phil-btn-accent">Sign up →</CurtainLink>
                <CurtainLink to="/login" className="phil-btn">Sign in</CurtainLink>
              </div>
            </div>
            <div className="phil-posts">
              <div className="phil-post" />
              <div className="phil-post" />
            </div>
          </div>

          {/* Storefront stage */}
          <div className="phil-stage">
            {/* sky */}
            <div style={{ position: 'absolute', left: 14, top: 8, width: 42, height: 42, borderRadius: '50%', background: '#ffd76a', border: `2.5px solid ${INK}`, boxShadow: '0 0 24px 8px rgba(255,205,90,.55)', animation: 'blink 4s ease-in-out infinite', zIndex: 0 }} />
            <div style={{ position: 'absolute', left: 110, top: 36, width: 74, height: 22, borderRadius: 12, background: '#fdf7ee', border: `2.5px solid ${INK}`, animation: 'cloudDrift 8s ease-in-out infinite alternate', zIndex: 0 }} />
            <div style={{ position: 'absolute', left: 430, top: 12, width: 88, height: 24, borderRadius: 14, background: '#fdf7ee', border: `2.5px solid ${INK}`, animation: 'cloudDrift 11s ease-in-out infinite alternate-reverse', zIndex: 0 }} />
            <div style={{ position: 'absolute', left: -360, top: 26, animation: 'birdGlide 14s linear infinite', zIndex: 0 }}>{bird(34, 14)}</div>
            <div style={{ position: 'absolute', left: -300, top: 64, animation: 'birdGlide 18s linear infinite -7s', zIndex: 0 }}>{bird(26, 12)}</div>

            {/* side buildings */}
            <Building pos={{ left: -6, top: 190 }} w={84} h={262} body="#e7d9c5" roof="#b8a68c" windows={[{ l: 12, t: 22, w: 20, h: 24 }, { l: 46, t: 22, w: 20, h: 24 }, { l: 12, t: 70, w: 20, h: 24 }, { l: 46, t: 70, w: 20, h: 24 }, { l: 12, t: 118, w: 20, h: 24 }, { l: 46, t: 118, w: 20, h: 24 }]} />
            <Building pos={{ left: 480, top: 214 }} w={86} h={238} body="#d9e2ea" roof="#9fb3c2" windows={[{ l: 12, t: 22, w: 20, h: 24 }, { l: 46, t: 22, w: 20, h: 24 }, { l: 12, t: 70, w: 20, h: 24 }, { l: 46, t: 70, w: 20, h: 24 }]} />

            {/* awning backboard */}
            <div style={{ position: 'absolute', left: 60, top: 96, width: 440, height: 56, background: '#c0392b', border: `3px solid ${INK}`, borderRadius: 8, zIndex: 0 }} />
            {/* flag */}
            <div style={{ position: 'absolute', left: 278, top: 0, width: 3, height: 30, background: INK, zIndex: 3 }} />
            <div style={{ position: 'absolute', left: 281, top: 1, width: 28, height: 15, background: ACCENT, border: `2px solid ${INK}`, borderRadius: '2px 6px 6px 2px', transformOrigin: 'left center', animation: 'flagWave .9s ease-in-out infinite alternate', zIndex: 3 }} />
            {/* est topper */}
            <div style={{ position: 'absolute', left: 216, top: 44, width: 128, height: 26, borderRadius: '64px 64px 0 0', background: '#c0392b', border: `2.5px solid ${INK}`, zIndex: 2 }} />
            <div style={{ position: 'absolute', left: 225, top: 26, width: 110, height: 44, background: '#fdf7ee', border: `2.5px solid ${INK}`, borderRadius: '10px 10px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1, zIndex: 3 }}>
              <span style={{ fontFamily: "'Gochi Hand', cursive", fontSize: 13, letterSpacing: 1 }}>EST.ᴰ</span>
              <span style={{ fontFamily: "'Gochi Hand', cursive", fontSize: 17, letterSpacing: 2 }}>2026</span>
            </div>
            {/* marquee */}
            <div style={{ position: 'absolute', left: 70, top: 70, width: 420, height: 56, background: '#fdf7ee', border: `3px solid ${INK}`, borderRadius: 6, boxShadow: '4px 4px 0 rgba(43,43,43,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4 }}>
              <span style={{ fontFamily: "'Gochi Hand', cursive", fontSize: 30, letterSpacing: 5 }}>{SHOP_NAME.toUpperCase()}</span>
              {[12, 76, 140, 204, 268, 332, 396].map((lx, i) => (
                <div key={lx} style={{ position: 'absolute', left: lx, top: -7, width: 11, height: 11, borderRadius: '50%', background: '#ffd76a', border: `2px solid ${INK}`, boxShadow: '0 0 10px 3px rgba(255,200,70,.75)', animation: 'blink .9s ease-in-out infinite', animationDelay: i % 2 ? '.45s' : '0s' }} />
              ))}
            </div>
            {/* valance */}
            <div style={{ position: 'absolute', left: 70, top: 126, width: 420, height: 14, background: 'repeating-linear-gradient(90deg,#c0392b 0 6px,#fdf7ee 6px 34px)', border: `2px solid ${INK}`, zIndex: 4 }} />
            {/* barber strip */}
            <div style={{ position: 'absolute', left: 120, top: 146, width: 320, height: 32, background: '#fdf7ee', border: `2.5px solid ${INK}`, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4 }}>
              <span style={{ fontFamily: "'Gochi Hand', cursive", fontSize: 19, letterSpacing: 3, color: '#c0392b' }}>— B·A·R·B·E·R —</span>
            </div>
            {/* facade */}
            <div style={{ position: 'absolute', left: 70, top: 160, width: 420, height: 292, backgroundColor: '#fdf7ee', backgroundImage: 'repeating-linear-gradient(180deg, rgba(43,43,43,.10) 0 2px, transparent 2px 16px)', border: `3px solid ${INK}`, borderRadius: '4px 4px 8px 8px', boxShadow: '5px 6px 0 rgba(43,43,43,.45)', zIndex: 1 }} />
            {/* lamppost */}
            <div style={{ position: 'absolute', left: 36, top: 338, width: 4, height: 114, background: INK, borderRadius: 2, zIndex: 2 }} />
            <div style={{ position: 'absolute', left: 29, top: 328, width: 18, height: 18, borderRadius: '50%', background: '#ffd76a', border: `2.5px solid ${INK}`, boxShadow: '0 0 14px 4px rgba(255,205,90,.7)', animation: 'blink 3s ease-in-out infinite', zIndex: 2 }} />
            {/* poles */}
            <div style={{ position: 'absolute', left: 100, top: 200, width: 24, height: 252, border: `2.5px solid ${INK}`, borderRadius: 6, background: 'repeating-linear-gradient(-45deg,#d94f4f 0 9px,#f6efe4 9px 18px,#4f6fd9 18px 27px,#f6efe4 27px 36px)', animation: 'poleSpin 1.2s linear infinite', zIndex: 3 }} />
            <div style={{ position: 'absolute', left: 376, top: 200, width: 24, height: 252, border: `2.5px solid ${INK}`, borderRadius: 6, background: 'repeating-linear-gradient(-45deg,#d94f4f 0 9px,#f6efe4 9px 18px,#4f6fd9 18px 27px,#f6efe4 27px 36px)', animation: 'poleSpin 1.2s linear infinite', zIndex: 3 }} />
            {/* window */}
            <div style={{ position: 'absolute', left: 142, top: 208, width: 150, height: 144, background: 'repeating-linear-gradient(-45deg,#d94f4f 0 8px,#f6efe4 8px 16px,#4f6fd9 16px 24px,#f6efe4 24px 32px)', border: `3px solid ${INK}`, borderRadius: 8, zIndex: 2 }}>
              <div style={{ position: 'absolute', inset: 10, background: '#f4efe2', border: `2px solid ${INK}`, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, animation: 'windowShow var(--walk, 12s) linear infinite' }}>
                  <svg width="58" height="42" viewBox="0 0 64 48" style={{ animation: 'snipJiggle .3s ease-in-out infinite alternate' }}>
                    <g stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
                      <line x1="16" y1="12" x2="52" y2="34" />
                      <line x1="16" y1="34" x2="52" y2="12" />
                      <circle cx="11" cy="9" r="6" />
                      <circle cx="11" cy="37" r="6" />
                    </g>
                  </svg>
                  <span style={{ fontFamily: "'Gochi Hand', cursive", fontSize: 17, animation: 'snipPop .8s ease-in-out infinite' }}>snip! snip!</span>
                  <div style={{ position: 'absolute', left: 14, top: 26, width: 9, height: 3, background: INK, borderRadius: 2, animation: 'hairFall .8s linear infinite' }} />
                  <div style={{ position: 'absolute', left: 32, top: 20, width: 8, height: 3, background: INK, borderRadius: 2, animation: 'hairFall .8s linear infinite .3s' }} />
                  <div style={{ position: 'absolute', left: 46, top: 28, width: 9, height: 3, background: INK, borderRadius: 2, animation: 'hairFall .8s linear infinite .55s' }} />
                </div>
              </div>
            </div>
            {/* door */}
            <div style={{ position: 'absolute', left: 298, top: 250, width: 64, height: 202, background: 'linear-gradient(180deg,#f2dfae 0 30%,#8d7260 30% 100%)', border: `3px solid ${INK}`, borderRadius: '10px 10px 0 0', zIndex: 2 }}>
              <div style={{ position: 'absolute', left: 14, top: 8, width: 30, height: 8, borderRadius: 4, background: '#ffd76a', border: `2px solid ${INK}`, boxShadow: '0 4px 10px 2px rgba(255,205,90,.8)' }} />
              <div style={{ position: 'absolute', left: -3, top: -3, width: 64, height: 202, background: '#b03a3a', border: `3px solid ${INK}`, borderRadius: '10px 10px 0 0', transformOrigin: 'left center', animation: 'doorSwing var(--walk, 12s) linear infinite' }}>
                <div style={{ position: 'absolute', left: 12, top: 56, right: 12, height: 56, border: `2px solid ${INK}`, borderRadius: 4, background: '#f4efe2' }} />
                <div style={{ position: 'absolute', right: 8, top: 118, width: 9, height: 9, borderRadius: '50%', background: '#ffd76a', border: `1.5px solid ${INK}` }} />
                <div style={{ position: 'absolute', left: '50%', top: 18, transform: 'translateX(-50%)', background: '#fdf7ee', border: `2px solid ${INK}`, borderRadius: 6, padding: '1px 8px', fontFamily: "'Gochi Hand', cursive", fontSize: 14 }}>OPEN</div>
              </div>
            </div>
            {/* fence */}
            <div style={{ position: 'absolute', left: 404, top: 414, width: 146, height: 5, background: '#fdf7ee', border: `2px solid ${INK}`, zIndex: 6 }} />
            {[408, 427, 446, 465, 484, 503, 522].map((lx) => (
              <div key={lx} style={{ position: 'absolute', left: lx, top: 396, width: 10, height: 56, background: '#fdf7ee', border: `2px solid ${INK}`, borderRadius: '5px 5px 0 0', zIndex: 6 }} />
            ))}

            {/* walk-in figure */}
            <div ref={walkerRef} style={{ position: 'absolute', left: -140, top: 306, width: 90, height: 152, animation: 'walkIn var(--walk, 12s) linear infinite', zIndex: 4 }}>
              <div style={{ position: 'absolute', left: 18, bottom: 2, width: 56, height: 9, borderRadius: '50%', background: 'rgba(43,43,43,.14)' }} />
              <div style={{ transformOrigin: '50% 100%', animation: `lean .5s ${EASE} infinite alternate` }}>
                <div style={{ animation: `bob .3s ${EASE} infinite alternate` }}>
                  <svg width="90" height="150" viewBox="0 0 90 150" style={{ overflow: 'visible' }}>
                    <g stroke={INK} strokeLinecap="round" fill="none">
                      {renderInHead(s.inHair)}
                      {renderBody(s.body, personColor, pantsColor, 'in')}
                    </g>
                  </svg>
                </div>
              </div>
            </div>

            {/* walk-out figure */}
            <div style={{ position: 'absolute', left: 285, top: 306, width: 90, height: 152, animation: 'walkOut var(--walk, 12s) linear infinite', transformOrigin: '50% 100%', opacity: 0, zIndex: 4 }}>
              <div style={{ position: 'absolute', left: 6, top: -36, background: ACCENT, border: `2px solid ${INK}`, borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px', padding: '2px 12px', fontFamily: "'Gochi Hand', cursive", fontSize: 16, whiteSpace: 'nowrap', animation: 'freshTag var(--walk, 12s) linear infinite' }}>fresh cut!</div>
              <div style={{ position: 'absolute', left: 18, bottom: 2, width: 56, height: 9, borderRadius: '50%', background: 'rgba(43,43,43,.14)' }} />
              <div style={{ transformOrigin: '50% 100%', animation: `lean .5s ${EASE} -.25s infinite alternate` }}>
                <div style={{ animation: `bob .3s ${EASE} infinite alternate` }}>
                  <svg width="90" height="150" viewBox="0 0 90 150" style={{ overflow: 'visible' }}>
                    <g stroke={INK} strokeLinecap="round" fill="none">
                      {renderOutHead(s.outCut, personColor)}
                      {renderBody(s.body, personColor, pantsColor, 'out')}
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Street */}
        <div className="phil-street">
          <Building pos={{ left: '2%', bottom: 136 }} w={110} h={214} body="#e7d9c5" roof="#b8a68c" windows={[{ l: 14, t: 22, w: 24, h: 26 }, { l: 60, t: 22, w: 24, h: 26 }, { l: 14, t: 74, w: 24, h: 26 }, { l: 60, t: 74, w: 24, h: 26 }, { l: 14, t: 126, w: 24, h: 26 }, { l: 60, t: 126, w: 24, h: 26 }]} />
          <Building pos={{ left: '12%', bottom: 136 }} w={88} h={150} body="#d9e2ea" roof="#9fb3c2" windows={[{ l: 12, t: 20, w: 22, h: 24 }, { l: 50, t: 20, w: 22, h: 24 }, { l: 12, t: 66, w: 22, h: 24 }, { l: 50, t: 66, w: 22, h: 24 }]} />
          <Building pos={{ left: '29%', bottom: 136 }} w={78} h={118} body="#ead9d3" roof="#c9a99f" windows={[{ l: 11, t: 20, w: 20, h: 22 }, { l: 46, t: 20, w: 20, h: 22 }, { l: 11, t: 62, w: 20, h: 22 }, { l: 46, t: 62, w: 20, h: 22 }]} />
          <Building pos={{ right: '1%', bottom: 136 }} w={96} h={176} body="#d9e2ea" roof="#9fb3c2" windows={[{ l: 13, t: 22, w: 22, h: 24 }, { l: 55, t: 22, w: 22, h: 24 }, { l: 13, t: 70, w: 22, h: 24 }, { l: 55, t: 70, w: 22, h: 24 }]} />

          {/* street lamps */}
          <div style={{ position: 'absolute', left: '19%', bottom: 136, width: 4, height: 118, background: INK, borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: '19%', bottom: 246, width: 18, height: 18, marginLeft: -7, borderRadius: '50%', background: '#ffd76a', border: `2.5px solid ${INK}`, boxShadow: '0 0 14px 4px rgba(255,205,90,.7)', animation: 'blink 3.6s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', left: '36%', bottom: 136, width: 4, height: 118, background: INK, borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: '36%', bottom: 246, width: 18, height: 18, marginLeft: -7, borderRadius: '50%', background: '#ffd76a', border: `2.5px solid ${INK}`, boxShadow: '0 0 14px 4px rgba(255,205,90,.7)', animation: 'blink 4.4s ease-in-out infinite' }} />

          {/* bushes + hydrant */}
          <div style={{ position: 'absolute', left: '9%', bottom: 136, width: 70, height: 38, background: '#a8d8b9', border: `2.5px solid ${INK}`, borderRadius: '35px 35px 0 0' }} />
          <div style={{ position: 'absolute', left: '33.5%', bottom: 136, width: 54, height: 30, background: '#a8d8b9', border: `2.5px solid ${INK}`, borderRadius: '27px 27px 0 0' }} />
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
        </div>
      </main>

      {/* How it works */}
      <section id="how" className="phil-how">
        <ScatterDoodles />

        <div data-anim="s2title" className="phil-how-title">
          <div style={{ background: ACCENT, border: `2px solid ${INK}`, borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px', padding: '5px 18px', fontFamily: "'Gochi Hand', cursive", fontSize: 18, boxShadow: '2px 3px 0 rgba(43,43,43,.85)' }}>how it works</div>
          <h2>
            {side === 'customer' ? (
              <>From scruffy to sharp,<br />in five scribbly steps.</>
            ) : (
              <>From empty chair to full books,<br />in five scribbly steps.</>
            )}
          </h2>
          <div className="phil-role-toggle" role="tablist" aria-label="Piliin ang side mo">
            <button
              type="button"
              role="tab"
              aria-selected={side === 'customer'}
              className={`phil-role-btn ${side === 'customer' ? 'active' : ''}`}
              onClick={() => setSide('customer')}
            >
              🙋 For customers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={side === 'owner'}
              className={`phil-role-btn ${side === 'owner' ? 'active' : ''}`}
              onClick={() => setSide('owner')}
            >
              💈 For barbershops
            </button>
          </div>
        </div>

        <div data-anim="stepswrap" className="phil-steps">
          <div data-anim="path" className="phil-path" />
          <div data-anim="s2walker" className="phil-s2walker">
            <div style={{ animation: `bob .5s ${EASE} infinite alternate` }}>
              <svg width="56" height="84" viewBox="0 0 56 84" style={{ overflow: 'visible' }}>
                <g stroke={INK} strokeLinecap="round" fill="none">
                  <g style={{ transformBox: 'view-box', transformOrigin: '28px 34px', animation: 'bladeA .4s ease-in-out infinite alternate' }}>
                    <line x1="28" y1="34" x2="13" y2="76" strokeWidth="5" />
                    <circle cx="17" cy="15" r="9" strokeWidth="4" />
                    <line x1="22" y1="23" x2="28" y2="34" strokeWidth="4" />
                  </g>
                  <g style={{ transformBox: 'view-box', transformOrigin: '28px 34px', animation: 'bladeB .4s ease-in-out infinite alternate' }}>
                    <line x1="28" y1="34" x2="43" y2="76" strokeWidth="5" />
                    <circle cx="39" cy="15" r="9" strokeWidth="4" />
                    <line x1="34" y1="23" x2="28" y2="34" strokeWidth="4" />
                  </g>
                  <circle cx="28" cy="34" r="3.5" fill={INK} strokeWidth="2" />
                </g>
              </svg>
            </div>
          </div>

          {steps.map((step) => {
            const cardLeft = step.no % 2 === 1
            const rot = cardLeft ? 4 : -4
            const tilt = cardLeft ? -3 : 3
            const card = (
              <div data-anim="card" data-tilt={tilt} className="phil-card">
                <span className="step-no">step {step.no}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            )
            const icon = (
              <div className="phil-cell">
                <div data-anim="icon" data-rot={rot} style={{ transform: `rotate(${rot}deg)` }}>
                  <div className="phil-icon-card" style={{ animation: `floatY ${3 + step.no * 0.2}s ease-in-out infinite alternate` }}>{step.icon}</div>
                </div>
              </div>
            )
            const badge = (
              <div className="phil-cell">
                <div data-anim="badge" className="phil-badge-no">
                  <span className="badge-half badge-left">{step.no}</span>
                  <span className="badge-half badge-right">{step.no}</span>
                </div>
              </div>
            )
            return (
              <div className="phil-step-row" key={step.no}>
                {cardLeft ? card : icon}
                {badge}
                {cardLeft ? icon : card}
              </div>
            )
          })}
        </div>

        <div data-anim="card" data-tilt={2} className="phil-cta">
          <ShopInterior />
          <h3>Ready for a fresh one?</h3>
          <p>The chair's free. The lights are on.</p>
          <CurtainLink to="/signup" className="phil-btn">Sign up →</CurtainLink>
        </div>
      </section>

      <div ref={fxRef} className="phil-fx" />
    </div>
  )
}

/* ---------- illustration helpers ---------- */

function renderInHead(inHair: number) {
  return (
    <>
      <g style={vis(inHair === 0)}>
        <path d="M34 12 Q30 3 26 6 M40 9 Q38 0 34 2 M47 8 Q47 -1 52 1 M54 10 Q59 1 63 5 M58 15 Q66 9 68 14" strokeWidth="3" />
      </g>
      <g style={vis(inHair === 1)}>
        <path d="M31 22 Q25 1 45 3 Q65 1 59 22 Q52 11 45 13 Q38 11 31 22 Z" fill={INK} strokeWidth="2" />
        <line x1="31" y1="21" x2="27" y2="32" strokeWidth="3" />
        <line x1="59" y1="21" x2="63" y2="32" strokeWidth="3" />
      </g>
      <g style={vis(inHair === 2)} fill={INK} strokeWidth="2">
        <circle cx="45" cy="9" r="11" />
        <circle cx="33" cy="14" r="7" />
        <circle cx="57" cy="14" r="7" />
      </g>
      <g style={vis(inHair === 3)}>
        <ellipse cx="45" cy="5" rx="17" ry="13" fill={INK} strokeWidth="2" />
        <path d="M28 8 Q23 5 24 -1 M62 8 Q67 5 66 -1" strokeWidth="3" />
      </g>
      <g style={vis(inHair === 4)}>
        <path d="M32 24 Q28 2 45 2 Q62 2 58 24 L54 15 Q50 19 45 15 Q40 19 36 15 Z" fill={INK} strokeWidth="2" />
        <line x1="33" y1="23" x2="30" y2="33" strokeWidth="3" />
        <line x1="57" y1="23" x2="60" y2="33" strokeWidth="3" />
      </g>
      <circle cx="45" cy="22" r="13" strokeWidth="4" fill="#faf3ea" />
      <line x1="45" y1="35" x2="45" y2="46" strokeWidth="6" />
    </>
  )
}

function renderOutHead(outCut: number, personColor: string) {
  return (
    <>
      <g style={vis(outCut === 0)}>
        <rect x="33" y="3" width="24" height="9" rx="2" fill={INK} strokeWidth="3" />
      </g>
      <g style={vis(outCut === 1)}>
        <path d="M36 12 L39 -1 L42 12 M42 12 L45 -4 L48 12 M48 12 L51 -1 L54 12" fill={INK} strokeWidth="2.5" />
      </g>
      <g style={vis(outCut === 2)}>
        <path d="M32 16 Q31 3 45 3 Q59 3 58 16 Q50 6 41 9 Q36 11 32 16 Z" fill={INK} strokeWidth="2" />
      </g>
      <g style={vis(outCut === 3)}>
        <path d="M33 13 Q33 5 45 5 Q57 5 57 13" strokeWidth="5" />
        <path d="M37 28 Q42 24 45 28 Q48 24 53 28" stroke={personColor} strokeWidth="3.5" />
      </g>
      <g style={vis(outCut === 4)}>
        <path d="M33 12 Q33 -3 47 0 Q58 3 57 12 Q45 6 33 12 Z" fill={INK} strokeWidth="2.5" />
      </g>
      <g style={vis(outCut === 5)}>
        <path d="M32 13 Q34 4 45 4 Q56 4 58 13" strokeWidth="6" />
        <line x1="41" y1="6" x2="40" y2="12" stroke="#faf3ea" strokeWidth="1.5" />
      </g>
      <circle cx="45" cy="22" r="13" strokeWidth="4" fill="#faf3ea" />
      <g style={{ animation: 'sparkle .9s ease-in-out infinite' }}>
        <line x1="72" y1="6" x2="72" y2="18" strokeWidth="3" />
        <line x1="66" y1="12" x2="78" y2="12" strokeWidth="3" />
      </g>
      <g style={{ animation: 'sparkle .9s ease-in-out infinite .45s' }}>
        <line x1="17" y1="10" x2="17" y2="20" strokeWidth="3" />
        <line x1="12" y1="15" x2="22" y2="15" strokeWidth="3" />
      </g>
      <line x1="45" y1="35" x2="45" y2="46" strokeWidth="6" />
    </>
  )
}

function renderBody(body: number, personColor: string, pantsColor: string, mode: 'in' | 'out') {
  const arm = mode === 'in' ? 'armSwing' : 'armPump'
  const a0 = `${arm} .5s ${EASE} infinite alternate`
  const aD = `${arm} .5s ${EASE} -.5s infinite alternate`
  // Which arm carries the -.5s delay differs between walk-in and walk-out.
  const leftArm = mode === 'in' ? aD : a0
  const rightArm = mode === 'in' ? a0 : aD
  const legA = `legSwing .5s ${EASE} infinite alternate`
  const legB = `legSwing .5s ${EASE} -.5s infinite alternate`

  if (body === 0) {
    return (
      <g>
        <path d="M38 46 L52 46 L51 90 L39 90 Z" fill={personColor} strokeWidth="3" />
        <line x1="34" y1="48" x2="56" y2="48" strokeWidth="6" />
        {mode === 'in' ? (
          <>
            <g style={{ transformBox: 'view-box', transformOrigin: '34px 50px', animation: leftArm }}><path d="M34 50 L27 71 L31 91" strokeWidth="5" /><line x1="34" y1="50" x2="30" y2="64" stroke={personColor} strokeWidth="8" /></g>
            <g style={{ transformBox: 'view-box', transformOrigin: '56px 50px', animation: rightArm }}><path d="M56 50 L63 71 L59 91" strokeWidth="5" /><line x1="56" y1="50" x2="60" y2="64" stroke={personColor} strokeWidth="8" /></g>
          </>
        ) : (
          <>
            <g style={{ transformBox: 'view-box', transformOrigin: '34px 50px', animation: leftArm }}><path d="M34 50 L22 61 L25 44" strokeWidth="5" /><line x1="34" y1="50" x2="28" y2="56" stroke={personColor} strokeWidth="8" /></g>
            <g style={{ transformBox: 'view-box', transformOrigin: '56px 50px', animation: rightArm }}><path d="M56 50 L68 61 L65 44" strokeWidth="5" /><line x1="56" y1="50" x2="62" y2="56" stroke={personColor} strokeWidth="8" /></g>
          </>
        )}
        <g style={{ transformBox: 'view-box', transformOrigin: '42px 88px', animation: legA }}><path d="M42 88 L37 116 L35 143" stroke={pantsColor} strokeWidth="6" /><line x1="35" y1="143" x2="44" y2="143" strokeWidth="6" /></g>
        <g style={{ transformBox: 'view-box', transformOrigin: '48px 88px', animation: legB }}><path d="M48 88 L53 116 L55 143" stroke={pantsColor} strokeWidth="6" /><line x1="55" y1="143" x2="64" y2="143" strokeWidth="6" /></g>
      </g>
    )
  }
  if (body === 1) {
    return (
      <g>
        <path d="M34 46 L56 46 Q68 68 58 90 L32 90 Q22 68 34 46 Z" fill={personColor} strokeWidth="3" />
        <line x1="30" y1="48" x2="60" y2="48" strokeWidth="8" />
        {mode === 'in' ? (
          <>
            <g style={{ transformBox: 'view-box', transformOrigin: '31px 50px', animation: leftArm }}><path d="M31 50 L23 70 L28 90" strokeWidth="6" /><line x1="31" y1="50" x2="26" y2="63" stroke={personColor} strokeWidth="9" /></g>
            <g style={{ transformBox: 'view-box', transformOrigin: '59px 50px', animation: rightArm }}><path d="M59 50 L67 70 L62 90" strokeWidth="6" /><line x1="59" y1="50" x2="64" y2="63" stroke={personColor} strokeWidth="9" /></g>
          </>
        ) : (
          <>
            <g style={{ transformBox: 'view-box', transformOrigin: '31px 50px', animation: leftArm }}><path d="M31 50 L18 62 L21 44" strokeWidth="6" /><line x1="31" y1="50" x2="25" y2="57" stroke={personColor} strokeWidth="9" /></g>
            <g style={{ transformBox: 'view-box', transformOrigin: '59px 50px', animation: rightArm }}><path d="M59 50 L72 62 L69 44" strokeWidth="6" /><line x1="59" y1="50" x2="65" y2="57" stroke={personColor} strokeWidth="9" /></g>
          </>
        )}
        <g style={{ transformBox: 'view-box', transformOrigin: '41px 88px', animation: legA }}><path d="M41 88 L36 116 L34 143" stroke={pantsColor} strokeWidth="7" /><line x1="34" y1="143" x2="43" y2="143" strokeWidth="7" /></g>
        <g style={{ transformBox: 'view-box', transformOrigin: '49px 88px', animation: legB }}><path d="M49 88 L54 116 L56 143" stroke={pantsColor} strokeWidth="7" /><line x1="56" y1="143" x2="65" y2="143" strokeWidth="7" /></g>
      </g>
    )
  }
  return (
    <g>
      <path d="M30 46 L60 46 L52 90 L38 90 Z" fill={personColor} strokeWidth="3" />
      <line x1="27" y1="49" x2="63" y2="49" strokeWidth="11" />
      {mode === 'in' ? (
        <>
          <g style={{ transformBox: 'view-box', transformOrigin: '31px 50px', animation: leftArm }}><path d="M31 50 L22 72 L27 92" strokeWidth="8" /><line x1="31" y1="50" x2="25" y2="65" stroke={personColor} strokeWidth="11" /></g>
          <g style={{ transformBox: 'view-box', transformOrigin: '59px 50px', animation: rightArm }}><path d="M59 50 L68 72 L63 92" strokeWidth="8" /><line x1="59" y1="50" x2="65" y2="65" stroke={personColor} strokeWidth="11" /></g>
        </>
      ) : (
        <>
          <g style={{ transformBox: 'view-box', transformOrigin: '31px 50px', animation: leftArm }}><path d="M31 50 L18 60 L21 42" strokeWidth="8" /><line x1="31" y1="50" x2="24" y2="56" stroke={personColor} strokeWidth="11" /></g>
          <g style={{ transformBox: 'view-box', transformOrigin: '59px 50px', animation: rightArm }}><path d="M59 50 L72 60 L69 42" strokeWidth="8" /><line x1="59" y1="50" x2="66" y2="56" stroke={personColor} strokeWidth="11" /></g>
        </>
      )}
      <g style={{ transformBox: 'view-box', transformOrigin: '41px 88px', animation: legA }}><path d="M41 88 L36 116 L34 143" stroke={pantsColor} strokeWidth="8" /><line x1="34" y1="143" x2="43" y2="143" strokeWidth="8" /></g>
      <g style={{ transformBox: 'view-box', transformOrigin: '49px 88px', animation: legB }}><path d="M49 88 L54 116 L56 143" stroke={pantsColor} strokeWidth="8" /><line x1="56" y1="143" x2="65" y2="143" strokeWidth="8" /></g>
    </g>
  )
}

/** Doodle take on the reference photo: dark-panel barbershop interior with three
    lit mirror stations and red chairs, sitting on a warm wood floor. */
function ShopInterior() {
  const station = (i: number) => (
    <div key={i} style={{ position: 'relative', width: 118, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* mirror with blinking side bulbs */}
      <div style={{ position: 'relative', width: 64, height: 74, background: 'linear-gradient(160deg,#eef3f6 0 45%,#cfdbe3 45% 100%)', border: `2.5px solid ${INK}`, borderRadius: 8 }}>
        <span style={{ position: 'absolute', left: 4, top: 4, fontSize: 15, opacity: 0.55 }}>✂</span>
        {[12, 36].map((ty, b) => (
          <span key={`l${ty}`} style={{ position: 'absolute', left: -11, top: ty, width: 8, height: 8, borderRadius: '50%', background: '#ffd76a', border: `2px solid ${INK}`, boxShadow: '0 0 8px 2px rgba(255,205,90,.7)', animation: `blink 1.6s ease-in-out ${(i + b) * 0.3}s infinite` }} />
        ))}
        {[12, 36].map((ty, b) => (
          <span key={`r${ty}`} style={{ position: 'absolute', right: -11, top: ty, width: 8, height: 8, borderRadius: '50%', background: '#ffd76a', border: `2px solid ${INK}`, boxShadow: '0 0 8px 2px rgba(255,205,90,.7)', animation: `blink 1.6s ease-in-out ${(i + b) * 0.3 + 0.8}s infinite` }} />
        ))}
      </div>
      {/* counter */}
      <div style={{ width: 92, height: 10, background: '#241f1e', border: `2.5px solid ${INK}`, borderRadius: 3, marginTop: 5 }} />
      {/* red chair */}
      <div style={{ position: 'relative', width: 70, height: 54, marginTop: 6 }}>
        <div style={{ position: 'absolute', left: 14, top: 0, width: 42, height: 26, background: '#d94f4f', border: `2.5px solid ${INK}`, borderRadius: '12px 12px 4px 4px' }} />
        <div style={{ position: 'absolute', left: 4, top: 21, width: 62, height: 16, background: '#d94f4f', border: `2.5px solid ${INK}`, borderRadius: 8 }} />
        <div style={{ position: 'absolute', left: 31, top: 37, width: 8, height: 10, background: '#b6bec5', border: `2px solid ${INK}` }} />
        <div style={{ position: 'absolute', left: 17, top: 46, width: 36, height: 7, background: '#b6bec5', border: `2px solid ${INK}`, borderRadius: 4 }} />
      </div>
    </div>
  )

  return (
    <div style={{ width: '100%', maxWidth: 470, border: `3px solid ${INK}`, borderRadius: 12, overflow: 'hidden', boxShadow: '4px 5px 0 rgba(43,43,43,.5)' }}>
      {/* tin ceiling */}
      <div style={{ height: 14, background: '#2e2926', borderBottom: `2.5px solid ${INK}`, backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 12px, transparent 12px 24px)' }} />
      {/* dark panelled wall with the three stations */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-evenly', alignItems: 'flex-end', paddingTop: 16, background: '#413a37', backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,.22) 0 2px, transparent 2px 46px)' }}>
        {[0, 1, 2].map(station)}
      </div>
      {/* wood floor */}
      <div style={{ height: 24, background: '#d9c6a5', borderTop: `2.5px solid ${INK}`, backgroundImage: 'repeating-linear-gradient(90deg, rgba(43,43,43,.28) 0 2px, transparent 2px 34px)' }} />
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
      <div data-anim="doodle" data-depth="45" style={{ position: 'absolute', left: '4%', bottom: 140 }}>
        <div style={{ animation: 'floatY 3s ease-in-out infinite alternate' }}>
          <svg width="66" height="26" viewBox="0 0 66 26"><path d="M8 18 Q18 2 31 14 Q32 15 33 15 Q34 15 35 14 Q48 2 58 18 Q48 24 35 17 Q33 16 31 17 Q18 24 8 18 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" /></svg>
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
      <div data-anim="doodle" data-depth="48" style={{ position: 'absolute', right: '12%', bottom: 320 }}>
        <div style={{ animation: 'floatY 4s ease-in-out infinite alternate' }}>
          <svg width="56" height="40" viewBox="0 0 56 40"><path d="M6 4 q0 26 22 26 q22 0 22 -26 q-8 12 -22 8 q-14 4 -22 -8 z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" /></svg>
        </div>
      </div>
    </>
  )
}
