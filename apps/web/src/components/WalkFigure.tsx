import { useEffect, useRef, type CSSProperties } from 'react'

const INK = '#1c1c1c'
const PAPER = '#ffffff'

export type WalkHairStyle =
  | 'curly'
  | 'spiky'
  | 'bob'
  | 'buzz'
  | 'messy'
  | 'low-fade'
  | 'high-fade'
  | 'taper-fade'
  | 'textured-crop'
  | 'pompadour'

interface WalkFigureProps {
  shirt?: string
  pants?: string
  hair?: string
  skin?: string
  hairStyle?: WalkHairStyle
  walking?: boolean
  showMotionLines?: boolean
  showGround?: boolean
  fresh?: boolean
  view?: 'side' | 'front' | 'back'
  direction?: 'left' | 'right'
  className?: string
  style?: CSSProperties
  title?: string
}

type AnimatedSvg = SVGSVGElement & {
  pauseAnimations?: () => void
  unpauseAnimations?: () => void
}

/** Direct React port of Walking Man Doodle.dc.html. */
export function WalkFigure({
  shirt = PAPER,
  pants = PAPER,
  hair = PAPER,
  skin = PAPER,
  hairStyle = 'curly',
  walking = true,
  showMotionLines = true,
  showGround = true,
  fresh = false,
  view = 'side',
  direction = 'right',
  className = '',
  style,
  title,
}: WalkFigureProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current as AnimatedSvg | null
    if (walking) svg?.unpauseAnimations?.()
    else svg?.pauseAnimations?.()
  }, [walking])

  if (view !== 'side') {
    return (
      <FacingFigure
        view={view}
        shirt={shirt}
        pants={pants}
        hair={hair}
        skin={skin}
        hairStyle={hairStyle}
        showGround={showGround}
        fresh={fresh}
        className={className}
        style={style}
        title={title}
      />
    )
  }

  const mirror = direction === 'left' ? 'translate(440 0) scale(-1 1)' : undefined

  return (
    <svg
      ref={svgRef}
      viewBox="80 10 280 500"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible', ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g transform={mirror}>
        {showGround ? (
          <path d="M 98 477 L 346 477" fill="none" stroke="#d8d5cf" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="2 34">
            <animate attributeName="stroke-dashoffset" from="0" to="72" dur="0.28s" repeatCount="indefinite" />
          </path>
        ) : null}

        {showMotionLines ? (
          <g fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
            <animate attributeName="opacity" values="0.25;1;0.25" dur="0.9s" repeatCount="indefinite" />
            <path d="M 130 176 Q 114 182 128 190" />
            <path d="M 122 214 Q 104 220 120 228" />
            <path d="M 128 252 Q 112 258 126 266" />
          </g>
        ) : null}

        <g>
          <animateTransform attributeName="transform" type="translate" values="0 8; 0 -2; 0 8; 0 -2; 0 8" keyTimes="0;0.25;0.5;0.75;1" dur="0.9s" repeatCount="indefinite" />

          <g>
            <animateTransform attributeName="transform" type="rotate" values="-20 202 246; 20 202 246; -20 202 246" keyTimes="0;0.5;1" dur="0.9s" begin="-0.45s" repeatCount="indefinite" />
            <path d="M 202 250 L 202 352" fill="none" stroke={INK} strokeWidth="34" strokeLinecap="round" />
            <path d="M 202 250 L 202 352" fill="none" stroke={pants} strokeWidth="25" strokeLinecap="round" />
            <g>
              <animateTransform attributeName="transform" type="rotate" values="4 202 352; 10 202 352; 16 202 352; 55 202 352; 14 202 352; 4 202 352" keyTimes="0;0.25;0.5;0.65;0.85;1" dur="0.9s" begin="-0.45s" repeatCount="indefinite" />
              <path d="M 202 348 L 202 434" fill="none" stroke={INK} strokeWidth="30" strokeLinecap="round" />
              <path d="M 202 348 L 202 434" fill="none" stroke={pants} strokeWidth="21" strokeLinecap="round" />
              <path d="M 202 430 L 202 450" fill="none" stroke={INK} strokeWidth="19" strokeLinecap="round" />
              <path d="M 202 430 L 202 450" fill="none" stroke={skin} strokeWidth="11" strokeLinecap="round" />
              <path d="M 195 437 L 209 436 M 195 443 L 209 442" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
              <g>
                <animateTransform attributeName="transform" type="rotate" values="-14 202 448; 0 202 448; 14 202 448; 4 202 448; -14 202 448" keyTimes="0;0.2;0.5;0.75;1" dur="0.9s" begin="-0.45s" repeatCount="indefinite" />
                <Shoe x={0} />
              </g>
            </g>
          </g>

          <g>
            <animateTransform attributeName="transform" type="rotate" values="-20 210 246; 20 210 246; -20 210 246" keyTimes="0;0.5;1" dur="0.9s" repeatCount="indefinite" />
            <path d="M 210 250 L 210 352" fill="none" stroke={INK} strokeWidth="34" strokeLinecap="round" />
            <path d="M 210 250 L 210 352" fill="none" stroke={pants} strokeWidth="25" strokeLinecap="round" />
            <g>
              <animateTransform attributeName="transform" type="rotate" values="4 210 352; 10 210 352; 16 210 352; 55 210 352; 14 210 352; 4 210 352" keyTimes="0;0.25;0.5;0.65;0.85;1" dur="0.9s" repeatCount="indefinite" />
              <path d="M 210 348 L 210 434" fill="none" stroke={INK} strokeWidth="30" strokeLinecap="round" />
              <path d="M 210 348 L 210 434" fill="none" stroke={pants} strokeWidth="21" strokeLinecap="round" />
              <path d="M 210 430 L 210 450" fill="none" stroke={INK} strokeWidth="19" strokeLinecap="round" />
              <path d="M 210 430 L 210 450" fill="none" stroke={skin} strokeWidth="11" strokeLinecap="round" />
              <path d="M 203 437 L 217 436 M 203 443 L 217 442" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
              <g>
                <animateTransform attributeName="transform" type="rotate" values="-14 210 448; 0 210 448; 14 210 448; 4 210 448; -14 210 448" keyTimes="0;0.2;0.5;0.75;1" dur="0.9s" repeatCount="indefinite" />
                <Shoe x={8} />
              </g>
            </g>
          </g>

          <g>
            <animateTransform attributeName="transform" type="rotate" values="-28 234 148; 32 234 148; -28 234 148" keyTimes="0;0.5;1" dur="0.9s" repeatCount="indefinite" />
            <path d="M 234 152 L 234 204" fill="none" stroke={INK} strokeWidth="18" strokeLinecap="round" />
            <path d="M 234 152 L 234 204" fill="none" stroke={skin} strokeWidth="10" strokeLinecap="round" />
            <g>
              <animateTransform attributeName="transform" type="rotate" values="-40 234 204; 18 234 204; -40 234 204" keyTimes="0;0.5;1" dur="0.9s" repeatCount="indefinite" />
              <path d="M 234 201 L 234 246" fill="none" stroke={INK} strokeWidth="18" strokeLinecap="round" />
              <path d="M 234 201 L 234 246" fill="none" stroke={skin} strokeWidth="10" strokeLinecap="round" />
            </g>
          </g>

          <path d="M 220 114 L 224 136" fill="none" stroke={INK} strokeWidth="22" strokeLinecap="round" />
          <path d="M 220 114 L 224 136" fill="none" stroke={skin} strokeWidth="13" strokeLinecap="round" />

          <path d="M 236 130 Q 258 138 264 158 Q 270 205 256 252 Q 216 260 178 252 Q 164 200 172 150 Q 178 136 196 128 Q 216 140 236 130 Z" fill={shirt} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M 198 130 Q 216 142 234 131" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />

          <path d="M 198 120 Q 186 108 186 88 Q 186 54 218 48 Q 244 52 250 76 Q 252 84 251 88 Q 258 94 252 100 Q 248 102 252 106 Q 256 112 248 116 Q 246 124 234 126 Q 214 130 198 120 Z" fill={skin} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
          {renderHair(hairStyle, hair, skin)}
          <path d="M 220 92 Q 210 90 211 100 Q 212 109 222 105" fill={skin} stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="240" cy="90" r="3.2" fill={INK} />
          <path d="M 234 79 Q 242 76 247 80" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M 236 110 Q 242 113 247 108" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />

          <g>
            <animateTransform attributeName="transform" type="rotate" values="32 202 146; -28 202 146; 32 202 146" keyTimes="0;0.5;1" dur="0.9s" repeatCount="indefinite" />
            <path d="M 202 150 L 202 204" fill="none" stroke={INK} strokeWidth="18" strokeLinecap="round" />
            <path d="M 202 150 L 202 204" fill="none" stroke={skin} strokeWidth="10" strokeLinecap="round" />
            <path d="M 202 142 L 202 172" fill="none" stroke={INK} strokeWidth="30" strokeLinecap="round" />
            <path d="M 202 142 L 202 172" fill="none" stroke={shirt} strokeWidth="21" strokeLinecap="round" />
            <g>
              <animateTransform attributeName="transform" type="rotate" values="18 202 204; -40 202 204; 18 202 204" keyTimes="0;0.5;1" dur="0.9s" repeatCount="indefinite" />
              <path d="M 202 201 L 202 256" fill="none" stroke={INK} strokeWidth="18" strokeLinecap="round" />
              <path d="M 202 201 L 202 256" fill="none" stroke={skin} strokeWidth="10" strokeLinecap="round" />
            </g>
          </g>

          {fresh ? <FreshSparkles /> : null}
        </g>
      </g>
    </svg>
  )
}

