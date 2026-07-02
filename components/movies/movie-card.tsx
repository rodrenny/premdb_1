import Image from 'next/image'
import Link from 'next/link'
import type { Movie } from '@/types'
import { formatDate } from '@/lib/utils'
import {
  getMovieDisplayState,
  posterUrl,
} from '@/lib/movies/display'
import { MovieStatusBadge } from './movie-status-badge'

export function MovieCard({ movie }: { movie: Movie }) {
  const state = getMovieDisplayState(movie)
  const poster = posterUrl(movie.poster_path)

  return (
    <Link
      href={`/movies/${movie.id}`}
      className="group block overflow-hidden rounded-lg border border-border/60 bg-card transition hover:border-primary/60"
    >
      <div className="relative aspect-[2/3] bg-muted">
        {poster ? (
          <Image
            src={poster}
            alt={movie.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            className="object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No poster
          </div>
        )}
        <div className="absolute left-2 top-2">
          <MovieStatusBadge state={state} />
        </div>
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold">{movie.title}</h3>
        <p className="text-xs text-muted-foreground">
          {formatDate(movie.release_date)}
        </p>
      </div>
    </Link>
  )
}
