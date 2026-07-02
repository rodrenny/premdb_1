import { createServiceClient } from '@/lib/supabase/server'
import type { Movie } from '@/types'
import { SETTLEMENT_WINDOW_DAYS } from './eligibility'

export interface SettleMovieInput {
  movieId: string
  officialRating: number
  officialNumVotes: number
  settlementSnapshotDate: string // ISO date
  releaseDateUsed: string // ISO date
  settlementNotes?: string
  sourceType?: 'manual' | 'dataset' | 'api_import'
  sourceSnapshot?: string | null
}

export interface SettleMovieResult {
  ok: boolean
  settlementId?: string
  alreadySettled?: boolean
  error?: string
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Settle a movie via the Postgres RPC `public.settle_movie`.
 *
 * The RPC handles:
 *  - idempotency (returns existing settlement id if one exists)
 *  - inserting the settlement row
 *  - flipping `movies.status` to 'settled'
 *  - creating one `score_events` row per existing prediction
 *
 * This keeps the whole write path atomic.
 *
 * Uses the service-role client deliberately: this function is only ever
 * invoked from `settleMovieAction` after `requireAdmin()`, which also accepts
 * email-only admins (`ADMIN_EMAILS`) whose `profiles.role` is still 'user'.
 * Those admins would fail the in-function role check added in migration 005
 * if we called the RPC with the user-session client. The in-function check
 * remains the guard against direct PostgREST calls; this app path is guarded
 * by `requireAdmin()` instead.
 */
export async function settleMovie(
  input: SettleMovieInput,
): Promise<SettleMovieResult> {
  const supabase = createServiceClient()

  // Was the movie already settled before this call?
  const { data: priorSettlement } = await supabase
    .from('settlements')
    .select('id')
    .eq('movie_id', input.movieId)
    .maybeSingle()

  const eligibleFromDate = addDaysISO(input.releaseDateUsed, SETTLEMENT_WINDOW_DAYS)

  const { data, error } = await supabase.rpc('settle_movie', {
    p_movie_id: input.movieId,
    p_official_rating: input.officialRating,
    p_official_num_votes: input.officialNumVotes,
    p_settlement_snapshot_date: input.settlementSnapshotDate,
    p_release_date_used: input.releaseDateUsed,
    p_eligible_from_date: eligibleFromDate,
    p_settlement_notes: input.settlementNotes ?? null,
    p_source_type: input.sourceType ?? 'manual',
    p_source_snapshot: input.sourceSnapshot ?? null,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return {
    ok: true,
    settlementId: (data as string) ?? priorSettlement?.id,
    alreadySettled: !!priorSettlement,
  }
}

/**
 * Admin retry path. If a settlement row exists but some predictions didn't
 * get score_events (e.g. mid-flight failure pre-RPC, or predictions created
 * after settlement somehow), recompute missing score_events for an already-
 * settled movie. Safe to call repeatedly.
 */
export async function recomputeScoreEvents(
  movieId: string,
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const svc = createServiceClient()

  const { data: settlement } = await svc
    .from('settlements')
    .select('official_rating, settlement_snapshot_date')
    .eq('movie_id', movieId)
    .maybeSingle()

  if (!settlement) {
    return { ok: false, inserted: 0, error: 'No settlement for this movie.' }
  }

  const { data: movie } = await svc
    .from('movies')
    .select('id, title')
    .eq('id', movieId)
    .maybeSingle<Pick<Movie, 'id' | 'title'>>()

  const { data: predictions } = await svc
    .from('predictions')
    .select('user_id, predicted_value')
    .eq('movie_id', movieId)

  if (!predictions || predictions.length === 0) {
    return { ok: true, inserted: 0 }
  }

  const { data: existing } = await svc
    .from('score_events')
    .select('user_id')
    .eq('movie_id', movieId)

  const existingIds = new Set((existing ?? []).map((e) => e.user_id))
  const missing = predictions.filter((p) => !existingIds.has(p.user_id))
  if (missing.length === 0) return { ok: true, inserted: 0 }

  const actual = Number(settlement.official_rating)
  const rows = missing.map((p) => {
    const predicted = Number(p.predicted_value)
    const base = Math.max(0, Math.round(100 - Math.abs(predicted - actual) * 20))
    const bonus =
      Number(predicted.toFixed(1)) === Number(actual.toFixed(1)) ? 10 : 0
    return {
      user_id: p.user_id,
      movie_id: movieId,
      points: base + bonus,
      prediction_value: predicted,
      official_value: actual,
      movie_title_snapshot: movie?.title ?? null,
      settlement_snapshot_date: settlement.settlement_snapshot_date,
    }
  })

  const { error } = await svc.from('score_events').upsert(rows, {
    onConflict: 'user_id,movie_id',
    ignoreDuplicates: true,
  })

  if (error) return { ok: false, inserted: 0, error: error.message }
  return { ok: true, inserted: rows.length }
}