function FacingFigure({
  view,
  shirt,
  pants,
  hair,
  skin,
  hairStyle,
  showGround,
  fresh,
  className,
  style,
  title,
}: Required<Pick<WalkFigureProps, 'shirt' | 'pants' | 'hair' | 'skin' | 'hairStyle' | 'showGround' | 'fresh' | 'className'>> &
  Pick<WalkFigureProps, 'style' | 'title'> & { view: 'front' | 'back' }) {
  const front = view === 'front'

  return (
    <svg
      viewBox="80 10 280 500"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible', ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {showGround ? <path d="M 98 477 L 346 477" fill="none" stroke="#d8d5cf" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="2 34" /> : null}

      <g stroke={INK} strokeLinecap="round" strokeLinejoin="round">
        {hairStyle === 'bob' ? <path d="M 181 93 Q 177 43 220 39 Q 263 43 259 94 L252 126 Q 238 111 220 113 Q 201 111 188 126 Z" fill={hair} strokeWidth="4.5" /> : null}

        <path d="M 204 247 Q 203 338 195 431" fill="none" stroke={INK} strokeWidth="34" />
        <path d="M 204 247 Q 203 338 195 431" fill="none" stroke={pants} strokeWidth="25" />
        <path d="M 236 247 Q 237 338 245 431" fill="none" stroke={INK} strokeWidth="34" />
        <path d="M 236 247 Q 237 338 245 431" fill="none" stroke={pants} strokeWidth="25" />

        <path d="M 185 438 Q 171 448 176 465 Q 193 477 214 468 L214 447 Q 199 440 185 438 Z" fill={PAPER} strokeWidth="4.5" />
        <path d="M 255 438 Q 269 448 264 465 Q 247 477 226 468 L226 447 Q 241 440 255 438 Z" fill={PAPER} strokeWidth="4.5" />
        <path d="M 179 461 Q 194 468 211 462 M261 461 Q246 468 229 462" fill="none" strokeWidth="3.5" />

        <path d={front ? 'M 190 151 Q 170 176 169 239 Q 168 257 159 269' : 'M 190 151 Q 173 178 175 239 Q 176 256 166 269'} fill="none" stroke={INK} strokeWidth="18" />
        <path d={front ? 'M 190 151 Q 170 176 169 239 Q 168 257 159 269' : 'M 190 151 Q 173 178 175 239 Q 176 256 166 269'} fill="none" stroke={skin} strokeWidth="10" />
        <path d={front ? 'M 250 151 Q 270 176 271 239 Q 272 257 281 269' : 'M 250 151 Q 268 174 269 218 Q 270 236 282 246'} fill="none" stroke={INK} strokeWidth="18" />
        <path d={front ? 'M 250 151 Q 270 176 271 239 Q 272 257 281 269' : 'M 250 151 Q 268 174 269 218 Q 270 236 282 246'} fill="none" stroke={skin} strokeWidth="10" />

        <path d="M 218 112 L 218 137 M 222 112 L 222 137" fill="none" stroke={INK} strokeWidth="22" />
        <path d="M 218 112 L 218 137 M 222 112 L 222 137" fill="none" stroke={skin} strokeWidth="13" />
        <path d="M 192 130 Q 220 141 248 130 Q 263 141 268 162 Q 270 208 258 253 Q 220 261 182 253 Q 170 208 172 162 Q 177 141 192 130 Z" fill={shirt} strokeWidth="4.5" />
        <path d={front ? 'M 197 132 Q 220 151 243 132' : 'M 198 132 Q 220 124 242 132'} fill="none" strokeWidth="3.5" />

        <ellipse cx="220" cy="87" rx="33" ry="41" fill={skin} strokeWidth="4.5" />
        {renderFacingHair(hairStyle, hair, skin)}

        {front ? (
          <g fill="none">
            <path d="M 207 87 h1 M 232 87 h1" strokeWidth="4" />
            <path d="M 220 91 Q 216 100 222 101" strokeWidth="3" />
            <path d="M 207 111 Q 220 122 234 110" strokeWidth="3.5" />
            <path d="M 200 77 Q 207 72 213 77 M227 77 Q234 72 240 77" strokeWidth="3" />
          </g>
        ) : (
          <g fill="none">
            <path d="M 194 92 Q 187 99 194 107 M246 92 Q253 99 246 107" strokeWidth="3" />
            <path d="M 205 119 Q 220 126 235 119" strokeWidth="3" opacity=".55" />
          </g>
        )}

        {fresh ? <FreshSparkles /> : null}
      </g>
    </svg>
  )
}

