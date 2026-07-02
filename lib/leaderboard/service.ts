import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'
import type { LeaderboardEntry, LeaderboardRange } from '@/types'

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

  let query = supabase
    .from('score_events')
    .select('user_id, points, created_at')

  if (since) {
    query = query.gte('created_at', since)
  }

  const { data: events, error } = await query
  if (error || !events) return []

  if (events.length === 0) return []

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

/** Request-scoped wrapper used by the leaderboard page. */
export async function getLeaderboard(
  range: LeaderboardRange,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  return fetchLeaderboard(await createClient(), range, limit)
}
