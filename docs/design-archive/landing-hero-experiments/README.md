# Retired landing-hero experiments

This folder is intentionally outside `apps/web/src`. Nothing here is imported
by the web application or included in its runtime asset graph.

## Archived generated artwork

- `philabantay-hero-world-v3.webp` — retired 2026-07-29 because its large,
  dark portal created a visual hole between the space and city halves.
- `philabantay-hero-morning-two-phase-v1.webp` and
  `philabantay-hero-night-two-phase-v1.webp` — retired 2026-07-29 when the
  hero expanded from a two-scene crossfade to four activity-specific
  Philippine-time scenes.

## Retired hero walker

The hero-specific moving-person wrapper and its travel keyframes were removed
from `LandingPage.tsx` and `LandingPage.css` on 2026-07-29. The reusable
`WalkFigure` component remains available to the wider app, but it is no longer
connected to the landing hero.

Retired markup:

```tsx
<div className="phil-hero-walking-kid" aria-hidden="true">
  <WalkFigure
    direction="left"
    hairStyle="spiky"
    skin="#d99a72"
    hair="#2f2828"
    shirt="#ef8f72"
    pants="#314d83"
    showGround={false}
    showMotionLines={false}
  />
</div>
```

Retired movement:

```css
@keyframes philHeroKidTravel {
  0% { opacity: 0; transform: translate3d(12vw, 0, 0); }
  8%, 88% { opacity: 1; }
  100% { opacity: 0; transform: translate3d(-28vw, 0, 0); }
}
```

## Replacement

The current hero uses four aligned `1915x821` generated scenes:

- `apps/web/src/assets/philabantay-hero-morning-v2.webp`
- `apps/web/src/assets/philabantay-hero-afternoon-v1.webp`
- `apps/web/src/assets/philabantay-hero-evening-v1.webp`
- `apps/web/src/assets/philabantay-hero-midnight-v1.webp`

They contain grounded, phase-specific people and traffic around one small
hand-drawn split seam. Live Asia/Manila time selects exactly one scene. Laptop
and phone shells remain inline SVG line art with lightweight animated HTML UI
inside.
