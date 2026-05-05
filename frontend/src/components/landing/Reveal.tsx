import { useInView } from '../../hooks/useInView'

interface Props {
  children: React.ReactNode
  delay?: number // ms — staggers within a sibling group
  className?: string
  as?: 'div' | 'section' | 'article' | 'span'
}

/**
 * Fade-up wrapper. Children start translated 16px down + fully transparent;
 * once the element enters the viewport the transform + opacity transition
 * to their natural state. Pure CSS — no framer-motion.
 */
export default function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: Props) {
  const [ref, inView] = useInView<HTMLDivElement>()

  const style: React.CSSProperties = {
    transitionDelay: `${delay}ms`,
    transitionProperty: 'opacity, transform',
    transitionDuration: '700ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    opacity: inView ? 1 : 0,
    transform: inView ? 'translateY(0)' : 'translateY(16px)',
    willChange: 'opacity, transform',
  }

  // Map the as prop to the right JSX element
  const Component = Tag as 'div'
  return (
    <Component
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      style={style}
    >
      {children}
    </Component>
  )
}
