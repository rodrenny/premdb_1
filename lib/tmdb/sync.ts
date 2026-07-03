import { createServiceClient } from '@/lib/supabase/server'
import {
  tmdbFetch,
  type TMDbCreditsResponse,
  type TMDbMovie,
  type TMDbUpcomingResponse,
  type TMDbVideosResponse,
} from './client'
import type { CastMember, MovieInsert } from '@/types'

export interface SyncResult {
  pagesFetched: number
  candidates: number
  upserted: number
  skipped: number
  errors: { tmdbId: number; message: string }[]
}

const PAGES_TO_FETCH = 3

async function fetchMovieBundle(tmdbId: number): Promise<MovieInsert | null> {
  const [movie, credits, videos] = await Promise.all([
    tmdbFetch<TMDbMovie>(`/movie/${tmdbId}`),
    tmdbFetch<TMDbCreditsResponse>(`/movie/${tmdbId}/credits`),
    tmdbFetch<TMDbVideosResponse>(`/movie/${tmdbId}/videos`),
  ])

  if (!movie.title) return null

  const director = credits.crew.find((p) => p.job === 'Director')?.name ?? null
  const cast_preview: CastMember[] = credits.cast.slice(0, 5).map((c) => ({
    name: c.name,
    character: c.character ?? '',
    profile_path: c.profile_path ?? null,
  }))

  const trailer =
    videos.results.find(
      (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official,
    ) ?? videos.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer')

  // Default prediction lock = release date at 00:00 UTC when not already set.
  const prediction_locks_at = movie.release_date
    ? new Date(`${movie.release_date}T00:00:00Z`).toISOString()
    : null

  return {
    tmdb_id: movie.id,
    imdb_id: movie.imdb_id ?? null,
    title: movie.title,
    original_title: movie.original_title ?? null,
    overview: movie.overview ?? null,
    poster_path: movie.poster_path ?? null,
    backdrop_path: movie.backdrop_path ?? null,
    release_date: movie.release_date || null,
    release_date_source: 'tmdb',
    prediction_locks_at,
    runtime: movie.runtime ?? null,
    // The movies.tmdb_*_snapshot columns are deprecated (superseded by the
    // rating_snapshots table, migration 010) and are no longer written.
    genres: (movie.genres ?? []) as unknown as MovieInsert['genres'],
    director_name: director,
    cast_preview: cast_preview as unknown as MovieInsert['cast_preview'],
    trailer_youtube_key: trailer?.key ?? null,
    status: 'upcoming',
  }
}

/**
 * Fetch up to `PAGES_TO_FETCH` pages of /movie/upcoming and upsert each
 * movie (detail + credits + videos) into the `movies` table, keyed by
 * `tmdb_id`. Uses the service-role client — only callable from trusted
 * server paths (admin route handler).
 */
export async function syncUpcomingMovies(): Promise<SyncResult> {
  const supabase = createServiceClient()
  const result: SyncResult = {
    pagesFetched: 0,
    candidates: 0,
    upserted: 0,
    skipped: 0,
    errors: [],
  }

  const ids = new Set<number>()

  for (let page = 1; page <= PAGES_TO_FETCH; page += 1) {
    const data = await tmdbFetch<TMDbUpcomingResponse>(
      `/movie/upcoming?page=${page}`,
    )
    result.pagesFetched += 1
    for (const r of data.results) ids.add(r.id)
    if (page >= (data.total_pages ?? 1)) break
  }

  result.candidates = ids.size

  // Preserve manual overrides: don't clobber a movie whose status has already
  // been advanced past `upcoming`, or whose prediction_locks_at has been
  // manually adjusted.
  const { data: existingRows } = await supabase
    .from('movies')
    .select('tmdb_id, status, prediction_locks_at')
    .in('tmdb_id', [...ids])

  const existing = new Map(
    (existingRows ?? []).map((r) => [
      r.tmdb_id,
      { status: r.status, prediction_locks_at: r.prediction_locks_at },
    ]),
  )

  for (const tmdbId of ids) {
    try {
      const row = await fetchMovieBundle(tmdbId)
      if (!row) {
        result.skipped += 1
        continue
      }

      const prior = existing.get(tmdbId)
      if (prior?.status && prior.status !== 'upcoming') {
        // Don't drag a movie back into 'upcoming' once it's past that.
        delete (row as Partial<MovieInsert>).status
      }
      if (prior?.prediction_locks_at) {
        // Preserve admin-overridden lock times.
        row.prediction_locks_at = prior.prediction_locks_at
      }

      const { error } = await supabase
        .from('movies')
        .upsert(row, { onConflict: 'tmdb_id' })
      if (error) {
        result.errors.push({ tmdbId, message: error.message })
      } else {
        result.upserted += 1
      }
    } catch (e) {
      result.errors.push({
        tmdbId,
        message: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }

  return result
}
