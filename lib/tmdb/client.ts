const BASE_URL = 'https://api.themoviedb.org/3'

function getToken(): string {
  const token = process.env.TMDB_READ_ACCESS_TOKEN
  if (!token) {
    throw new Error('TMDB_READ_ACCESS_TOKEN is not set.')
  }
  return token
}

export async function tmdbFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${getToken()}`,
      ...(init?.headers ?? {}),
    },
    // Let the caller opt in to caching; sync runs are "fresh fetch" semantics.
    cache: init?.cache ?? 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `TMDb ${path} failed: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`,
    )
  }

  return (await res.json()) as T
}

// ---- Shapes we actually care about -------------------------------------

export interface TMDbUpcomingResponse {
  page: number
  results: { id: number }[]
  total_pages: number
}

export interface TMDbMovie {
  id: number
  imdb_id?: string | null
  title: string
  original_title?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  runtime?: number | null
  genres?: { id: number; name: string }[]
  vote_average?: number
  vote_count?: number
}

export interface TMDbCreditsPerson {
  name: string
  character?: string
  job?: string
  department?: string
  profile_path?: string | null
}

export interface TMDbCreditsResponse {
  cast: TMDbCreditsPerson[]
  crew: TMDbCreditsPerson[]
}

export interface TMDbVideosResponse {
  results: {
    key: string
    site: string
    type: string
    official?: boolean
  }[]
}
