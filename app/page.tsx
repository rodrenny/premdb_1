import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getLeaderboard } from '@/lib/leaderboard/service'
import { MovieCard } from '@/components/movies/movie-card'
import { SettlementRuleBox } from '@/components/movies/settlement-rule'
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'
import { Button } from '@/components/ui/button'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: featured }, leaderboard] = await Promise.all([
    supabase
      .from('movies')
      .select('*')
      .in('status', ['upcoming', 'released_waiting_window'])
      .order('release_date', { ascending: true, nullsFirst: false })
      .limit(5),
    getLeaderboard('all_time', 5),
  ])
  // Landing preview degrades to empty on failure; the dedicated /leaderboard
  // page renders the distinct error state.
  const leaderboardEntries = leaderboard.ok ? leaderboard.entries : []

  return (
    <main>
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(47_96%_53%/0.12),transparent_60%)]" />
        <div className="container flex flex-col items-start gap-6 py-20 md:py-28">
          <span className="rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">
            Predict before release
          </span>
          <h1 className="max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
            Call the IMDb rating before the critics do.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Pick an unreleased movie, predict its future IMDb rating to one
            decimal, and earn points when it settles. The closer you are, the
            higher you climb.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={user ? '/movies' : '/login'}>
                {user ? 'Browse movies' : 'Sign in to play'}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/leaderboard">See leaderboard</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container grid gap-8 py-16 md:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="mr-2 font-semibold text-foreground">1.</span>
              Pick an upcoming movie from the grid.
            </li>
            <li>
              <span className="mr-2 font-semibold text-foreground">2.</span>
              Submit a prediction between 1.0 and 10.0 before the prediction lock
              time.
            </li>
            <li>
              <span className="mr-2 font-semibold text-foreground">3.</span>
              Once the movie settles, you earn points based on how close you were:
              100 minus 20 per point of error, with a +10 bonus for an exact match.
            </li>
          </ol>
        </div>
        <SettlementRuleBox />
      </section>

      {/* Featured movies */}
      <section className="container space-y-4 py-8">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Upcoming</h2>
          <Link
            href="/movies"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        </div>
        {featured && featured.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {featured.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No upcoming movies yet.</p>
        )}
      </section>

      {/* Leaderboard preview */}
      <section className="container space-y-4 py-16">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Top players</h2>
          <Link
            href="/leaderboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Full leaderboard →
          </Link>
        </div>
        <LeaderboardTable entries={leaderboardEntries} />
      </section>
    </main>
  )
}
