import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { SETTLEMENT_WINDOW_DAYS } from '@/lib/settlement/eligibility'
import {
  runAutoSettlePhase,
  runSnapshotPhase,
} from '@/lib/settlement/auto'

export const dynamic = 'force-dynamic'

interface TransitionResult {
  upcomingToWaiting: number
  waitingToAwaiting: number
  errors: string[]
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * Lifecycle cron, in three phases:
 *
 * 1. Date-driven status transitions:
 *      upcoming                → released_waiting_window (release_date <= today)
 *      released_waiting_window → awaiting_review         (release_date <= today - 28)
 * 2. Snapshot phase: record today's TMDb rating for every movie in
 *    released_waiting_window / awaiting_review (skipping low-quality data,
 *    capped at 100 TMDb calls per run).
 * 3. Auto-settle phase: settle each awaiting_review movie from the earliest
 *    rating snapshot taken on or after release + 28 — the settlement
 *    contract, literally.
 *
 * The old auto-settle from movies.tmdb_*_snapshot columns was removed: those
 * columns were written during TMDb sync of *upcoming* movies, i.e. usually
 * pre-release with vote_average = 0, so settling from them violated the
 * contract.
 *
 * Idempotent: re-running produces no new side effects once a movie is in its
 * correct state (snapshots conflict on (movie_id, source, snapshot_date);
 * settle_movie returns the existing settlement id).
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`.
 */
async function runTransitions(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<TransitionResult> {
  const result: TransitionResult = {
    upcomingToWaiting: 0,
    waitingToAwaiting: 0,
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
    const supabase = createServiceClient()
    const transitions = await runTransitions(supabase)
    const snapshots = await runSnapshotPhase(supabase)
    const autoSettle = await runAutoSettlePhase(supabase)

    return NextResponse.json({
      ok: true,
      result: {
        upcomingToWaiting: transitions.upcomingToWaiting,
        waitingToAwaiting: transitions.waitingToAwaiting,
        snapshotsInserted: snapshots.snapshotsInserted,
        snapshotSkipped: snapshots.snapshotSkipped,
        tmdbCalls: snapshots.tmdbCalls,
        settledFromSnapshot: autoSettle.settledFromSnapshot,
        awaitingSnapshot: autoSettle.awaitingSnapshot,
        emailsSent: autoSettle.emailsSent,
        emailsFailed: autoSettle.emailsFailed,
        errors: [
          ...transitions.errors,
          ...snapshots.errors,
          ...autoSettle.errors,
        ],
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
