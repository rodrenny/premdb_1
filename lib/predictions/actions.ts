'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { predictionSchema } from '@/lib/validations'
import { isPredictionOpen } from '@/lib/movies/display'
import { deletePredictionForUser } from './service'

export interface PredictionActionResult {
  ok: boolean
  error?: string
}

export async function submitPredictionAction(
  formData: FormData,
): Promise<PredictionActionResult> {
  const raw = {
    movieId: formData.get('movieId'),
    value: Number(formData.get('value')),
  }

  const parsed = predictionSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid prediction.',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must sign in to predict.' }

  // Re-check lock state server-side — clients can lie.
  const { data: movie, error: movieErr } = await supabase
    .from('movies')
    .select('id, status, prediction_locks_at')
    .eq('id', parsed.data.movieId)
    .maybeSingle()

  if (movieErr || !movie) {
    return { ok: false, error: 'Movie not found.' }
  }

  if (!isPredictionOpen(movie)) {
    return { ok: false, error: 'Predictions are closed for this movie.' }
  }

  const { error } = await supabase.from('predictions').upsert(
    {
      user_id: user.id,
      movie_id: parsed.data.movieId,
      predicted_value: parsed.data.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,movie_id' },
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath(`/movies/${parsed.data.movieId}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deletePredictionAction(
  formData: FormData,
): Promise<PredictionActionResult> {
  const movieId = formData.get('movieId')
  if (typeof movieId !== 'string') {
    return { ok: false, error: 'Missing movieId.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const result = await deletePredictionForUser(supabase, user.id, movieId)
  if (!result.ok) return result

  revalidatePath(`/movies/${movieId}`)
  revalidatePath('/dashboard')
  return { ok: true }
}
