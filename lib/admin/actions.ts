'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import {
  movieAdminSchema,
  settlementSchema,
} from '@/lib/validations'
import {
  recomputeScoreEvents,
  settleMovie,
} from '@/lib/settlement/service'

export interface ActionResult {
  ok: boolean
  error?: string
  message?: string
}

export async function updateMovieAdminAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()

  const movieId = formData.get('movieId')
  if (typeof movieId !== 'string') {
    return { ok: false, error: 'Missing movieId.' }
  }

  const raw: Record<string, unknown> = {}
  const imdbId = formData.get('imdbId')
  const releaseDate = formData.get('releaseDate')
  const predictionLocksAt = formData.get('predictionLocksAt')
  const status = formData.get('status')

  if (typeof imdbId === 'string' && imdbId.trim()) raw.imdbId = imdbId.trim()
  if (typeof releaseDate === 'string' && releaseDate) raw.releaseDate = releaseDate
  if (typeof predictionLocksAt === 'string' && predictionLocksAt) {
    // The client converts the datetime-local wall time to a full ISO instant
    // (new Date(value).toISOString()) before submitting, so no reinterpreting
    // of local time as UTC happens here — z.iso.datetime() validates it.
    raw.predictionLocksAt = predictionLocksAt
  }
  if (typeof status === 'string' && status) raw.status = status

  const parsed = movieAdminSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    }
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.imdbId !== undefined) update.imdb_id = parsed.data.imdbId
  if (parsed.data.releaseDate !== undefined)
    update.release_date = parsed.data.releaseDate
  if (parsed.data.predictionLocksAt !== undefined)
    update.prediction_locks_at = parsed.data.predictionLocksAt
  if (parsed.data.status !== undefined) update.status = parsed.data.status

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('movies')
    .update(update)
    .eq('id', movieId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath('/movies')
  revalidatePath(`/movies/${movieId}`)
  return { ok: true, message: 'Movie updated.' }
}

export async function markMovieCanceledAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()
  const movieId = formData.get('movieId')
  if (typeof movieId !== 'string') return { ok: false, error: 'Missing movieId.' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('movies')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', movieId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath(`/movies/${movieId}`)
  return { ok: true, message: 'Movie marked canceled.' }
}

export async function settleMovieAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()

  const rawVotes = formData.get('officialNumVotes')
  const parsed = settlementSchema.safeParse({
    movieId: formData.get('movieId'),
    officialRating: Number(formData.get('officialRating')),
    // Optional field: an empty input must become undefined, not NaN/0.
    officialNumVotes:
      typeof rawVotes === 'string' && rawVotes.trim() !== ''
        ? Number(rawVotes)
        : undefined,
    settlementSnapshotDate: formData.get('settlementSnapshotDate'),
    releaseDateUsed: formData.get('releaseDateUsed'),
    settlementNotes:
      (formData.get('settlementNotes') as string | null) ?? undefined,
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid settlement input.',
    }
  }

  const result = await settleMovie({
    movieId: parsed.data.movieId,
    officialRating: parsed.data.officialRating,
    officialNumVotes: parsed.data.officialNumVotes,
    settlementSnapshotDate: parsed.data.settlementSnapshotDate,
    releaseDateUsed: parsed.data.releaseDateUsed,
    settlementNotes: parsed.data.settlementNotes,
  })

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin')
  revalidatePath('/leaderboard')
  revalidatePath(`/movies/${parsed.data.movieId}`)
  return {
    ok: true,
    message: result.alreadySettled
      ? 'Movie was already settled.'
      : 'Movie settled and score events written.',
  }
}

export async function recomputeScoreEventsAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()
  const movieId = formData.get('movieId')
  if (typeof movieId !== 'string') return { ok: false, error: 'Missing movieId.' }

  const res = await recomputeScoreEvents(movieId)
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath('/admin')
  revalidatePath('/leaderboard')
  revalidatePath(`/movies/${movieId}`)
  return {
    ok: true,
    message:
      res.inserted === 0
        ? 'Nothing to recompute — all predictions already scored.'
        : `Inserted ${res.inserted} missing score event(s).`,
  }
}
