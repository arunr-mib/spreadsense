import { useEffect, useRef, useState } from 'react'

/**
 * Returns a ref to attach to an element + a boolean that flips to true when
 * the element enters the viewport (and stays true thereafter).
 *
 * Used by the landing page's <Reveal /> wrapper to trigger fade-up
 * animations on scroll without pulling in framer-motion.
 *
 * threshold: how much of the element must be visible (0..1) before flipping.
 * rootMargin: shrink/grow the trigger box (e.g. '-80px 0px' triggers when
 *   the element is 80px above the bottom of the viewport).
 */
export function useInView<T extends Element>(
  options: { threshold?: number; rootMargin?: string } = {},
): [React.RefObject<T | null>, boolean] {
  const { threshold = 0.15, rootMargin = '0px 0px -10% 0px' } = options
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    // Skip on no-IO environments (very old browsers, SSR) — just show.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const node = ref.current
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
