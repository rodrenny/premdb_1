import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  backdropUrl,
  getMovieDisplayState,
  parseCast,
  parseGenres,
  posterUrl,
} from '@/lib/movies/display'
import { formatDate, formatDateTime } from '@/lib/utils'
import { MovieStatusBadge } from '@/components/movies/movie-status-badge'
import { PredictionForm } from '@/components/predictions/prediction-form'
import { SettlementRuleBox } from '@/components/movies/settlement-rule'
import { ConsensusPanel } from '@/components/movies/consensus-panel'
import { SettlementCountdown } from '@/components/movies/settlement-countdown'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MovieDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: movie } = await supabase
    .from('movies')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!movie) notFound()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: prediction }, { data: settlement }, { data: scoreEvent }] =
    await Promise.all([
      user
        ? supabase
            .from('predictions')
            .select('predicted_value')
            .eq('movie_id', id)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('settlements')
        .select('*')
        .eq('movie_id', id)
        .maybeSingle(),
      user
        ? supabase
            .from('score_events')
            .select('*')
            .eq('movie_id', id)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const state = getMovieDisplayState(movie)
  const genres = parseGenres(movie.genres)
  const cast = parseCast(movie.cast_preview)
  const backdrop = backdropUrl(movie.backdrop_path)
  const poster = posterUrl(movie.poster_path)

  return (
    <main>
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-border/60">
        {backdrop ? (
          <>
            <Image
              src={backdrop}
              alt=""
              fill
              priority
              sizes="100vw"
              className="-z-10 object-cover opacity-30"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/80 to-background/20" />
          </>
        ) : null}
        <div className="container grid gap-8 py-10 md:grid-cols-[220px_1fr]">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-border/60 bg-muted">
            {poster ? (
              <Image
                src={poster}
                alt={movie.title}
                fill
                sizes="220px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <MovieStatusBadge state={state} />
              {genres.slice(0, 3).map((g) => (
                <span
                  key={g.id}
                  className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {g.name}
                </span>
              ))}
            </div>
            <h1 className="text-4xl font-bold tracking-tight">{movie.title}</h1>
            {movie.original_title && movie.original_title !== movie.title ? (
              <p className="text-sm text-muted-foreground">
                {movie.original_title}
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 pt-2 text-sm md:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Release date</dt>
                <dd>{formatDate(movie.release_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Runtime</dt>
                <dd>{movie.runtime ? `${movie.runtime} min` : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Director</dt>
                <dd>{movie.director_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Predictions lock</dt>
                <dd>{formatDateTime(movie.prediction_locks_at)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="container grid gap-8 py-10 md:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          {movie.overview ? (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Overview</h2>
              <p className="leading-relaxed text-muted-foreground">
                {movie.overview}
              </p>
            </div>
          ) : null}

          {cast.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Cast preview</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {cast.map((c) => (
                  <li key={c.name} className="text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.character ? (
                      <span className="text-muted-foreground"> as {c.character}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {movie.trailer_youtube_key ? (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Trailer</h2>
              <div className="aspect-video overflow-hidden rounded-lg border border-border/60">
                <iframe
                  src={`https://www.youtube.com/embed/${movie.trailer_youtube_key}`}
                  title={`${movie.title} trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <SettlementRuleBox />

          {/* Renders nothing outside released_waiting_window / awaiting_review. */}
          <SettlementCountdown movie={movie} />

          {/* Community consensus is only revealed after predictions lock —
              the SQL functions enforce the gates; this condition just avoids
              a pointless RPC round-trip for open movies. */}
          {state !== 'open' ? (
            <ConsensusPanel
              movieId={movie.id}
              userPrediction={
                prediction ? Number(prediction.predicted_value) : null
              }
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>
                {settlement ? 'Settlement' : 'Your prediction'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!user ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Sign in to submit a prediction.
                  </p>
                  <Button asChild size="sm">
                    <Link href={`/login?next=/movies/${movie.id}`}>Sign in</Link>
                  </Button>
                </div>
              ) : state === 'open' ? (
                <PredictionForm
                  movieId={movie.id}
                  existingValue={prediction?.predicted_value ?? null}
                />
              ) : state === 'locked' ? (
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Predictions closed on {formatDateTime(movie.prediction_locks_at)}.
                  </p>
                  {prediction ? (
                    <p>
                      You predicted{' '}
                      <span className="font-semibold">
                        {prediction.predicted_value.toFixed(1)}
                      </span>
                      .
                    </p>
                  ) : (
                    <p>You did not submit a prediction.</p>
                  )}
                </div>
              ) : settlement ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Official IMDb rating</p>
                    <p className="text-2xl font-bold">
                      {settlement.official_rating.toFixed(1)}
                      {settlement.official_num_votes != null ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({settlement.official_num_votes.toLocaleString()} votes)
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {prediction ? (
                    <div>
                      <p className="text-muted-foreground">Your prediction</p>
                      <p className="text-xl font-semibold">
                        {prediction.predicted_value.toFixed(1)}
                      </p>
                    </div>
                  ) : null}
                  {scoreEvent ? (
                    <div>
                      <p className="text-muted-foreground">Points earned</p>
                      <p className="text-xl font-semibold text-primary">
                        +{scoreEvent.points}
                      </p>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Settled on {formatDate(settlement.settlement_snapshot_date)}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  {prediction ? (
                    <p>
                      You predicted{' '}
                      <span className="font-semibold text-foreground">
                        {prediction.predicted_value.toFixed(1)}
                      </span>
                      . Waiting for settlement.
                    </p>
                  ) : (
                    <p>Predictions are closed and the movie has not settled yet.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  )
}
