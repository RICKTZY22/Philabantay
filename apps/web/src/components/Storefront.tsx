import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { SHOP_NAME } from '@barbershop/shared'
import { WalkFigure, type WalkHairStyle } from './WalkFigure'
import './Storefront.css'

/**
 * The animated Philabantay storefront: sun and clouds, gliding birds, spinning
 * poles, the snipping window, the swinging door, and a doodle customer who
 * walks in scruffy and struts out with a randomised fresh cut. Extracted from the
 * landing page so it can also live at the bottom of the auth page.
 */

const COLORS = ['#4f6fd9', '#d94f4f', '#3f9b62', '#e0913f', '#8e5fc9', '#3aa6a6']
const PANTS = ['#3a4668', '#6b4a3a', '#4a5d3a', '#7a4a68']
const SKIN_TONES = ['#c98762', '#a96f50', '#d69b74', '#8f5e43', '#e0ad86']
const SCRUFFY_HAIR: WalkHairStyle[] = ['curly', 'spiky', 'bob', 'messy', 'buzz']
const FRESH_CUTS: Array<{ hair: WalkHairStyle; label: string }> = [
  { hair: 'low-fade', label: 'freshly faded!' },
  { hair: 'high-fade', label: 'high fade, fresh!' },
  { hair: 'taper-fade', label: 'clean taper!' },
  { hair: 'textured-crop', label: 'crispy crop!' },
  { hair: 'pompadour', label: 'fresh volume!' },
  { hair: 'buzz', label: 'clean buzz!' },
  { hair: 'bob', label: 'fresh trim!' },
]
const ACCENT = '#f4b8c4'
const INK = '#2b2b2b'

interface Win { l: number; t: number; w: number; h: number }

export function Building({
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

export const bird = (w: number, h: number) => (
  <svg width={w} height={h} viewBox="0 0 34 14">
    <path d="M2 10 Q9 2 16 10 M16 10 Q23 2 32 10" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

export function Storefront() {
  const [s, setS] = useState({ inHair: 0, outCut: 0, colorIdx: 0, pantsIdx: 0, skinIdx: 0 })
  const walkerRef = useRef<HTMLDivElement>(null)

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
        inHair: pick(SCRUFFY_HAIR.length, p.inHair),
        outCut: pick(FRESH_CUTS.length, p.outCut),
        colorIdx: pick(6, p.colorIdx),
        pantsIdx: pick(4, p.pantsIdx),
        skinIdx: pick(SKIN_TONES.length, p.skinIdx),
      }))
    }
    w.addEventListener('animationiteration', onIter)
    return () => w.removeEventListener('animationiteration', onIter)
  }, [])

  const shirtColor = COLORS[s.colorIdx]
  const pantsColor = PANTS[s.pantsIdx]
  const skinColor = SKIN_TONES[s.skinIdx]
  const freshCut = FRESH_CUTS[s.outCut]
  const vars = { '--accent': ACCENT, '--walk': '12s' } as CSSProperties

  return (
    <div className="phil-stage phil-neighborhood-stage" style={vars}>
      <CityDoodleBackdrop />
      <div className="phil-shop-core">
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
      <div ref={walkerRef} className="phil-doodle-walker phil-doodle-walker-in" style={{ animation: 'walkIn var(--walk, 12s) linear infinite' }}>
        <div className="phil-walker-view phil-walker-side-in">
          <WalkFigure
            hairStyle={SCRUFFY_HAIR[s.inHair]}
            hair="#3f3029"
            shirt={shirtColor}
            pants={pantsColor}
            skin={skinColor}
          />
        </div>
        <div className="phil-walker-view phil-walker-back-in">
          <WalkFigure
            view="back"
            walking={false}
            showMotionLines={false}
            hairStyle={SCRUFFY_HAIR[s.inHair]}
            hair="#3f3029"
            shirt={shirtColor}
            pants={pantsColor}
            skin={skinColor}
          />
        </div>
      </div>

      {/* walk-out figure */}
      <div className="phil-walker-out phil-doodle-walker phil-doodle-walker-out" style={{ animation: 'walkOut var(--walk, 12s) linear infinite' }}>
        <div className="fresh-cut-tag" style={{ animation: 'freshTag var(--walk, 12s) linear infinite' }}>{freshCut.label}</div>
        <div className="phil-walker-view phil-walker-front-out">
          <WalkFigure
            view="front"
            walking={false}
            showMotionLines={false}
            hairStyle={freshCut.hair}
            hair="#2f2926"
            shirt={shirtColor}
            pants={pantsColor}
            skin={skinColor}
            fresh
          />
        </div>
        <div className="phil-walker-view phil-walker-side-out">
          <WalkFigure
            hairStyle={freshCut.hair}
            hair="#2f2926"
            shirt={shirtColor}
            pants={pantsColor}
            skin={skinColor}
            fresh
          />
        </div>
      </div>
      </div>
    </div>
  )
}

