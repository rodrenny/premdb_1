'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: number
  decimals?: number
  /** Prefix rendered inside the same numeral treatment, e.g. "+" for points. */
  prefix?: string
  /** Animate a count-up to the value on mount (settlement reveal). */
  countUp?: boolean
  className?: string
}

const COUNT_UP_MS = 900

/**
 * The signature element: a rating/points value in the marquee treatment —
 * mono numerals, amber, subtle glow. With `countUp`, the value counts up
 * on mount; under prefers-reduced-motion it renders instantly.
 */
export function MarqueeNumber({
  value,
  decimals = 1,
  prefix = '',
  countUp = false,
  className,
}: Props) {
  // Server render and reduced-motion both show the final value; the
  // animation only ever runs client-side, inside rAF callbacks.
  const [shown, setShown] = useState(value)

  useEffect(() => {
    if (!countUp) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame: number
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS)
      const eased = 1 - (1 - t) * (1 - t) * (1 - t)
      setShown(value * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [countUp, value])

  return (
    // Glow is not part of the base treatment — callers add .text-glow only
    // on the oversized numerals, so small numbers stay crisp.
    <span className={cn('num font-semibold text-primary', className)}>
      {prefix}
      {(countUp ? shown : value).toFixed(decimals)}
    </span>
  )
}
