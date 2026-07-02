import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { LeaderboardEntry, LeaderboardRange } from '@/types'

/** PostgREST caps a single response at 1000 rows — page in that size. */
export const LEADERBOARD_PAGE_SIZE = 1000

/**
 * Hard safety cap: 20 pages (20k score events). Beyond that the in-memory
 * aggregation approach should be replaced by a DB view anyway (explicitly
 * out of scope for v1), so stop rather than loop unbounded.
 */
export const LEADERBOARD_MAX_PAGES = 20

function rangeSince(range: LeaderboardRange): string | null {
  if (range === 'all_time') return null
  const now = new Date()
  if (range === 'weekly') {
    now.setDate(now.getDate() - 7)
  } else {
    now.setDate(now.getDate() - 30)
  }
  return now.toISOString()
}

/**
 * Fetch pages via `fetchPage(offset, limit)` and merge them until a short
 * page signals the end, or the page cap is hit. Pure page-merge logic —
 * unit-tested with a fake fetcher.
 */
export async function collectPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = LEADERBOARD_PAGE_SIZE,
  maxPages = LEADERBOARD_MAX_PAGES,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; page < maxPages; page += 1) {
    const rows = await fetchPage(page * pageSize, pageSize)
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}

interface ScoreEventSlice {
  user_id: string
  points: number
}

/**
 * Pure aggregation: totals per user, sorted, dense-ranked. Extracted so the
 * math is unit-testable without a DB.
 */
export function aggregateLeaderboard(
  events: ScoreEventSlice[],
  usernameById: Map<string, string | null>,
  limit: number,
): LeaderboardEntry[] {
  const totals = new Map<string, { total: number; count: number }>()
  for (const e of events) {
    const prev = totals.get(e.user_id) ?? { total: 0, count: 0 }
    totals.set(e.user_id, {
      total: prev.total + e.points,
      count: prev.count + 1,
    })
  }

  if (totals.size === 0) return []

  const entries: LeaderboardEntry[] = [...totals.entries()].map(
    ([uid, t]) => ({
      user_id: uid,
      username: usernameById.get(uid) ?? null,
      total_points: t.total,
      settled_count: t.count,
      rank: 0, // filled below
    }),
  )

  entries.sort((a, b) => {
    if (b.total_points !== a.total_points) {
      return b.total_points - a.total_points
    }
    return b.settled_count - a.settled_count
  })

  // Dense ranking: same score → same rank
  let lastPoints = Number.NaN
  let lastRank = 0
  entries.forEach((e, idx) => {
    if (e.total_points !== lastPoints) {
      lastRank = idx + 1
      lastPoints = e.total_points
    }
    e.rank = lastRank
  })

  return entries.slice(0, limit)
}

/**
 * Aggregates the leaderboard from `score_events` joined against `profiles`,
 * using whatever client is passed in (page reads keep respecting RLS —
 * score_events is public-read per migration 006). v1 intentionally does this
 * in code (no DB view), since it keeps the schema simpler and leaderboard
 * traffic is low.
 */
export async function fetchLeaderboard(
  supabase: SupabaseClient<Database>,
  range: LeaderboardRange,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const since = rangeSince(range)

  const events = await collectPages<ScoreEventSlice>(
    async (offset, pageSize) => {
      let query = supabase
        .from('score_events')
        .select('user_id, points, created_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (since) {
        query = query.gte('created_at', since)
      }
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data ?? []
    },
  ).catch(() => null)

  if (!events || events.length === 0) return []

  const userIds = [...new Set(events.map((e) => e.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  const usernameById = new Map<string, string | null>()
  for (const p of profiles ?? []) {
    usernameById.set(p.id, p.username)
  }

  return aggregateLeaderboard(events, usernameById, limit)
}
