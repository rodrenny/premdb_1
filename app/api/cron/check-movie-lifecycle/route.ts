import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { SETTLEMENT_WINDOW_DAYS } from '@/lib/settlement/eligibility'

export const dynamic = 'force-dynamic'

interface TransitionResult {
  upcomingToWaiting: number
  waitingToAwaiting: number
  autoSettled: number
  autoSkipped: number
  errors: string[]
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Lifecycle cron. Date-driven transitions + optional auto-settle when a
 * trusted rating snapshot is already present.
 *
 *   upcoming                → released_waiting_window   (release_date <= today)
 *   released_waiting_window → awaiting_review           (release_date <= today - 28)
 *
 * Idempotent: re-running produces no new side effects once a movie is in its
 * correct state.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`.
 */
async function runTransitions(): Promise<TransitionResult> {
  const supabase = createServiceClient()
  const result: TransitionResult = {
    upcomingToWaiting: 0,
    waitingToAwaiting: 0,
    autoSettled: 0,
    autoSkipped: 0,
    errors: [],
  }

  const today = new Date().toISOString().slice(0, 10)
  const settlementWindowDaysAgo = isoDaysAgo(SETTLEMENT_WINDOW_DAYS)

  // upcoming → released_waiting_window
  {
    const { data, error } = await supabase
      .from('movies')
      .update({ status: 'released_waiting_window', updated_at: new Date().toISOString() })
      .eq('status', 'upcoming')
      .not('release_date', 'is', null)
      .lte('release_date', today)
      .select('id')
    if (error) result.errors.push(`upcoming→waiting: ${error.message}`)
    else result.upcomingToWaiting = data?.length ?? 0
  }

  // released_waiting_window → awaiting_review
  {
    const { data, error } = await supabase
      .from('movies')
      .update({ status: 'awaiting_review', updated_at: new Date().toISOString() })
      .eq('status', 'released_waiting_window')
      .not('release_date', 'is', null)
      .lte('release_date', settlementWindowDaysAgo)
      .select('id')
    if (error) result.errors.push(`waiting→awaiting_review: ${error.message}`)
    else result.waitingToAwaiting = data?.length ?? 0
  }

  // Auto-settle day-28+ movies when snapshot data is available.
  {
    const { data: candidates, error } = await supabase
      .from('movies')
      .select(
        'id, release_date, tmdb_rating_snapshot, tmdb_num_votes_snapshot, tmdb_snapshot_date',
      )
      .eq('status', 'awaiting_review')
      .not('release_date', 'is', null)
      .lte('release_date', settlementWindowDaysAgo)

    if (error) {
      result.errors.push(`auto-settle (query): ${error.message}`)
    } else {
      for (const movie of candidates ?? []) {
        const releaseDate = movie.release_date
        const rating = movie.tmdb_rating_snapshot
        const votes = movie.tmdb_num_votes_snapshot
        const snapshotDate = movie.tmdb_snapshot_date

        if (
          !releaseDate ||
          typeof rating !== 'number' ||
          typeof votes !== 'number' ||
          !snapshotDate
        ) {
          result.autoSkipped += 1
          continue
        }

        const eligibleFromDate = addDaysISO(releaseDate, SETTLEMENT_WINDOW_DAYS)
        const { error: settleErr } = await supabase.rpc('settle_movie', {
          p_movie_id: movie.id,
          p_official_rating: rating,
          p_official_num_votes: votes,
          p_settlement_snapshot_date: snapshotDate,
          p_release_date_used: releaseDate,
          p_eligible_from_date: eligibleFromDate,
          p_settlement_notes: 'Auto-settled by cron from TMDb snapshot.',
          p_source_type: 'api_import',
          p_source_snapshot: `tmdb:${snapshotDate}`,
        })

        if (settleErr) {
          result.errors.push(`auto-settle (${movie.id}): ${settleErr.message}`)
        } else {
          result.autoSettled += 1
        }
      }
    }
  }

  return result
}

function authorize(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = request.headers.get('authorization')
  return header === `Bearer ${expected}`
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runTransitions()
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
