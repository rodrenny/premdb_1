import { describe, expect, it } from 'vitest'
import { rangeSince } from '@/lib/leaderboard/aggregate'

describe('rangeSince (B4, UTC-explicit)', () => {
  const now = new Date('2026-07-03T12:00:00.000Z')

  it('returns null for all_time', () => {
    expect(rangeSince('all_time', now)).toBeNull()
  })

  it('computes the weekly cutoff as exactly 7 days earlier in UTC', () => {
    expect(rangeSince('weekly', now)).toBe('2026-06-26T12:00:00.000Z')
  })

  it('computes the monthly cutoff as exactly 30 days earlier in UTC', () => {
    expect(rangeSince('monthly', now)).toBe('2026-06-03T12:00:00.000Z')
  })

  it('is independent of local time-of-day boundaries (fixed instant math)', () => {
    // A late-evening UTC instant still subtracts whole 24h blocks, no DST/local
    // drift.
    const late = new Date('2026-03-08T23:30:00.000Z')
    expect(rangeSince('weekly', late)).toBe('2026-03-01T23:30:00.000Z')
  })
})
