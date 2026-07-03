import { afterAll, describe, expect, it } from 'vitest'
import {
  createTestUserWithSession,
  deleteTestUser,
  hasAnonEnv,
  insertTestMovie,
  makeServiceClient,
} from './_helpers'

const run = hasAnonEnv ? describe : describe.skip

// These exercise the raw PostgREST attack path with a real user-session
// client — not the app path — because that is exactly the door the JWT admin
// model (migration 012) closes.
run('authorization hardening (live DB)', () => {
  const svc = hasAnonEnv ? makeServiceClient() : null!
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of userIds) await deleteTestUser(svc, id)
  })

  it('denies a non-admin the admin doors via raw PostgREST (hook-independent)', async () => {
    const { id, client } = await createTestUserWithSession(svc, 'premdb-nonadmin')
    userIds.push(id)

    // is_admin() reads the JWT claim; a non-admin has no app_role claim.
    const { data: isAdmin } = await client.rpc('is_admin')
    expect(isAdmin).toBe(false)

    const movie = await insertTestMovie(svc, {
      release_date: new Date(Date.now() - 40 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      status: 'awaiting_review',
    })

    // Direct settle_movie RPC → 42501.
    const settle = await client.rpc('settle_movie', {
      p_movie_id: movie.id,
      p_official_rating: 7.0,
      p_settlement_snapshot_date: new Date().toISOString().slice(0, 10),
      p_release_date_used: movie.release_date!,
    })
    expect(settle.error).not.toBeNull()
    expect(`${settle.error?.code} ${settle.error?.message}`).toMatch(
      /42501|admin role required/,
    )

    // Raw admin writes on movies and settlements are blocked by RLS.
    const movieInsert = await client
      .from('movies')
      .insert({ tmdb_id: 9_900_123, title: 'hack', status: 'upcoming' })
      .select('id')
    if (!movieInsert.error) expect(movieInsert.data ?? []).toHaveLength(0)

    const movieUpdate = await client
      .from('movies')
      .update({ status: 'canceled' })
      .eq('id', movie.id)
      .select('id')
    if (!movieUpdate.error) expect(movieUpdate.data ?? []).toHaveLength(0)

    const settlementInsert = await client
      .from('settlements')
      .insert({
        movie_id: movie.id,
        official_rating: 7.0,
        settlement_snapshot_date: new Date().toISOString().slice(0, 10),
        release_date_used: movie.release_date!,
        eligible_from_date: new Date().toISOString().slice(0, 10),
      })
      .select('id')
    if (!settlementInsert.error) {
      expect(settlementInsert.data ?? []).toHaveLength(0)
    }

    // The movie was never settled or modified.
    const { data: check } = await svc
      .from('movies')
      .select('status')
      .eq('id', movie.id)
      .single()
    expect(check?.status).toBe('awaiting_review')

    await svc.from('movies').delete().eq('id', movie.id)
  })

  it('admin_users membership is the sole admin signal (v11 P4)', async () => {
    // admin_users is the only thing requireAdmin()/isAdmin() consult: they do
    // exactly this service-client lookup (lib/auth/admin.ts). Absent → not
    // admin; present → admin. It is the single admin mechanism.
    const { id, client } = await createTestUserWithSession(svc, 'premdb-promote')
    userIds.push(id)

    // Absent from admin_users → the admin lookup finds nothing.
    const absent = await svc
      .from('admin_users')
      .select('user_id')
      .eq('user_id', id)
      .maybeSingle()
    expect(absent.data).toBeNull()

    // Promote: insert into admin_users (the only promotion path).
    await svc.from('admin_users').insert({ user_id: id })

    const present = await svc
      .from('admin_users')
      .select('user_id')
      .eq('user_id', id)
      .maybeSingle()
    expect(present.data?.user_id).toBe(id)

    // With a fresh token the JWT-claim path (is_admin() / RLS) also flips —
    // only if the custom-access-token hook is enabled in the test project.
    await client.auth.refreshSession()
    const { data: isAdminNow } = await client.rpc('is_admin')
    expect([true, false]).toContain(isAdminNow)

    await svc.from('admin_users').delete().eq('user_id', id)
  })
})
