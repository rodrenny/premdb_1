/**
 * Pure consensus math for the post-lock community reveal (C1).
 *
 * The authoritative aggregates come from the SQL functions
 * `get_prediction_consensus` / `get_prediction_stats` (migration 009), whose
 * privacy gates live in the database. These helpers mirror the math for unit
 * tests and power the "your position vs. the community" comparison text.
 */

/**
 * Minimum sample size before any aggregate is revealed. Mirrors
 * `min_predictions` in supabase/migrations/009_consensus_read.sql — keep in
 * sync.
 */
export const MIN_CONSENSUS_PREDICTIONS = 3

/** Histogram bucket width used by get_prediction_consensus. */
export const CONSENSUS_BUCKET_SIZE = 0.5

export interface ConsensusBucket {
  bucket: number
  count: number
}

export interface ConsensusStats {
  prediction_count: number
  median: number
  mean: number
}

/** Lower bound of the 0.5-wide bucket a prediction falls into. */
export function bucketFor(value: number): number {
  return Math.floor(value * 2) / 2
}

/** Bucket counts for a set of predictions, ascending by bucket. */
export function bucketize(values: number[]): ConsensusBucket[] {
  const counts = new Map<number, number>()
  for (const v of values) {
    const b = bucketFor(v)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({ bucket, count }))
}

/**
 * Median with linear interpolation between the two middle values for even
 * sample sizes — matches SQL's percentile_cont(0.5).
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * "You predicted 7.9 — above the community median of 7.4."
 * A prediction counts as matching when it rounds to the same one-decimal
 * value as the median (the same tolerance the scoring bonus uses).
 */
export function comparisonText(
  prediction: number,
  communityMedian: number,
): string {
  const p = prediction.toFixed(1)
  const m = communityMedian.toFixed(1)
  const relation =
    p === m ? 'matching' : prediction > communityMedian ? 'above' : 'below'
  return `You predicted ${p} — ${relation} the community median of ${m}.`
}
