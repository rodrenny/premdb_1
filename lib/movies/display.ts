import type { CastMember, Genre, Movie, MovieDisplayState } from '@/types'

/**
 * Derives the user-facing display state from a movie's persisted status
 * and `prediction_locks_at`. "Locked" is never a persisted status — it
 * means `status === 'upcoming'` but the lock time has already passed.
 */
export function getMovieDisplayState(
  movie: Pick<Movie, 'status' | 'prediction_locks_at'>,
  now: Date = new Date(),
): MovieDisplayState {
  if (movie.status !== 'upcoming') return movie.status

  if (
    movie.prediction_locks_at &&
    new Date(movie.prediction_locks_at).getTime() <= now.getTime()
  ) {
    return 'locked'
  }

  return 'open'
}

export function isPredictionOpen(
  movie: Pick<Movie, 'status' | 'prediction_locks_at'>,
  now: Date = new Date(),
): boolean {
  return getMovieDisplayState(movie, now) === 'open'
}

export function parseGenres(raw: Movie['genres']): Genre[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (g): g is Genre =>
      !!g && typeof g === 'object' && 'id' in g && 'name' in g,
  )
}

export function parseCast(raw: Movie['cast_preview']): CastMember[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (c): c is CastMember =>
      !!c && typeof c === 'object' && 'name' in c && 'character' in c,
  )
}

export const posterUrl = (path: string | null | undefined) =>
  path ? `https://image.tmdb.org/t/p/w500${path}` : null

export const backdropUrl = (path: string | null | undefined) =>
  path ? `https://image.tmdb.org/t/p/w1280${path}` : null
