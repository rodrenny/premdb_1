import { describe, expect, it } from 'vitest'
import {
  aggregateLeaderboard,
  collectPages,
} from '@/lib/leaderboard/aggregate'

describe('collectPages', () => {
  function fakeFetcher(rows: number[]) {
    const calls: Array<{ offset: number; limit: number }> = []
    const fetchPage = async (offset: number, limit: number) => {
      calls.push({ offset, limit })
      return rows.slice(offset, offset + limit)
    }
    return { calls, fetchPage }
  }

  it('returns a single short page as-is', async () => {
    const { calls, fetchPage } = fakeFetcher([1, 2, 3])
    const merged = await collectPages(fetchPage, 10, 20)
    expect(merged).toEqual([1, 2, 3])
    expect(calls).toHaveLength(1)
  })

  it('merges pages until a short page is returned', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => i)
    const { calls, fetchPage } = fakeFetcher(rows)
    const merged = await collectPages(fetchPage, 10, 20)
    expect(merged).toEqual(rows)
    // 10 + 10 + 5 → three calls, offsets 0/10/20
    expect(calls.map((c) => c.offset)).toEqual([0, 10, 20])
  })

  it('stops fetching after an exact-multiple final page', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => i)
    const { calls, fetchPage } = fakeFetcher(rows)
    const merged = await collectPages(fetchPage, 10, 20)
    expect(merged).toEqual(rows)
    // Third call returns 0 rows (short page) and terminates the loop.
    expect(calls).toHaveLength(3)
  })

  it('enforces the hard page cap', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => i)
    const { calls, fetchPage } = fakeFetcher(rows)
    const merged = await collectPages(fetchPage, 10, 3)
    expect(merged).toEqual(rows.slice(0, 30))
    expect(calls).toHaveLength(3)
  })
})

describe('aggregateLeaderboard', () => {
  const names = new Map<string, string | null>([
    ['a', 'alice'],
    ['b', 'bob'],
    ['c', null],
  ])

  it('totals per user and dense-ranks ties', () => {
    const entries = aggregateLeaderboard(
      [
        { user_id: 'a', points: 60 },
        { user_id: 'a', points: 50 },
        { user_id: 'b', points: 110 },
        { user_id: 'c', points: 70 },
      ],
      names,
      50,
    )
    expect(entries.map((e) => [e.user_id, e.total_points, e.rank])).toEqual([
      // a and b tie at 110; a has 2 settled movies and sorts first, but both
      // share rank 1. The next distinct score takes its positional rank
      // (1, 1, 3) — the same behavior the leaderboard has always shipped.
      ['a', 110, 1],
      ['b', 110, 1],
      ['c', 70, 3],
    ])
    expect(entries[0].settled_count).toBe(2)
    expect(entries[2].username).toBeNull()
  })

  it('applies the limit after ranking', () => {
    const entries = aggregateLeaderboard(
      [
        { user_id: 'a', points: 100 },
        { user_id: 'b', points: 90 },
        { user_id: 'c', points: 80 },
      ],
      names,
      2,
    )
    expect(entries).toHaveLength(2)
    expect(entries[1].user_id).toBe('b')
  })

  it('returns empty for no events', () => {
    expect(aggregateLeaderboard([], names, 10)).toEqual([])
  })
})
