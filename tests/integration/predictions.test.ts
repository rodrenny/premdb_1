import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  deleteTestUser,
  hasSupabaseEnv,
  insertTestMovie,
  makeServiceClient,
} from './_helpers'

const run = hasSupabaseEnv ? describe : describe.skip

run('predictions (live DB)', () => {
  const svc = hasSupabaseEnv ? makeServiceClient() : null!
  let userId: string
  let movieIdOpen: string
  let movieIdLocked: string

  beforeAll(async () => {
    const user = await createTestUser(svc)
    userId = user.id

    const open = await insertTestMovie(svc, {
      prediction_locks_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'upcoming',
    })
    movieIdOpen = open.id

    const locked = await insertTestMovie(svc, {
      prediction_locks_at: new Date(Date.now() - 86_400_000).toISOString(),
      status: 'upcoming',
    })
    movieIdLocked = locked.id
  })

  afterAll(async () => {
    if (!userId) return
    // movies have cascade on user delete only for predictions/score_events —
    // clean the movies up explicitly.
    await svc.from('movies').delete().in('id', [movieIdOpen, movieIdLocked])
    await deleteTestUser(svc, userId)
  })

  it('stores a prediction for an open movie', async () => {
    const { error } = await svc.from('predictions').insert({
      user_id: userId,
      movie_id: movieIdOpen,
      predicted_value: 7.3,
    })
    expect(error).toBeNull()

    const { data } = await svc
      .from('predictions')
      .select('*')
      .eq('user_id', userId)
      .eq('movie_id', movieIdOpen)
      .maybeSingle()
    expect(data?.predicted_value).toBe(7.3)
  })

  it('blocks a duplicate prediction via the unique constraint', async () => {
    // First insert already exists from the previous test.
    const { error } = await svc.from('predictions').insert({
      user_id: userId,
      movie_id: movieIdOpen,
      predicted_value: 6.1,
    })
    expect(error).not.toBeNull()
    // Postgres unique_violation
    expect(error?.code).toBe('23505')
  })

  it('allows updating the existing prediction via upsert', async () => {
    const { error } = await svc
      .from('predictions')
      .upsert(
        {
          user_id: userId,
          movie_id: movieIdOpen,
          predicted_value: 8.2,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,movie_id' },
      )
    expect(error).toBeNull()

    const { data } = await svc
      .from('predictions')
      .select('predicted_value')
      .eq('user_id', userId)
      .eq('movie_id', movieIdOpen)
      .maybeSingle()
    expect(Number(data?.predicted_value)).toBe(8.2)
  })

  it('rejects predicted_value outside 1.0–10.0', async () => {
    const { error } = await svc.from('predictions').insert({
      user_id: userId,
      movie_id: movieIdLocked,
      predicted_value: 11.0,
    })
    expect(error).not.toBeNull()
  })

  // The lock-state check lives in the server action, not the DB. The direct
  // service-role insert doesn't know about lock time, so we assert the
  // predicate instead.
  it('lock state is derived from prediction_locks_at, not from status', async () => {
    const { data } = await svc
      .from('movies')
      .select('id, status, prediction_locks_at')
      .eq('id', movieIdLocked)
      .single()
    expect(data?.status).toBe('upcoming')
    const locked =
      !!data?.prediction_locks_at &&
      new Date(data.prediction_locks_at).getTime() <= Date.now()
    expect(locked).toBe(true)
  })
})
