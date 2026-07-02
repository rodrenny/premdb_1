import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  runAutoSettlePhase,
  runSnapshotPhase,
} from '@/lib/settlement/auto'
import {
  createTestUser,
  deleteTestUser,
  hasSupabaseEnv,
  insertTestMovie,
  makeServiceClient,
} from './_helpers'

const run = hasSupabaseEnv ? describe : describe.skip

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

run('rating snapshots + auto-settlement (live DB, C3)', () => {
  const svc = hasSupabaseEnv ? makeServiceClient() : null!

  const userIds: string[] = []
  const movieIds: string[] = []

  let eligibleMovieId: string // day-27 and day-29 snapshots
  let ineligibleMovieId: string // only a day-20 snapshot
  let eligibleReleaseDate: string

  beforeAll(async () => {
    const user = await createTestUser(svc, 'premdb-snap')
    userIds.push(user.id)

    // Released 30 days ago → eligible_from = 2 days ago.
    eligibleReleaseDate = isoDaysAgo(30)
    const eligible = await insertTestMovie(svc, {
      release_date: eligibleReleaseDate,
      prediction_locks_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      status: 'awaiting_review',
    })
    eligibleMovieId = eligible.id

    const ineligible = await insertTestMovie(svc, {
      release_date: eligibleReleaseDate,
      prediction_locks_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      status: 'awaiting_review',
    })
    ineligibleMovieId = ineligible.id
    movieIds.push(eligibleMovieId, ineligibleMovieId)

    await svc.from('predictions').insert([
      { user_id: user.id, movie_id: eligibleMovieId, predicted_value: 7.1 },
    ])

    const { error } = await svc.from('rating_snapshots').insert([
      // Day 27 (pre-eligibility) and day 29 (first eligible) snapshots.
      {
        movie_id: eligibleMovieId,
        rating: 6.5,
        num_votes: 900,
        snapshot_date: isoDaysAgo(3), // release + 27
      },
      {
        movie_id: eligibleMovieId,
        rating: 7.1,
        num_votes: 1_200,
        snapshot_date: isoDaysAgo(1), // release + 29
      },
      // Only a day-20 snapshot — must not settle.
      {
        movie_id: ineligibleMovieId,
        rating: 8.0,
        num_votes: 5_000,
        snapshot_date: isoDaysAgo(10), // release + 20
      },
    ])
    if (error) throw new Error(error.message)
  })

  afterAll(async () => {
    if (movieIds.length > 0) {
      await svc.from('movies').delete().in('id', movieIds)
    }
    for (const id of userIds) await deleteTestUser(svc, id)
  })

  it('auto-settles from the earliest snapshot on/after day 28 and skips ineligible movies', async () => {
    const result = await runAutoSettlePhase(svc)
    expect(result.errors).toEqual([])
    // Other test data may add to the counters; assert on our movies directly.

    const { data: settlement } = await svc
      .from('settlements')
      .select(
        'official_rating, official_num_votes, settlement_snapshot_date, source_type, source_snapshot, eligible_from_date',
      )
      .eq('movie_id', eligibleMovieId)
      .maybeSingle()

    // The day-29 snapshot (7.1) wins — not the pre-eligibility day-27 one.
    expect(settlement).not.toBeNull()
    expect(Number(settlement!.official_rating)).toBe(7.1)
    expect(settlement!.official_num_votes).toBe(1_200)
    expect(settlement!.settlement_snapshot_date).toBe(isoDaysAgo(1))
    expect(settlement!.source_type).toBe('api_import')
    expect(settlement!.source_snapshot).toBe(`tmdb:${isoDaysAgo(1)}`)

    const { data: movie } = await svc
      .from('movies')
      .select('status')
      .eq('id', eligibleMovieId)
      .single()
    expect(movie?.status).toBe('settled')

    // Score event written from the snapshot rating (7.1 vs 7.1 → 110).
    const { data: events } = await svc
      .from('score_events')
      .select('points')
      .eq('movie_id', eligibleMovieId)
    expect(events).toHaveLength(1)
    expect(events?.[0].points).toBe(110)

    // The day-20-only movie stays awaiting_review, unsettled.
    const { data: other } = await svc
      .from('movies')
      .select('status')
      .eq('id', ineligibleMovieId)
      .single()
    expect(other?.status).toBe('awaiting_review')

    const { count } = await svc
      .from('settlements')
      .select('id', { count: 'exact', head: true })
      .eq('movie_id', ineligibleMovieId)
    expect(count).toBe(0)
  })

  it('is idempotent — a second run makes zero new writes', async () => {
    const before = await svc
      .from('settlements')
      .select('id')
      .eq('movie_id', eligibleMovieId)
      .single()

    const result = await runAutoSettlePhase(svc)
    expect(result.errors).toEqual([])

    const after = await svc
      .from('settlements')
      .select('id')
      .eq('movie_id', eligibleMovieId)
      .single()
    expect(after.data?.id).toBe(before.data?.id)

    const { count } = await svc
      .from('score_events')
      .select('id', { count: 'exact', head: true })
      .eq('movie_id', eligibleMovieId)
    expect(count).toBe(1)
  })

  it('snapshot phase inserts once per day, skips low-quality data (fake fetcher)', async () => {
    // Two fresh movies in the snapshot window.
    const good = await insertTestMovie(svc, {
      release_date: isoDaysAgo(5),
      status: 'released_waiting_window',
    })
    const lowVotes = await insertTestMovie(svc, {
      release_date: isoDaysAgo(5),
      status: 'released_waiting_window',
    })
    movieIds.push(good.id, lowVotes.id)

    const ratings = new Map<number, { rating: number; numVotes: number }>([
      [good.tmdb_id, { rating: 7.3, numVotes: 512 }],
      [lowVotes.tmdb_id, { rating: 7.3, numVotes: 12 }], // < 50 votes → skip
    ])
    const fakeFetcher = async (tmdbId: number) =>
      ratings.get(tmdbId) ?? { rating: 0, numVotes: 0 }

    const first = await runSnapshotPhase(svc, fakeFetcher)
    expect(first.errors).toEqual([])

    const today = new Date().toISOString().slice(0, 10)
    const { data: goodSnap } = await svc
      .from('rating_snapshots')
      .select('rating, num_votes, snapshot_date, source')
      .eq('movie_id', good.id)
      .maybeSingle()
    expect(goodSnap).not.toBeNull()
    expect(Number(goodSnap!.rating)).toBe(7.3)
    expect(goodSnap!.snapshot_date).toBe(today)
    expect(goodSnap!.source).toBe('tmdb')

    const { count: lowCount } = await svc
      .from('rating_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('movie_id', lowVotes.id)
    expect(lowCount).toBe(0)

    // Second run: on-conflict-do-nothing keeps it at one row per day.
    const second = await runSnapshotPhase(svc, fakeFetcher)
    expect(second.errors).toEqual([])
    const { count: goodCount } = await svc
      .from('rating_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('movie_id', good.id)
    expect(goodCount).toBe(1)
  })
})
