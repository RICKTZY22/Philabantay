import { useEffect, type RefObject } from 'react'

/**
 * Choreography ng How It Works: card reveals, parallax doodles, at scissors na
 * sumusunod sa five-step path. Uulit ito kapag nag-flip customer/barber at
 * lilinisin lahat ng GSAP triggers bago gumawa ng bago.
 *
 * IMPORTANT - MAY CONTRACT ITO SA `data-anim` AT CSS CLASS NAMES:
 * Huwag mag-rename ng selectors sa LandingPage nang hindi ina-update dito,
 * dahil tahimik lang mawawala ang animation at walang TypeScript error.
 */
export function useJourneyScroll(
  rootRef: RefObject<HTMLDivElement | null>,
  audience: 'customer' | 'barber',
) {
  useEffect(() => {
    const root = rootRef.current
    const hero = root?.querySelector<HTMLElement>('.phil-hero-main')
    const storefront = root?.querySelector<HTMLElement>('.phil-neighborhood-stage')
    if (!root || !hero) return undefined

    // Walang visual na binabago: pini-freeze lang ang looping CSS doodles kapag
    // nasa ibang tab o malayo na sa viewport ang buong hero/street section.
    const syncPageVisibility = () => {
      root.dataset.animationPaused = document.hidden ? 'true' : 'false'
    }
    const observer = new IntersectionObserver(([entry]) => {
      hero.dataset.animationPaused = entry?.isIntersecting ? 'false' : 'true'
    }, { rootMargin: '160px 0px' })
    const storefrontObserver = storefront
      ? new IntersectionObserver(([entry]) => {
          storefront.dataset.animationPaused = entry?.isIntersecting ? 'false' : 'true'
        }, { rootMargin: '160px 0px' })
      : null

    syncPageVisibility()
    observer.observe(hero)
    if (storefront && storefrontObserver) storefrontObserver.observe(storefront)
    document.addEventListener('visibilitychange', syncPageVisibility)
    return () => {
      observer.disconnect()
      storefrontObserver?.disconnect()
      document.removeEventListener('visibilitychange', syncPageVisibility)
      delete root.dataset.animationPaused
      delete hero.dataset.animationPaused
      if (storefront) delete storefront.dataset.animationPaused
    }
  }, [rootRef])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let cancelled = false
    let cleanup: (() => void) | undefined

    // IMPORTANT: post-paint dynamic import ito. Pareho pa rin ang choreography,
    // pero hindi na kailangang i-parse ang GSAP bago lumabas ang auth billboard.
    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([
      { gsap },
      { ScrollTrigger },
    ]) => {
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)

      const ctx = gsap.context(() => {
      const title = root.querySelector('[data-anim="s2title"]')
      if (title) {
        gsap.fromTo(title, { y: 70, opacity: 0, rotation: -2 }, { y: 0, opacity: 1, rotation: 0, duration: 0.9, ease: 'power2.out', scrollTrigger: { trigger: title, start: 'top 88%' } })
      }
      root.querySelectorAll<HTMLElement>('[data-anim="card"]').forEach((el) => {
        // Bitawan ang inline transform pagkatapos para gumana ulit ang CSS hover.
        gsap.fromTo(
          el,
          {
            x: Number.parseFloat(el.dataset.enterX ?? '0'),
            y: 110,
            scale: 0.78,
            opacity: 0,
            rotation: Number.parseFloat(el.dataset.tilt ?? '3'),
          },
          {
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            rotation: 0,
            duration: 0.9,
            delay: Number.parseFloat(el.dataset.order ?? '0') * 0.06,
            ease: 'back.out(1.45)',
            scrollTrigger: { trigger: el, start: 'top 90%' },
            onComplete: () => gsap.set(el, { clearProps: 'transform' }),
          },
        )
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
      const path = root.querySelector<SVGPathElement>('[data-anim="path"]')
      const guide = root.querySelector<SVGPathElement>('[data-anim="path-guide"]')
      const walker = root.querySelector<HTMLElement>('[data-anim="s2walker"]')
      if (wrap && walker) {
        const badges = Array.from(root.querySelectorAll<HTMLElement>('.phil-badge-no'))
        const lastCard = wrap.querySelector<HTMLElement>('.phil-pile-slot-5')
        const route = { progress: 0 }
        let routeLength = 0
        let routeStops: number[] = []

        const layoutCenter = (element: HTMLElement) => {
          let x = element.offsetWidth / 2
          let y = element.offsetHeight / 2
          let current: HTMLElement | null = element

          // Layout position ang kailangan, hindi temporary GSAP reveal transform.
          while (current && current !== wrap) {
            x += current.offsetLeft
            y += current.offsetTop
            current = current.offsetParent as HTMLElement | null
          }

          return { x, y }
        }

        const updateRouteGeometry = () => {
          if (!path) return
          const points = badges.map(layoutCenter)
          const [one, two, three, four, five] = points
          const rightGutter = wrap.clientWidth - 30
          const topHandle = (two.x - one.x) * .48
          const bottomHandle = (four.x - five.x) * .48
          const routeD = [
            `M ${one.x} ${one.y}`,
            `C ${one.x + topHandle} ${one.y}, ${two.x - topHandle} ${two.y}, ${two.x} ${two.y}`,
            `C ${two.x + 55} ${two.y}, ${rightGutter} ${two.y + 25}, ${rightGutter} ${two.y + 88}`,
            `C ${rightGutter} ${three.y - 72}, ${three.x + 72} ${three.y}, ${three.x} ${three.y}`,
            `C ${three.x + 72} ${three.y}, ${rightGutter} ${three.y + 28}, ${rightGutter} ${three.y + 92}`,
            `C ${rightGutter} ${four.y - 62}, ${four.x + 62} ${four.y}, ${four.x} ${four.y}`,
            `C ${four.x - bottomHandle} ${four.y}, ${five.x + bottomHandle} ${five.y}, ${five.x} ${five.y}`,
          ].join(' ')

          path.setAttribute('d', routeD)
          guide?.setAttribute('d', routeD)
          routeLength = path.getTotalLength()
          path.style.strokeDasharray = `${routeLength}`

          // Hanapin ang totoong stop ng bawat badge sa curved SVG route.
          routeStops = points.map((target) => {
            let closestDistance = 0
            let closestDelta = Number.POSITIVE_INFINITY
            for (let sample = 0; sample <= 180; sample += 1) {
              const distance = routeLength * sample / 180
              const point = path.getPointAtLength(distance)
              const delta = (point.x - target.x) ** 2 + (point.y - target.y) ** 2
              if (delta < closestDelta) {
                closestDelta = delta
                closestDistance = distance
              }
            }
            return routeLength ? closestDistance / routeLength : 0
          })
        }

        const renderRoute = () => {
          if (!path || !routeLength) return
          const distance = routeLength * route.progress
          const point = path.getPointAtLength(distance)
          const tangentStart = path.getPointAtLength(Math.max(0, distance - 2))
          const tangentEnd = path.getPointAtLength(Math.min(routeLength, distance + 2))
          const angle = Math.atan2(tangentEnd.y - tangentStart.y, tangentEnd.x - tangentStart.x) * 180 / Math.PI

          path.style.strokeDashoffset = `${routeLength - distance}`
          // Pababa ang default scissors art; -90deg ang nag-a-align sa path tangent.
          walker.style.transform = `translate3d(${point.x - 28}px, ${point.y - 34}px, 0) rotate(${angle - 90}deg)`
          walker.classList.toggle('is-finished', route.progress >= .995)
          badges.forEach((badge, index) => {
            const stop = routeStops[index] ?? 1
            const hasPassed = index === badges.length - 1
              ? route.progress >= .995
              : route.progress >= stop + .025
            badge.classList.toggle('is-cut', hasPassed)
          })
        }

        updateRouteGeometry()
        gsap.fromTo(
          route,
          { progress: 0 },
          {
            progress: 1,
            ease: 'none',
            immediateRender: true,
            scrollTrigger: {
              trigger: wrap,
              start: 'top 70%',
              // Tapusin habang kita pa ang fifth card at final snip.
              endTrigger: lastCard ?? wrap,
              end: 'top 28%',
              scrub: 0.4,
              invalidateOnRefresh: true,
              onRefresh: () => {
                updateRouteGeometry()
                renderRoute()
              },
            },
            onUpdate: renderRoute,
            onComplete: renderRoute,
            onReverseComplete: renderRoute,
          },
        )
      }
      }, root)
      cleanup = () => ctx.revert()
    }).catch(() => {
      // Enhancement lang ang GSAP; kompleto at visible pa rin ang static layout.
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [audience])
}
