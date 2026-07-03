import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  deleteTestUser,
  hasAnonEnv,
  insertTestMovie,
  makeAnonClient,
  makeServiceClient,
} from './_helpers'

const run = hasAnonEnv ? describe : describe.skip

// These deliberately hit the RPCs with an anon client — NOT the UI path —
// because the privacy gates live inside the SQL functions and must hold for
// direct /rest/v1/rpc/... callers.
run('prediction consensus RPCs (live DB, C1)', () => {
  const svc = hasAnonEnv ? makeServiceClient() : null!
  const anon = hasAnonEnv ? makeAnonClient() : null!

  const userIds: string[] = []
  const movieIds: string[] = []

  let openMovieId: string
  let lockedTwoId: string
  let lockedThreeId: string

  beforeAll(async () => {
    const users = await Promise.all([
      createTestUser(svc, 'premdb-consensus-a'),
      createTestUser(svc, 'premdb-consensus-b'),
      createTestUser(svc, 'premdb-consensus-c'),
    ])
    userIds.push(...users.map((u) => u.id))

    const open = await insertTestMovie(svc, {
      prediction_locks_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'upcoming',
    })
    openMovieId = open.id

    const lockedTwo = await insertTestMovie(svc, {
      prediction_locks_at: new Date(Date.now() - 86_400_000).toISOString(),
      status: 'upcoming',
    })
    lockedTwoId = lockedTwo.id

    const lockedThree = await insertTestMovie(svc, {
      prediction_locks_at: new Date(Date.now() - 86_400_000).toISOString(),
      status: 'upcoming',
    })
    lockedThreeId = lockedThree.id

    movieIds.push(openMovieId, lockedTwoId, lockedThreeId)

    const { error } = await svc.from('predictions').insert([
      // 3 predictions on the open movie — lock gate must still refuse.
      { user_id: userIds[0], movie_id: openMovieId, predicted_value: 5.0 },
      { user_id: userIds[1], movie_id: openMovieId, predicted_value: 6.0 },
      { user_id: userIds[2], movie_id: openMovieId, predicted_value: 7.0 },
      // 2 predictions — below the minimum sample.
      { user_id: userIds[0], movie_id: lockedTwoId, predicted_value: 7.0 },
      { user_id: userIds[1], movie_id: lockedTwoId, predicted_value: 8.0 },
      // 3 predictions — full reveal.
      { user_id: userIds[0], movie_id: lockedThreeId, predicted_value: 7.0 },
      { user_id: userIds[1], movie_id: lockedThreeId, predicted_value: 7.4 },
      { user_id: userIds[2], movie_id: lockedThreeId, predicted_value: 9.0 },
    ])
    if (error) throw new Error(error.message)
  })

  afterAll(async () => {
    if (movieIds.length > 0) {
      await svc.from('movies').delete().in('id', movieIds)
    }
    for (const id of userIds) await deleteTestUser(svc, id)
  })

  it('(a) raises on a movie still open for predictions', async () => {
    const consensus = await anon.rpc('get_prediction_consensus', {
      p_movie_id: openMovieId,
    })
    expect(consensus.error).not.toBeNull()
    expect(
      `${consensus.error?.code} ${consensus.error?.message}`,
    ).toMatch(/42501|before predictions lock/)

    const stats = await anon.rpc('get_prediction_stats', {
      p_movie_id: openMovieId,
    })
    expect(stats.error).not.toBeNull()
    expect(`${stats.error?.code} ${stats.error?.message}`).toMatch(
      /42501|before predictions lock/,
    )
  })

  it('(b) returns zero rows below the minimum sample', async () => {
    const consensus = await anon.rpc('get_prediction_consensus', {
      p_movie_id: lockedTwoId,
    })
    expect(consensus.error).toBeNull()
    expect(consensus.data).toEqual([])

    const stats = await anon.rpc('get_prediction_stats', {
      p_movie_id: lockedTwoId,
    })
    expect(stats.error).toBeNull()
    expect(stats.data).toEqual([])
  })

  it('(c) returns the histogram and stats at/above the minimum sample', async () => {
    const consensus = await anon.rpc('get_prediction_consensus', {
      p_movie_id: lockedThreeId,
    })
    expect(consensus.error).toBeNull()
    expect(
      (consensus.data ?? []).map((b) => [Number(b.bucket), b.count]),
    ).toEqual([
      [7.0, 2], // 7.0 and 7.4 share the 7.0 bucket
      [9.0, 1],
    ])

    const stats = await anon.rpc('get_prediction_stats', {
      p_movie_id: lockedThreeId,
    })
    expect(stats.error).toBeNull()
    expect(stats.data).toHaveLength(1)
    const row = stats.data![0]
    expect(row.prediction_count).toBe(3)
    expect(Number(row.median)).toBeCloseTo(7.4, 5)
    expect(Number(row.mean)).toBeCloseTo(7.8, 5)
  })
})
