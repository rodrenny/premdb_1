import { createClient } from '@/lib/supabase/server'
import type { LeaderboardRange } from '@/types'
import { fetchLeaderboard, type LeaderboardResult } from './aggregate'

/** Request-scoped wrapper used by the leaderboard page and landing preview. */
export async function getLeaderboard(
  range: LeaderboardRange,
  limit = 50,
): Promise<LeaderboardResult> {
  return fetchLeaderboard(await createClient(), range, limit)
}
