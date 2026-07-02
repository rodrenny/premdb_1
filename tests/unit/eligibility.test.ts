import { describe, expect, it } from 'vitest'
import {
  checkEligibility,
  daysUntilSettlement,
  SETTLEMENT_WINDOW_DAYS,
} from '@/lib/settlement/eligibility'

function daysFrom(base: Date, days: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

describe('checkEligibility', () => {
  const release = new Date('2025-01-01T00:00:00.000Z')

  it('returns waiting_window before day 28', () => {
    expect(
      checkEligibility({
        releaseDate: release,
        now: daysFrom(release, 0),
      }),
    ).toBe('waiting_window')

    expect(
      checkEligibility({
        releaseDate: release,
        now: daysFrom(release, SETTLEMENT_WINDOW_DAYS - 1),
      }),
    ).toBe('waiting_window')
  })

  it('returns waiting_window when there is no release date', () => {
    expect(
      checkEligibility({
        releaseDate: null,
        now: release,
      }),
    ).toBe('waiting_window')
  })

  it('returns ready_to_settle once day 28 is reached', () => {
    expect(
      checkEligibility({
        releaseDate: release,
        now: daysFrom(release, SETTLEMENT_WINDOW_DAYS),
      }),
    ).toBe('ready_to_settle')
  })

  it('stays ready_to_settle after day 28', () => {
    expect(
      checkEligibility({
        releaseDate: release,
        now: daysFrom(release, SETTLEMENT_WINDOW_DAYS + 15),
      }),
    ).toBe('ready_to_settle')
  })

  it('accepts ISO string release dates', () => {
    expect(
      checkEligibility({
        releaseDate: '2025-01-01',
        now: new Date('2025-01-30T12:00:00.000Z'),
      }),
    ).toBe('ready_to_settle')
  })
})

describe('daysUntilSettlement', () => {
  const release = new Date('2025-01-01T00:00:00.000Z')

  it('counts down toward the day-28 boundary', () => {
    expect(
      daysUntilSettlement({ releaseDate: release, now: daysFrom(release, 0) }),
    ).toBe(SETTLEMENT_WINDOW_DAYS)

    // Day 27 → 1 day to go.
    expect(
      daysUntilSettlement({
        releaseDate: release,
        now: daysFrom(release, SETTLEMENT_WINDOW_DAYS - 1),
      }),
    ).toBe(1)
  })

  it('returns 0 on day 28 (window reached)', () => {
    expect(
      daysUntilSettlement({
        releaseDate: release,
        now: daysFrom(release, SETTLEMENT_WINDOW_DAYS),
      }),
    ).toBe(0)
  })

  it('stays clamped at 0 after day 28', () => {
    expect(
      daysUntilSettlement({
        releaseDate: release,
        now: daysFrom(release, SETTLEMENT_WINDOW_DAYS + 15),
      }),
    ).toBe(0)
  })

  it('returns null without a release date', () => {
    expect(daysUntilSettlement({ releaseDate: null, now: release })).toBeNull()
  })
})
