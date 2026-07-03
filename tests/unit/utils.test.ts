// Fix the process time zone BEFORE any Date work happens so the round-trip
// assertions are deterministic. Etc/GMT+5 is a constant UTC-5 offset (no DST),
// which keeps the test stable year-round.
process.env.TZ = 'Etc/GMT+5'

import { describe, expect, it } from 'vitest'
import { toLocalDatetimeInputValue } from '@/lib/utils'

describe('toLocalDatetimeInputValue (fixed UTC-5 zone)', () => {
  it('renders the ISO instant as local wall time', () => {
    // 18:30Z == 13:30 at UTC-5
    expect(toLocalDatetimeInputValue('2026-03-01T18:30:00.000Z')).toBe(
      '2026-03-01T13:30',
    )
  })

  it('crosses the date boundary correctly', () => {
    // 02:00Z == 21:00 the previous day at UTC-5
    expect(toLocalDatetimeInputValue('2026-03-02T02:00:00.000Z')).toBe(
      '2026-03-01T21:00',
    )
  })

  it('round-trips ISO → input value → ISO as identity', () => {
    // The admin form submits new Date(inputValue).toISOString(); the browser
    // (here: Node) parses the offset-less value in the local zone.
    const isoInputs = [
      '2026-03-01T18:30:00.000Z',
      '2025-12-31T23:59:00.000Z',
      '2026-07-15T04:00:00.000Z',
    ]
    for (const iso of isoInputs) {
      const inputValue = toLocalDatetimeInputValue(iso)
      expect(new Date(inputValue).toISOString()).toBe(iso)
    }
  })

  it('returns empty string for null/undefined/invalid input', () => {
    expect(toLocalDatetimeInputValue(null)).toBe('')
    expect(toLocalDatetimeInputValue(undefined)).toBe('')
    expect(toLocalDatetimeInputValue('not-a-date')).toBe('')
  })
})
