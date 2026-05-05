import { useEffect, useState } from 'react'

import { useInView } from '../../hooks/useInView'

interface Props {
  /** Final value to count up to. Pass as number; formatting handled by `format`. */
  value: number
  /** Optional formatter, e.g. `(n) => n.toFixed(2)` or `(n) => '$' + n.toLocaleString()`. */
  format?: (n: number) => string
  /** Duration in ms. Default 1.6s. */
  duration?: number
  /** Optional prefix/suffix that the formatter doesn't handle. */
  prefix?: string
  suffix?: string
  className?: string
}

/**
 * Counts from 0 → value when it enters the viewport. ease-out so the
 * last few digits don't tick rapidly. Used on the stats strip.
 */
export default function AnimatedNumber({
  value,
  format = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 }),
  duration = 1600,
  prefix = '',
  suffix = '',
  className = '',
}: Props) {
  const [ref, inView] = useInView<HTMLSpanElement>()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(eased * value)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, value, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(display)}
      {suffix}
    </span>
  )
}
