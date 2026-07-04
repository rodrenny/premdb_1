import Image from 'next/image'
import Link from 'next/link'
import type { Movie } from '@/types'
import { formatDate } from '@/lib/utils'
import { getMovieDisplayState, posterUrl } from '@/lib/movies/display'
import { MovieStatusBadge } from './movie-status-badge'

export function MovieCard({ movie }: { movie: Movie }) {
  const state = getMovieDisplayState(movie)
  const poster = posterUrl(movie.poster_path)
  // Past-lock movies step out of the light; open ones hold it.
  const dimmed = state !== 'open'

  return (
    <Link
      href={`/movies/${movie.id}`}
      className="group relative block overflow-hidden rounded-lg border border-border/60 bg-card transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[2/3]">
        {poster ? (
          <>
            <Image
              src={poster}
              alt={`${movie.title} poster`}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
              className={`object-cover transition duration-300 group-hover:scale-[1.02] ${
                dimmed ? 'opacity-50 saturate-50' : ''
              }`}
            />
            {/* Bottom scrim carries the title and release line. */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-12">
              <h3 className="line-clamp-2 font-display text-base uppercase leading-tight tracking-wide text-foreground">
                {movie.title}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(movie.release_date)}
              </p>
            </div>
          </>
        ) : (
          /* Letterboxed placeholder: title on a dark frame, never a broken image. */
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 border-y-8 border-background bg-card px-3 text-center">
            <span className="line-clamp-4 font-display text-lg uppercase leading-tight text-muted-foreground">
              {movie.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(movie.release_date)}
            </span>
          </div>
        )}
        <div className="absolute left-2 top-2">
          <MovieStatusBadge state={state} />
        </div>
      </div>
    </Link>
  )
}