function renderFacingHair(style: WalkHairStyle, hair: string, skin: string) {
  switch (style) {
    case 'curly':
      return (
        <g fill={hair} stroke={INK} strokeWidth="4">
          <circle cx="192" cy="65" r="14" /><circle cx="203" cy="49" r="15" /><circle cx="220" cy="43" r="16" />
          <circle cx="238" cy="49" r="15" /><circle cx="249" cy="65" r="14" />
        </g>
      )
    case 'spiky':
    case 'messy':
      return <path d="M 188 76 L181 55 L197 59 L198 38 L211 49 L220 27 L230 49 L246 35 L244 58 L258 53 L252 76 Q 220 58 188 76 Z" fill={hair} strokeWidth="4.5" />
    case 'bob':
      return <path d="M 187 78 Q 192 42 220 42 Q 249 42 254 78 Q 238 64 220 70 Q 202 63 187 78 Z" fill={hair} strokeWidth="4.5" />
    case 'buzz':
      return (
        <g>
          <path d="M 188 76 Q 191 45 220 43 Q 249 45 252 76 Q 220 59 188 76 Z" fill={hair} strokeWidth="4.5" />
          <path d="M 203 55 l5 4 M218 50 l5 4 M234 55 l5 4" stroke={skin} strokeWidth="2.5" />
        </g>
      )
    case 'low-fade':
      return (
        <g>
          <path d="M 190 69 Q 194 39 220 38 Q 247 40 251 69 Q 220 54 190 69 Z" fill={hair} strokeWidth="4.5" />
          <path d="M 189 70 Q 187 82 191 94 M251 70 Q253 82 249 94" fill="none" stroke={hair} strokeWidth="5" />
          <path d="M 189 84 l8 1 M243 85 l8 -1" strokeWidth="2" opacity=".5" />
        </g>
      )
    case 'high-fade':
      return (
        <g>
          <path d="M 194 62 L198 39 L210 44 L220 27 L231 44 L247 32 L249 63 Q 221 50 194 62 Z" fill={hair} strokeWidth="4.5" />
          <path d="M 190 68 Q 188 80 191 89 M250 67 Q252 79 249 89" fill="none" stroke={hair} strokeWidth="4" />
        </g>
      )
    case 'taper-fade':
      return (
        <g>
          <path d="M 190 70 Q 193 46 207 48 Q 220 29 247 39 Q 254 48 250 68 Q 231 52 218 59 Q 203 53 190 70 Z" fill={hair} strokeWidth="4.5" />
          <path d="M 190 72 q-2 12 2 22 M250 71 q2 12 -2 22" fill="none" stroke={hair} strokeWidth="4" />
        </g>
      )
    case 'textured-crop':
      return <path d="M 188 73 Q 193 42 220 40 Q 248 42 253 72 L245 79 L238 71 L229 79 L220 71 L211 79 L202 71 L193 80 Z" fill={hair} strokeWidth="4.5" />
    case 'pompadour':
      return <path d="M 187 75 Q 190 53 204 52 Q 203 29 222 31 Q 251 23 257 52 Q 258 65 251 73 Q 235 54 220 61 Q 204 54 187 75 Z" fill={hair} strokeWidth="4.5" />
  }
}