function CityDoodleBackdrop() {
  return (
    <div className="city-doodle" aria-hidden="true">
      <Building
        pos={{ left: 6, top: 192 }}
        w={132}
        h={260}
        body="#dfd1bd"
        roof="#a89478"
        windows={[
          { l: 16, t: 25, w: 25, h: 27 }, { l: 83, t: 25, w: 25, h: 27 },
          { l: 16, t: 82, w: 25, h: 27 }, { l: 83, t: 82, w: 25, h: 27 },
          { l: 16, t: 139, w: 25, h: 27 }, { l: 83, t: 139, w: 25, h: 27 },
        ]}
      />
      <Building
        pos={{ left: 126, top: 276 }}
        w={106}
        h={176}
        body="#d5e3ec"
        roof="#93aebf"
        windows={[
          { l: 14, t: 24, w: 23, h: 25 }, { l: 63, t: 24, w: 23, h: 25 },
          { l: 14, t: 78, w: 23, h: 25 }, { l: 63, t: 78, w: 23, h: 25 },
        ]}
      />
      <Building
        pos={{ left: 220, top: 234 }}
        w={88}
        h={218}
        body="#ead7d1"
        roof="#c5a29a"
        windows={[
          { l: 12, t: 26, w: 21, h: 24 }, { l: 51, t: 26, w: 21, h: 24 },
          { l: 12, t: 82, w: 21, h: 24 }, { l: 51, t: 82, w: 21, h: 24 },
        ]}
      />
      <Building
        pos={{ right: 210, top: 248 }}
        w={94}
        h={204}
        body="#dbe6d5"
        roof="#99b38f"
        windows={[
          { l: 12, t: 26, w: 22, h: 24 }, { l: 54, t: 26, w: 22, h: 24 },
          { l: 12, t: 82, w: 22, h: 24 }, { l: 54, t: 82, w: 22, h: 24 },
        ]}
      />
      <Building
        pos={{ right: 116, top: 288 }}
        w={104}
        h={164}
        body="#eddfbd"
        roof="#bcae77"
        windows={[
          { l: 14, t: 24, w: 23, h: 25 }, { l: 62, t: 24, w: 23, h: 25 },
          { l: 14, t: 76, w: 23, h: 25 }, { l: 62, t: 76, w: 23, h: 25 },
        ]}
      />
      <Building
        pos={{ right: 0, top: 206 }}
        w={128}
        h={246}
        body="#d8dfea"
        roof="#929fb9"
        windows={[
          { l: 15, t: 26, w: 24, h: 26 }, { l: 78, t: 26, w: 24, h: 26 },
          { l: 15, t: 83, w: 24, h: 26 }, { l: 78, t: 83, w: 24, h: 26 },
          { l: 15, t: 140, w: 24, h: 26 }, { l: 78, t: 140, w: 24, h: 26 },
        ]}
      />

      <div className="city-water-tower"><span>BRGY.<br />2026</span></div>
      <div className="city-doodle-sign city-doodle-sign-kape">KAPE</div>
      <div className="city-doodle-sign city-doodle-sign-pandesal">PANDESAL</div>
      <div className="city-doodle-tree city-doodle-tree-left" />
      <div className="city-doodle-tree city-doodle-tree-right" />
      <div className="city-doodle-lamp city-doodle-lamp-left"><span /></div>
      <div className="city-doodle-lamp city-doodle-lamp-right"><span /></div>

      <div className="city-sidewalk" />
      <div className="city-road"><span /></div>
    </div>
  )
}
