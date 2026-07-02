import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { tmdbFetch, type TMDbMovie } from '@/lib/tmdb/client'
import { SETTLEMENT_WINDOW_DAYS } from './eligibility'

/**
 * Cron phases for C3: daily rating snapshots + auto-settlement from real
 * snapshots. Both run with the service-role client from the cron route
 * (after the CRON_SECRET check). Extracted here so the auto-settle logic is
 * integration-testable without HTTP or TMDb.
 */

/** Snapshots with fewer votes than this are too noisy to record. */
export const SNAPSHOT_MIN_VOTES = 50

/** Hard cap on TMDb API calls per cron run. */
export const SNAPSHOT_MAX_TMDB_CALLS = 100

export interface SnapshotPhaseResult {
  snapshotsInserted: number
  snapshotSkipped: number
  tmdbCalls: number
  errors: string[]
}

export interface AutoSettlePhaseResult {
  settledFromSnapshot: number
  awaitingSnapshot: number
  errors: string[]
}

export type RatingFetcher = (
  tmdbId: number,
) => Promise<{ rating: number; numVotes: number }>

async function fetchTmdbRating(
  tmdbId: number,
): Promise<{ rating: number; numVotes: number }> {
  const movie = await tmdbFetch<TMDbMovie>(`/movie/${tmdbId}`)
  return {
    rating: Number((movie.vote_average ?? 0).toFixed(1)),
    numVotes: movie.vote_count ?? 0,
  }
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Snapshot phase: for every movie in released_waiting_window or
 * awaiting_review, fetch the current TMDb rating and insert today's snapshot
 * (`on conflict do nothing` via ignoreDuplicates, so re-runs are no-ops).
 * Low-quality data (rating 0 or vote count < SNAPSHOT_MIN_VOTES) is skipped
 * and counted instead of recorded.
 */
export async function runSnapshotPhase(
  supabase: SupabaseClient<Database>,
  fetchRating: RatingFetcher = fetchTmdbRating,
): Promise<SnapshotPhaseResult> {
  const result: SnapshotPhaseResult = {
    snapshotsInserted: 0,
    snapshotSkipped: 0,
    tmdbCalls: 0,
    errors: [],
  }

  const today = new Date().toISOString().slice(0, 10)

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, tmdb_id, release_date')
    .in('status', ['released_waiting_window', 'awaiting_review'])
    .order('release_date', { ascending: true })

  if (error) {
    result.errors.push(`snapshot (query): ${error.message}`)
    return result
  }

  for (const movie of movies ?? []) {
    if (result.tmdbCalls >= SNAPSHOT_MAX_TMDB_CALLS) break

    try {
      result.tmdbCalls += 1
      const { rating, numVotes } = await fetchRating(movie.tmdb_id)

      if (rating <= 0 || numVotes < SNAPSHOT_MIN_VOTES) {
        result.snapshotSkipped += 1
        continue
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('rating_snapshots')
        .upsert(
          {
            movie_id: movie.id,
            source: 'tmdb',
            rating,
            num_votes: numVotes,
            snapshot_date: today,
          },
          {
            onConflict: 'movie_id,source,snapshot_date',
            ignoreDuplicates: true, // on conflict do nothing
          },
        )
        .select('id')

      if (insertErr) {
        result.errors.push(`snapshot (${movie.id}): ${insertErr.message}`)
      } else {
        result.snapshotsInserted += inserted?.length ?? 0
      }
    } catch (e) {
      result.errors.push(
        `snapshot (${movie.id}): ${e instanceof Error ? e.message : 'Unknown error'}`,
      )
    }
  }

  return result
}

/**
 * Auto-settle phase: for every awaiting_review movie, look up the earliest
 * rating snapshot with snapshot_date >= release_date + 28 and settle from it.
 * This query is the primary guard that the settlement honors the contract;
 * the DB constraints from migration 007 are the backstop.
 */
export async function runAutoSettlePhase(
  supabase: SupabaseClient<Database>,
): Promise<AutoSettlePhaseResult> {
  const result: AutoSettlePhaseResult = {
    settledFromSnapshot: 0,
    awaitingSnapshot: 0,
    errors: [],
  }

  const { data: candidates, error } = await supabase
    .from('movies')
    .select('id, release_date')
    .eq('status', 'awaiting_review')
    .not('release_date', 'is', null)

  if (error) {
    result.errors.push(`auto-settle (query): ${error.message}`)
    return result
  }

  for (const movie of candidates ?? []) {
    const eligibleFrom = addDaysISO(movie.release_date!, SETTLEMENT_WINDOW_DAYS)

    const { data: snapshot, error: snapErr } = await supabase
      .from('rating_snapshots')
      .select('rating, num_votes, snapshot_date')
      .eq('movie_id', movie.id)
      .gte('snapshot_date', eligibleFrom)
      .order('snapshot_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (snapErr) {
      result.errors.push(`auto-settle (${movie.id}): ${snapErr.message}`)
      continue
    }
    if (!snapshot) {
      result.awaitingSnapshot += 1
      continue
    }

    const { error: settleErr } = await supabase.rpc('settle_movie', {
      p_movie_id: movie.id,
      p_official_rating: Number(snapshot.rating),
      p_official_num_votes: snapshot.num_votes,
      p_settlement_snapshot_date: snapshot.snapshot_date,
      p_release_date_used: movie.release_date!,
      p_settlement_notes: 'Auto-settled by cron from daily rating snapshot.',
      p_source_type: 'api_import',
      p_source_snapshot: `tmdb:${snapshot.snapshot_date}`,
    })

    if (settleErr) {
      result.errors.push(`auto-settle (${movie.id}): ${settleErr.message}`)
    } else {
      result.settledFromSnapshot += 1
    }
  }

  return result
}