function Shoe({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M 191 442 Q 185 448 185 460 Q 185 472 200 474 Q 218 475 232 470 Q 244 465 248 456 Q 250 447 239 444 Q 224 440 213 443 Q 203 445 191 442 Z" fill={PAPER} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M 188 460 Q 204 468 224 465 Q 238 462 244 454" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 201 448 Q 205 455 213 452" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

function FreshSparkles() {
  return (
    <g fill="none" stroke="#d7a91d" strokeWidth="4" strokeLinecap="round">
      <animate attributeName="opacity" values=".2;1;.2" dur=".9s" repeatCount="indefinite" />
      <path d="M 286 60 V84 M274 72 H298 M166 78 V96 M157 87 H175" />
    </g>
  )
}

function renderHair(style: WalkHairStyle, hair: string, skin: string) {
  switch (style) {
    case 'curly':
      return <path d="M 250 68 a 12 12 0 0 0 -12 -14 a 13 13 0 0 0 -22 -8 a 12 12 0 0 0 -22 2 a 11 11 0 0 0 -12 14 a 10 10 0 0 0 0 16 a 9 9 0 0 0 4 14 a 8 8 0 0 0 8 10 a 10 10 0 0 0 14 -8 a 10 10 0 0 0 14 -10 a 10 10 0 0 0 14 -10 a 9 9 0 0 0 14 -6 Z" fill={hair} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
    case 'spiky':
      return <path d="M 184 88 L174 66 L190 70 L190 48 L205 60 L216 38 L225 60 L244 43 L241 66 L257 59 L250 80 Q232 61 211 69 Q198 75 184 88 Z" fill={hair} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
    case 'bob':
      return <path d="M 183 91 Q174 52 211 43 Q247 42 254 77 L250 105 Q241 95 235 78 Q216 68 198 82 L194 107 Q182 103 183 91 Z" fill={hair} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
    case 'buzz':
      return (
        <g>
          <path d="M 184 82 Q186 52 216 47 Q244 50 251 76 Q224 61 196 77 Z" fill={hair} stroke={INK} strokeWidth="4.5" />
          <path d="M 198 61 l5 4 M214 55 l5 4 M231 58 l5 4" stroke={skin} strokeWidth="2.5" />
        </g>
      )
    case 'messy':
      return <path d="M 183 88 L177 67 L190 70 L188 49 L204 61 L213 39 L224 59 L241 43 L239 66 L253 61 L250 81 Q229 62 211 70 Q196 74 183 88 Z" fill={hair} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
    case 'low-fade':
      return (
        <g>
          <path d="M 186 78 Q187 50 217 45 Q245 48 251 75 Q228 59 198 72 Z" fill={hair} stroke={INK} strokeWidth="4.5" />
          <path d="M 187 78 Q186 88 190 97 M250 75 Q251 84 249 91" fill="none" stroke={hair} strokeWidth="6" />
          <path d="M 188 88 l8 2 M244 82 l7 -1" stroke={INK} strokeWidth="2" opacity=".55" />
        </g>
      )
    case 'high-fade':
      return (
        <g>
          <path d="M 190 68 L194 45 L206 50 L216 33 L226 49 L243 37 L248 68 Q224 55 190 68 Z" fill={hair} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M 187 75 Q187 86 190 94 M250 72 Q251 82 249 89" fill="none" stroke={hair} strokeWidth="4" />
        </g>
      )
    case 'taper-fade':
      return (
        <g>
          <path d="M 186 77 Q187 54 204 55 Q216 35 244 43 Q253 52 250 72 Q231 56 214 65 Q201 58 186 77 Z" fill={hair} stroke={INK} strokeWidth="4.5" />
          <path d="M 187 78 q-1 11 3 19 M250 73 q2 10 -1 18" stroke={hair} strokeWidth="4" />
        </g>
      )
    case 'textured-crop':
      return <path d="M 184 79 Q187 49 217 46 Q246 49 252 74 L244 80 L237 72 L228 80 L219 72 L210 81 L201 73 L191 84 Z" fill={hair} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
    case 'pompadour':
      return <path d="M 183 82 Q184 61 201 60 Q198 35 219 36 Q249 27 257 57 Q258 70 250 79 Q232 58 215 69 Q200 62 183 82 Z" fill={hair} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
  }
}
