import { createClient } from '@/lib/supabase/server'
import { bucketFor, comparisonText } from '@/lib/predictions/consensus'
import { MarqueeNumber } from '@/components/movies/marquee-number'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface Props {
  movieId: string
  /** The viewer's own prediction, if any — powers the comparison line. */
  userPrediction: number | null
}

/**
 * Post-lock community consensus (C1). Server component; the privacy gates
 * (lock gate, minimum-sample gate) live inside the SQL functions, so this
 * component just renders whatever the RPCs are willing to reveal:
 *  - RPC error (movie still open → this component shouldn't be mounted) or
 *    empty result (fewer than MIN_CONSENSUS_PREDICTIONS) → render nothing.
 */
export async function ConsensusPanel({ movieId, userPrediction }: Props) {
  const supabase = await createClient()

  const [statsRes, bucketsRes] = await Promise.all([
    supabase.rpc('get_prediction_stats', { p_movie_id: movieId }),
    supabase.rpc('get_prediction_consensus', { p_movie_id: movieId }),
  ])

  const stats = statsRes.data?.[0]
  const buckets = bucketsRes.data ?? []
  if (statsRes.error || bucketsRes.error || !stats || buckets.length === 0) {
    return null
  }

  const maxCount = Math.max(...buckets.map((b) => b.count))
  const medianValue = Number(stats.median)
  const userBucket = userPrediction != null ? bucketFor(userPrediction) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Community consensus</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <MarqueeNumber value={medianValue} className="text-glow text-3xl" />
          <p className="text-xs text-muted-foreground">
            median of {stats.prediction_count} prediction
            {stats.prediction_count === 1 ? '' : 's'}
          </p>
        </div>

        <ul className="space-y-1">
          {buckets.map((b) => {
            const mine = userBucket != null && Number(b.bucket) === userBucket
            return (
              <li key={b.bucket} className="flex items-center gap-2 text-xs">
                <span className="num w-8 shrink-0 text-right text-muted-foreground">
                  {Number(b.bucket).toFixed(1)}
                </span>
                <span
                  className={`h-3 rounded-sm ${
                    mine ? 'bg-primary' : 'bg-muted-foreground/40'
                  }`}
                  style={{ width: `${(b.count / maxCount) * 100}%` }}
                />
                <span className="num text-muted-foreground">{b.count}</span>
              </li>
            )
          })}
        </ul>

        {userPrediction != null ? (
          <p className="border-t border-border/60 pt-3 text-sm">
            {comparisonText(userPrediction, medianValue)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
