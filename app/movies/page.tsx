import { createClient } from '@/lib/supabase/server'
import { MovieGrid } from '@/components/movies/movie-grid'

export const metadata = { title: 'Movies — PreMDB' }

export default async function MoviesIndexPage() {
  const supabase = await createClient()
  const { data: movies } = await supabase
    .from('movies')
    .select('*')
    .order('release_date', { ascending: true, nullsFirst: false })
    .limit(60)

  return (
    <main className="container py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight">
            Movies
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Predict a rating before release. Points awarded when the movie settles.
          </p>
        </div>
      </div>
      <MovieGrid movies={movies ?? []} />
    </main>
  )
}
