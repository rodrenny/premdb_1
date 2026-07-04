import { createClient } from '@/lib/supabase/server'
import { daysUntilSettlement } from '@/lib/settlement/eligibility'
import type { Movie } from '@/types'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface Props {
  movie: Pick<Movie, 'id' | 'status' | 'release_date'>
}

/**
 * Pre-settlement countdown (C4). Pure display for movies in the settlement
 * window: the latest daily rating snapshot (if any) and either
 * "Settles in N days" or "Awaiting first eligible snapshot" derived from
 * release_date + SETTLEMENT_WINDOW_DAYS. Renders nothing for movies outside
 * released_waiting_window / awaiting_review.
 */
export async function SettlementCountdown({ movie }: Props) {
  if (
    movie.status !== 'released_waiting_window' &&
    movie.status !== 'awaiting_review'
  ) {
    return null
  }

  const days = daysUntilSettlement({ releaseDate: movie.release_date })

  const supabase = await createClient()
  const { data: snapshot } = await supabase
    .from('rating_snapshots')
    .select('rating, num_votes, snapshot_date')
    .eq('movie_id', movie.id)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settlement countdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {snapshot ? (
          <div>
            <p className="text-muted-foreground">
              Latest rating snapshot ({snapshot.snapshot_date})
            </p>
            <p className="num text-2xl font-semibold">
              {Number(snapshot.rating).toFixed(1)}
              {snapshot.num_votes != null ? (
                <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                  ({snapshot.num_votes.toLocaleString()} votes)
                </span>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">No rating snapshot yet.</p>
        )}
        <p>
          {days == null
            ? 'Settlement date unknown — no release date.'
            : days > 0
              ? `Settles in ${days} day${days === 1 ? '' : 's'}.`
              : 'Awaiting first eligible snapshot.'}
        </p>
      </CardContent>
    </Card>
  )
}
