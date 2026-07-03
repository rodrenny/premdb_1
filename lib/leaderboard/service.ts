import { createClient } from '@/lib/supabase/server'
import type { LeaderboardEntry, LeaderboardRange } from '@/types'
import { fetchLeaderboard } from './aggregate'

/** Request-scoped wrapper used by the leaderboard page. */
export async function getLeaderboard(
  range: LeaderboardRange,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  return fetchLeaderboard(await createClient(), range, limit)
}
