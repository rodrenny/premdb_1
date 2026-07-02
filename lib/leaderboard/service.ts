import { createClient } from '@/lib/supabase/server'
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

/**
 * Aggregates leaderboard server-side from `score_events` joined against
 * `profiles`. v1 intentionally does this in code (no DB view), since it keeps
 * the schema simpler and leaderboard traffic is low.
 */
export async function getLeaderboard(
  range: LeaderboardRange,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const supabase = await createClient()
  const since = rangeSince(range)

  let query = supabase
    .from('score_events')
    .select('user_id, points, created_at')

  if (since) {
    query = query.gte('created_at', since)
  }

  const { data: events, error } = await query
  if (error || !events) return []

  // Aggregate in memory — score_events row counts are bounded by
  // settled_movies * users_who_predicted and will stay small for v1.
  const totals = new Map<string, { total: number; count: number }>()
  for (const e of events) {
    const prev = totals.get(e.user_id) ?? { total: 0, count: 0 }
    totals.set(e.user_id, {
      total: prev.total + e.points,
      count: prev.count + 1,
    })
  }

  if (totals.size === 0) return []

  const userIds = [...totals.keys()]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  const usernameById = new Map<string, string | null>()
  for (const p of profiles ?? []) {
    usernameById.set(p.id, p.username)
  }

  const entries: LeaderboardEntry[] = userIds.map((uid) => {
    const t = totals.get(uid)!
    return {
      user_id: uid,
      username: usernameById.get(uid) ?? null,
      total_points: t.total,
      settled_count: t.count,
      rank: 0, // filled below
    }
  })

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
