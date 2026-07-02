import { describe, expect, it } from 'vitest'
import { calcPoints, calcPointsWithBonus } from '@/lib/scoring'

describe('calcPoints', () => {
  it('returns 100 for an exact match', () => {
    expect(calcPoints(7.5, 7.5)).toBe(100)
  })

  it('returns 90 for being off by 0.5', () => {
    expect(calcPoints(7.0, 7.5)).toBe(90)
    expect(calcPoints(8.0, 7.5)).toBe(90)
  })

  it('returns 80 for being off by 1.0', () => {
    expect(calcPoints(6.5, 7.5)).toBe(80)
  })

  it('returns 60 for being off by 2.0', () => {
    expect(calcPoints(5.5, 7.5)).toBe(60)
  })

  it('returns 0 for being off by 5.0', () => {
    expect(calcPoints(2.5, 7.5)).toBe(0)
  })

  it('never returns negative', () => {
    expect(calcPoints(1, 10)).toBe(0)
    expect(calcPoints(10, 1)).toBe(0)
  })

  it('rounds half-point differences to the nearest whole point', () => {
    // off by 0.25 → 100 - 5 = 95
    expect(calcPoints(7.25, 7.0)).toBe(95)
    // off by 0.75 → 100 - 15 = 85
    expect(calcPoints(7.75, 7.0)).toBe(85)
  })

  it('is symmetric', () => {
    expect(calcPoints(5.0, 7.0)).toBe(calcPoints(9.0, 7.0))
  })
})

describe('calcPointsWithBonus', () => {
  it('adds +10 when the prediction rounds to the actual value at one decimal', () => {
    expect(calcPointsWithBonus(7.5, 7.5)).toBe(110)
  })

  it('does not add the bonus when off even slightly', () => {
    expect(calcPointsWithBonus(7.4, 7.5)).toBe(98)
    expect(calcPointsWithBonus(7.6, 7.5)).toBe(98)
  })

  it('applies the bonus when both predicted and actual agree at one decimal', () => {
    // Both round to 7.5 at one decimal place.
    expect(calcPointsWithBonus(7.49999, 7.5)).toBeGreaterThan(
      calcPoints(7.49999, 7.5),
    )
  })

  it('leaves a zero-base score at its floor (bonus still applies only on exact match)', () => {
    expect(calcPointsWithBonus(2.5, 7.5)).toBe(0)
  })
})
