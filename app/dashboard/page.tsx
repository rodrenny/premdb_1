import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/utils'
import { getMovieDisplayState, posterUrl } from '@/lib/movies/display'
import { MovieStatusBadge } from '@/components/movies/movie-status-badge'
import { MarqueeNumber } from '@/components/movies/marquee-number'
import { UsernameForm } from '@/components/dashboard/username-form'
import { EmailPrefsForm } from '@/components/dashboard/email-prefs-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const metadata = { title: 'Dashboard — PreMDB' }

type PredictionRow = {
  movie_id: string
  predicted_value: number
  created_at: string
  movies: {
    id: string
    title: string
    status: string
    prediction_locks_at: string | null
    release_date: string | null
    poster_path: string | null
  } | null
}

type ScoreRow = {
  id: string
  movie_id: string
  points: number
  prediction_value: number
  official_value: number
  movie_title_snapshot: string | null
  settlement_snapshot_date: string | null
  created_at: string
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, email_opt_out')
    .eq('id', user.id)
    .maybeSingle()

  // Active picks: movies with a prediction but no settlement yet.
  const { data: predictions } = (await supabase
    .from('predictions')
    .select(
      'movie_id, predicted_value, created_at, movies(id, title, status, prediction_locks_at, release_date, poster_path)',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })) as unknown as {
    data: PredictionRow[] | null
  }

  const settledMovieIds = new Set<string>()
  const { data: scoreEvents } = (await supabase
    .from('score_events')
    .select(
      'id, movie_id, points, prediction_value, official_value, movie_title_snapshot, settlement_snapshot_date, created_at',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })) as unknown as {
    data: ScoreRow[] | null
  }

  for (const s of scoreEvents ?? []) {
    settledMovieIds.add(s.movie_id)
  }

  const activePicks = (predictions ?? []).filter(
    (p) => p.movies && !settledMovieIds.has(p.movie_id),
  )

  const totalPoints = (scoreEvents ?? []).reduce((sum, s) => sum + s.points, 0)

  return (
    <main className="container space-y-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user.email}
            {profile?.username ? ` · @${profile.username}` : ''}
          </p>
        </div>
        <Card className="min-w-[180px]">
          <CardContent className="flex flex-col items-start gap-1 p-4">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Total points
            </span>
            <MarqueeNumber value={totalPoints} decimals={0} className="text-glow text-3xl" />
          </CardContent>
        </Card>
      </header>

      {!profile?.username ? (
        <Card>
          <CardHeader>
            <CardTitle>Set your username</CardTitle>
            <CardDescription>
              Set your username to appear on the leaderboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <UsernameForm initialUsername={profile?.username ?? null} />
            <EmailPrefsForm initialOptOut={profile?.email_opt_out ?? false} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your display name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <UsernameForm initialUsername={profile.username} />
            <EmailPrefsForm initialOptOut={profile.email_opt_out} />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Active picks ({activePicks.length})
          </TabsTrigger>
          <TabsTrigger value="settled">
            Settled results ({scoreEvents?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-2">
          {activePicks.length === 0 ? (
            <EmptyState
              title="No active picks"
              description="No predictions yet — pick a movie."
              ctaHref="/movies"
              ctaLabel="Browse movies"
            />
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {activePicks.map((p) => {
                const m = p.movies!
                const state = getMovieDisplayState({
                  status: m.status as 'upcoming',
                  prediction_locks_at: m.prediction_locks_at,
                })
                const poster = posterUrl(m.poster_path)
                return (
                  <li key={p.movie_id} className="flex items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-sm border border-border/60 bg-card">
                        {poster ? (
                          <Image
                            src={poster}
                            alt={`${m.title} poster`}
                            fill
                            sizes="44px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/movies/${m.id}`}
                          className="font-medium hover:underline"
                        >
                          {m.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Release {formatDate(m.release_date)} · Locks{' '}
                          {formatDateTime(m.prediction_locks_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="num text-2xl font-semibold text-primary">
                        {Number(p.predicted_value).toFixed(1)}
                      </span>
                      <MovieStatusBadge state={state} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="settled" className="space-y-2">
          {!scoreEvents || scoreEvents.length === 0 ? (
            <EmptyState
              title="No settled results yet"
              description="Your results will show up here once the movies you predicted settle."
            />
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {scoreEvents.map((s) => {
                const delta =
                  Number(s.official_value) - Number(s.prediction_value)
                return (
                  <li key={s.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <Link
                        href={`/movies/${s.movie_id}`}
                        className="font-medium hover:underline"
                      >
                        {s.movie_title_snapshot ?? 'Movie'}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Settled {formatDate(s.settlement_snapshot_date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-5 text-sm">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          You / official
                        </p>
                        <p className="num">
                          {Number(s.prediction_value).toFixed(1)} /{' '}
                          <MarqueeNumber
                            value={Number(s.official_value)}
                            countUp
                            className="text-base"
                          />
                        </p>
                        <p className="num text-xs text-muted-foreground">
                          {delta >= 0 ? '+' : '−'}
                          {Math.abs(delta).toFixed(1)} off
                        </p>
                      </div>
                      <span className="num text-lg font-semibold text-settle">
                        +{s.points}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </main>
  )
}

function EmptyState({
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  title: string
  description: string
  ctaHref?: string
  ctaLabel?: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          {ctaLabel} →
        </Link>
      ) : null}
    </div>
  )
}
