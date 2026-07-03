import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { isPredictionOpen } from '@/lib/movies/display'

export interface PredictionServiceResult {
  ok: boolean
  error?: string
}

/**
 * Delete a user's prediction for a movie, enforcing the lock rule.
 *
 * Fails closed: if the movie cannot be loaded (missing id, query error), the
 * delete is refused — otherwise a bad movie id would bypass the lock check
 * entirely (B3).
 */
export async function deletePredictionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  movieId: string,
): Promise<PredictionServiceResult> {
  const { data: movie, error: movieErr } = await supabase
    .from('movies')
    .select('id, status, prediction_locks_at')
    .eq('id', movieId)
    .maybeSingle()

  if (movieErr || !movie) {
    return { ok: false, error: 'Movie not found.' }
  }

  if (!isPredictionOpen(movie)) {
    return { ok: false, error: 'Predictions are closed for this movie.' }
  }

  const { error } = await supabase
    .from('predictions')
    .delete()
    .eq('user_id', userId)
    .eq('movie_id', movieId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
