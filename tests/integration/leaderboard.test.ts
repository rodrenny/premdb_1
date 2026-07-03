import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchLeaderboard } from '@/lib/leaderboard/aggregate'
import {
  createTestUser,
  deleteTestUser,
  hasAnonEnv,
  insertTestMovie,
  makeAnonClient,
  makeServiceClient,
} from './_helpers'

const run = hasAnonEnv ? describe : describe.skip

run('leaderboard visibility (live DB)', () => {
  const svc = hasAnonEnv ? makeServiceClient() : null!

  const userIds: string[] = []
  const movieIds: string[] = []

  beforeAll(async () => {
    const a = await createTestUser(svc, 'premdb-lb-a')
    const b = await createTestUser(svc, 'premdb-lb-b')
    const c = await createTestUser(svc, 'premdb-lb-c')
    userIds.push(a.id, b.id, c.id)

    const movie = await insertTestMovie(svc, { status: 'settled' })
    movieIds.push(movie.id)

    // A and B tie at 110, C trails at 70 → dense ranks 1, 1, 2.
    const { error } = await svc.from('score_events').insert([
      {
        user_id: a.id,
        movie_id: movie.id,
        points: 110,
        prediction_value: 7.5,
        official_value: 7.5,
      },
      {
        user_id: b.id,
        movie_id: movie.id,
        points: 110,
        prediction_value: 7.5,
        official_value: 7.5,
      },
      {
        user_id: c.id,
        movie_id: movie.id,
        points: 70,
        prediction_value: 6.0,
        official_value: 7.5,
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

  it('anon (no session) client can read score_events of all users (A2)', async () => {
    const anon = makeAnonClient()
    const { data, error } = await anon
      .from('score_events')
      .select('user_id, points')
      .eq('movie_id', movieIds[0])

    expect(error).toBeNull()
    const seenUsers = new Set((data ?? []).map((e) => e.user_id))
    expect(seenUsers.has(userIds[0])).toBe(true)
    expect(seenUsers.has(userIds[1])).toBe(true)
    expect(seenUsers.has(userIds[2])).toBe(true)
  })

  it('all-time leaderboard contains every scored user, dense-ranked (A2)', async () => {
    // Same aggregation getLeaderboard() runs — with an anon client instead of
    // the request-scoped one, so RLS is exercised as an anonymous visitor.
    const result = await fetchLeaderboard(makeAnonClient(), 'all_time', 1000)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const entries = result.entries

    const ours = entries.filter((e) => userIds.includes(e.user_id))
    expect(ours).toHaveLength(3)

    const byId = new Map(ours.map((e) => [e.user_id, e]))
    expect(byId.get(userIds[0])?.total_points).toBe(110)
    expect(byId.get(userIds[1])?.total_points).toBe(110)
    expect(byId.get(userIds[2])?.total_points).toBe(70)

    // Dense ranking: the two 110s share a rank; 70 ranks exactly one lower.
    const rank110a = byId.get(userIds[0])!.rank
    const rank110b = byId.get(userIds[1])!.rank
    const rank70 = byId.get(userIds[2])!.rank
    expect(rank110a).toBe(rank110b)
    expect(rank70).toBeGreaterThan(rank110a)
  })
})
