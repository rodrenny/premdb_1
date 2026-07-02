import { describe, expect, it } from 'vitest'
import {
  MIN_CONSENSUS_PREDICTIONS,
  bucketFor,
  bucketize,
  comparisonText,
  median,
} from '@/lib/predictions/consensus'

describe('bucketFor', () => {
  it('maps values to the lower bound of their 0.5 bucket', () => {
    expect(bucketFor(1.0)).toBe(1.0)
    expect(bucketFor(7.0)).toBe(7.0)
    expect(bucketFor(7.4)).toBe(7.0)
    expect(bucketFor(7.5)).toBe(7.5)
    expect(bucketFor(7.9)).toBe(7.5)
    expect(bucketFor(10.0)).toBe(10.0)
  })
})

describe('bucketize', () => {
  it('counts per bucket, ascending', () => {
    expect(bucketize([7.0, 7.4, 9.0, 7.5])).toEqual([
      { bucket: 7.0, count: 2 },
      { bucket: 7.5, count: 1 },
      { bucket: 9.0, count: 1 },
    ])
  })

  it('returns empty for no values', () => {
    expect(bucketize([])).toEqual([])
  })
})

describe('median', () => {
  it('returns the middle value for odd sample sizes', () => {
    expect(median([7.0, 7.4, 9.0])).toBe(7.4)
  })

  it('interpolates for even sample sizes (matches percentile_cont)', () => {
    expect(median([7.0, 8.0])).toBe(7.5)
    expect(median([1.0, 2.0, 3.0, 10.0])).toBe(2.5)
  })

  it('returns null for an empty sample', () => {
    expect(median([])).toBeNull()
  })
})

describe('comparisonText', () => {
  it('says above / below / matching', () => {
    expect(comparisonText(7.9, 7.4)).toBe(
      'You predicted 7.9 — above the community median of 7.4.',
    )
    expect(comparisonText(6.1, 7.4)).toBe(
      'You predicted 6.1 — below the community median of 7.4.',
    )
    expect(comparisonText(7.4, 7.42)).toBe(
      'You predicted 7.4 — matching the community median of 7.4.',
    )
  })
})

describe('MIN_CONSENSUS_PREDICTIONS', () => {
  it('mirrors the SQL threshold in migration 009', () => {
    expect(MIN_CONSENSUS_PREDICTIONS).toBe(3)
  })
})
