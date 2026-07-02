import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  deleteTestUser,
  hasSupabaseEnv,
  insertTestMovie,
  makeServiceClient,
} from './_helpers'

const run = hasSupabaseEnv ? describe : describe.skip

run('settlement RPC (live DB)', () => {
  const svc = hasSupabaseEnv ? makeServiceClient() : null!

  const userIds: string[] = []
  const movieIds: string[] = []

  beforeAll(async () => {
    // Two users, two movies — one we'll settle, one we'll leave alone.
    const u1 = await createTestUser(svc, 'premdb-settle-a')
    const u2 = await createTestUser(svc, 'premdb-settle-b')
    userIds.push(u1.id, u2.id)

    const releasedAt = new Date(Date.now() - 30 * 86_400_000) // 30 days ago
    const m1 = await insertTestMovie(svc, {
      release_date: releasedAt.toISOString().slice(0, 10),
      prediction_locks_at: new Date(releasedAt.getTime() - 86_400_000).toISOString(),
      status: 'awaiting_review',
    })
    movieIds.push(m1.id)

    // Both users predict on m1.
    await svc.from('predictions').insert([
      { user_id: u1.id, movie_id: m1.id, predicted_value: 7.5 },
      { user_id: u2.id, movie_id: m1.id, predicted_value: 6.0 },
    ])
  })

  afterAll(async () => {
    if (movieIds.length > 0) {
      await svc.from('movies').delete().in('id', movieIds)
    }
    for (const id of userIds) await deleteTestUser(svc, id)
  })

  it('settles a movie and writes one score_event per prediction', async () => {
    const movieId = movieIds[0]
    const releaseDate = (
      await svc.from('movies').select('release_date').eq('id', movieId).single()
    ).data!.release_date!

    const { data: settlementId, error } = await svc.rpc('settle_movie', {
      p_movie_id: movieId,
      p_official_rating: 7.5,
      p_official_num_votes: 8_000,
      p_settlement_snapshot_date: new Date().toISOString().slice(0, 10),
      p_release_date_used: releaseDate,
      p_eligible_from_date: new Date().toISOString().slice(0, 10),
      p_settlement_notes: 'integration test',
    })

    expect(error).toBeNull()
    expect(typeof settlementId).toBe('string')

    const { data: movie } = await svc
      .from('movies')
      .select('status')
      .eq('id', movieId)
      .single()
    expect(movie?.status).toBe('settled')

    const { data: events } = await svc
      .from('score_events')
      .select('user_id, points, prediction_value, official_value')
      .eq('movie_id', movieId)
      .order('prediction_value', { ascending: false })

    expect(events).toHaveLength(2)
    // user A predicted 7.5, actual 7.5 → 100 base + 10 bonus = 110
    expect(events?.[0].points).toBe(110)
    // user B predicted 6.0, actual 7.5 → off 1.5 → 100 - 30 = 70, no bonus
    expect(events?.[1].points).toBe(70)
  })

  it('is idempotent — a repeat call does not duplicate rows', async () => {
    const movieId = movieIds[0]
    const releaseDate = (
      await svc.from('movies').select('release_date').eq('id', movieId).single()
    ).data!.release_date!

    const before = await svc
      .from('score_events')
      .select('id', { count: 'exact', head: true })
      .eq('movie_id', movieId)
    const beforeCount = before.count ?? 0

    const { data: returnedId, error } = await svc.rpc('settle_movie', {
      p_movie_id: movieId,
      p_official_rating: 9.9, // different input — should be ignored
      p_official_num_votes: 99_999,
      p_settlement_snapshot_date: '2099-01-01',
      p_release_date_used: releaseDate,
      p_eligible_from_date: '2099-01-15',
      p_settlement_notes: 'should be ignored',
    })

    expect(error).toBeNull()
    expect(typeof returnedId).toBe('string')

    const after = await svc
      .from('score_events')
      .select('id', { count: 'exact', head: true })
      .eq('movie_id', movieId)
    expect(after.count).toBe(beforeCount)

    // Settlement row must also not have been updated with the new bogus values.
    const { data: settlement } = await svc
      .from('settlements')
      .select('official_rating')
      .eq('movie_id', movieId)
      .single()
    expect(Number(settlement?.official_rating)).toBe(7.5)
  })

  it('score_events aggregate into leaderboard points', async () => {
    const movieId = movieIds[0]
    const { data: events } = await svc
      .from('score_events')
      .select('user_id, points')
      .eq('movie_id', movieId)

    const totals = new Map<string, number>()
    for (const e of events ?? []) {
      totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + e.points)
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
    expect(sorted[0]?.[1]).toBe(110)
    expect(sorted[1]?.[1]).toBe(70)
  })
})
