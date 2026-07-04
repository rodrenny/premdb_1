import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runAutoSettlePhase } from '@/lib/settlement/auto'
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

/**
 * C2 acceptance: settlement succeeds identically whether email is
 * unconfigured (no RESEND_API_KEY → silent skip) or the email path throws
 * outright — email is fire-and-forget after the RPC, never a settlement
 * failure mode.
 */
run('settlement emails never affect settlement (live DB, C2)', () => {
  const svc = hasSupabaseEnv ? makeServiceClient() : null!

  const userIds: string[] = []
  const movieIds: string[] = []
  let userId: string

  /** A settle-ready movie: awaiting_review with an eligible day-29 snapshot. */
  async function insertSettleReadyMovie(): Promise<string> {
    const movie = await insertTestMovie(svc, {
      release_date: isoDaysAgo(30),
      prediction_locks_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      status: 'awaiting_review',
    })
    movieIds.push(movie.id)

    const { error: predictionErr } = await svc.from('predictions').insert({
      user_id: userId,
      movie_id: movie.id,
      predicted_value: 7.1,
    })
    if (predictionErr) throw new Error(predictionErr.message)

    const { error: snapshotErr } = await svc.from('rating_snapshots').insert({
      movie_id: movie.id,
      rating: 7.1,
      num_votes: 1_200,
      snapshot_date: isoDaysAgo(1),
    })
    if (snapshotErr) throw new Error(snapshotErr.message)

    return movie.id
  }

  async function expectSettled(movieId: string) {
    const { data: movie } = await svc
      .from('movies')
      .select('status')
      .eq('id', movieId)
      .single()
    expect(movie?.status).toBe('settled')

    const { data: events } = await svc
      .from('score_events')
      .select('points')
      .eq('movie_id', movieId)
    expect(events).toHaveLength(1)
    expect(events?.[0].points).toBe(110)
  }

  beforeAll(async () => {
    const user = await createTestUser(svc, 'premdb-email')
    userId = user.id
    userIds.push(user.id)
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    if (movieIds.length > 0) {
      await svc.from('movies').delete().in('id', movieIds)
    }
    for (const id of userIds) await deleteTestUser(svc, id)
  })

  it('settles with no RESEND_API_KEY — the default sender silently skips', async () => {
    vi.stubEnv('RESEND_API_KEY', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const movieId = await insertSettleReadyMovie()
    const result = await runAutoSettlePhase(svc)

    expect(
      result.errors.filter((e) => e.includes(movieId)),
    ).toEqual([])
    expect(result.emailsSent).toBe(0)
    expect(result.emailsFailed).toBe(0)
    await expectSettled(movieId)

    warn.mockRestore()
    vi.unstubAllEnvs()
  })

  it('settles even when the email sender throws, and counts the failure', async () => {
    const movieId = await insertSettleReadyMovie()

    const result = await runAutoSettlePhase(svc, async () => {
      throw new Error('resend exploded')
    })

    // The settlement itself produced no error; the email failure is counted
    // and reported separately, never rolled into a settlement failure.
    expect(
      result.errors.filter(
        (e) => e.includes(movieId) && e.startsWith('auto-settle'),
      ),
    ).toEqual([])
    expect(result.errors).toContain(`email (${movieId}): resend exploded`)
    expect(result.emailsFailed).toBeGreaterThanOrEqual(1)
    await expectSettled(movieId)
  })

  it('accumulates sender counters into the phase result', async () => {
    const movieId = await insertSettleReadyMovie()

    const result = await runAutoSettlePhase(svc, async () => ({
      sent: 2,
      failed: 1,
    }))

    expect(
      result.errors.filter((e) => e.includes(movieId)),
    ).toEqual([])
    // Other awaiting_review test data may settle in the same run; every
    // settle calls the fake sender, so assert lower bounds.
    expect(result.emailsSent).toBeGreaterThanOrEqual(2)
    expect(result.emailsFailed).toBeGreaterThanOrEqual(1)
    await expectSettled(movieId)
  })
})
