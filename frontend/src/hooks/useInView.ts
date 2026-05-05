import { useEffect, useRef, useState } from 'react'

/**
 * Returns a ref to attach to an element + a boolean that flips to true once
 * the element is visible in the viewport.
 *
 * Strategy:
 *   1. On mount, immediately check getBoundingClientRect — if the element
 *      is already in (or partially overlapping) the viewport, set inView=true
 *      synchronously. This avoids a flash of invisibility for above-the-fold
 *      hero content where the IntersectionObserver's first callback can lag
 *      behind the first paint.
 *   2. Otherwise, attach an IntersectionObserver to detect entry.
 *
 * Used by the landing page's <Reveal /> wrapper for fade-up animations.
 */
export function useInView<T extends Element>(
  options: { threshold?: number; rootMargin?: string } = {},
): [React.RefObject<T | null>, boolean] {
  const { threshold = 0.15, rootMargin = '0px 0px -5% 0px' } = options
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current

    // Synchronous check: if the element is already at least partially in
    // the viewport on mount, surface it immediately. The animation still
    // plays via the CSS transition; we just don't gate on IO firing.
    const rect = node.getBoundingClientRect()
    const viewportH = window.innerHeight || document.documentElement.clientHeight
    const alreadyVisible = rect.top < viewportH && rect.bottom > 0
    if (alreadyVisible) {
      setInView(true)
      return
    }

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true)
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold, rootMargin },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [threshold, rootMargin])

  return [ref, inView]
}
