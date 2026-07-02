import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { SETTLEMENT_WINDOW_DAYS } from '@/lib/settlement/eligibility'

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
 * Lifecycle cron. Date-driven status transitions only:
 *
 *   upcoming                → released_waiting_window   (release_date <= today)
 *   released_waiting_window → awaiting_review           (release_date <= today - 28)
 *
 * Auto-settlement from the movies.tmdb_*_snapshot columns was removed: those
 * columns are written during TMDb sync of *upcoming* movies, i.e. usually
 * pre-release with vote_average = 0, so settling from them violated the
 * settlement contract ("first daily snapshot on or after day 28").
 * Auto-settlement returns on top of real daily `rating_snapshots` (Part C3).
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
