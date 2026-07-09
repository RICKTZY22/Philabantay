import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Generic, attribute-driven scroll animations ported from paqueuehan-bills.
 * Components opt in by tagging elements — the runtime finds them by selector:
 *   [data-reveal]        → fade + rise in on scroll
 *   [data-reveal-group]  → stagger its direct children in
 *   [data-parallax="0.2"]→ vertical parallax (number = speed)
 *   [data-count]         → count up to a numeric target (data-count="1200")
 *   [data-guide-pin]     → pinned, scrubbed card deck (with [data-guide-card]/[data-guide-dot])
 *
 * Returns a cleanup function that reverts everything (StrictMode/route-change safe).
 */
export function runDoodleAnimations(root: HTMLElement): () => void {
  ScrollTrigger.getAll().forEach((t) => t.kill(true))

  const context = gsap.context(() => {
    animateReveals(root)
    animateCountUps(root)
    animatePinnedGuide(root)
  }, root)

  // Layout may settle after fonts/images — recompute trigger positions.
  ScrollTrigger.refresh()

  return () => {
    context.revert()
    ScrollTrigger.getAll().forEach((t) => t.kill(true))
  }
}

function animateReveals(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      autoAlpha: 0,
      y: 34,
      duration: 0.62,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    })
  })

  root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
    gsap.from(group.children, {
      autoAlpha: 0,
      y: 28,
      stagger: 0.08,
      duration: 0.55,
      ease: 'power2.out',
      scrollTrigger: { trigger: group, start: 'top 88%' },
    })
  })

  root.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const speed = Number.parseFloat(el.dataset.parallax ?? '') || 0.15
    gsap.to(el, {
      y: () => -window.innerHeight * speed,
      ease: 'none',
      scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: 0.5 },
    })
  })
}

function animateCountUps(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const target = Number.parseFloat(el.dataset.count ?? '') || 0
    const prefix = el.dataset.countPrefix ?? ''
    const suffix = el.dataset.countSuffix ?? ''
    const proxy = { value: 0 }
    gsap.to(proxy, {
      value: target,
      duration: 1.1,
      ease: 'power1.out',
      scrollTrigger: { trigger: el, start: 'top 90%' },
      onUpdate: () => {
        el.textContent = `${prefix}${Math.round(proxy.value)}${suffix}`
      },
    })
  })
}

/** Pinned, scrubbed deck. Falls back to a static first-card view on small screens. */
function animatePinnedGuide(root: HTMLElement) {
  const section = root.querySelector<HTMLElement>('[data-guide-pin]')
  if (!section) return

  const cards = gsap.utils.toArray<HTMLElement>(section.querySelectorAll('[data-guide-card]'))
  const dots = gsap.utils.toArray<HTMLElement>(section.querySelectorAll('[data-guide-dot]'))
  if (cards.length < 2) return

  const isMobile = window.matchMedia('(max-width: 680px)').matches
  if (isMobile) {
    cards.forEach((card, i) => gsap.set(card, { autoAlpha: i === 0 ? 1 : 0 }))
    dots.forEach((dot, i) => gsap.set(dot, { autoAlpha: i === 0 ? 1 : 0.35 }))
    return
  }

  gsap.set(cards, { autoAlpha: 0 })
  gsap.set(cards[0], { autoAlpha: 1 })

  const timeline = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${Math.max(2200, cards.length * 620)}`,
      scrub: true,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  })

  cards.forEach((card, i) => {
    if (i === 0) return
    const prev = cards[i - 1]
    timeline
      .to(prev, { autoAlpha: 0, duration: 0.4 })
      .to(card, { autoAlpha: 1, duration: 0.4 }, '<')
    if (dots[i]) {
      timeline.to(dots[i], { autoAlpha: 1, duration: 0.2 }, '<')
      if (dots[i - 1]) timeline.to(dots[i - 1], { autoAlpha: 0.35, duration: 0.2 }, '<')
    }
  })
}

/** Force final visible state without GSAP (used for prefers-reduced-motion). */
export function revealStaticState(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>('[data-reveal], [data-parallax]')
    .forEach((el) => {
      el.style.opacity = '1'
      el.style.visibility = 'visible'
      el.style.transform = 'none'
    })
  root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
    Array.from(group.children).forEach((child) => {
      const el = child as HTMLElement
      el.style.opacity = '1'
      el.style.visibility = 'visible'
      el.style.transform = 'none'
    })
  })
  root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const prefix = el.dataset.countPrefix ?? ''
    const suffix = el.dataset.countSuffix ?? ''
    el.textContent = `${prefix}${el.dataset.count ?? ''}${suffix}`
  })
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-guide-card]'))
  cards.forEach((card, i) => {
    card.style.opacity = i === 0 ? '1' : '0'
  })
}
