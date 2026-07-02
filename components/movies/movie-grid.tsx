import type { Movie } from '@/types'
import { MovieCard } from './movie-card'

export function MovieGrid({ movies }: { movies: Movie[] }) {
  if (movies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
        No movies yet.
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {movies.map((m) => (
        <MovieCard key={m.id} movie={m} />
      ))}
    </div>
  )
}
