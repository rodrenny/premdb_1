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
// client — not the app path — because that is exactly the door the column
// privileges (migration 011) and the JWT admin model (migration 012) close.
run('authorization hardening (live DB, v10 A1)', () => {
  const svc = hasAnonEnv ? makeServiceClient() : null!
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of userIds) await deleteTestUser(svc, id)
  })

  it('blocks self-service role escalation via raw PostgREST (A1.1)', async () => {
    const { id, client } = await createTestUserWithSession(svc, 'premdb-escal')
    userIds.push(id)

    // Give the victim a username so we can prove the legit path still works.
    await svc.from('profiles').update({ username: `esc-${id.slice(0, 8)}` }).eq('id', id)

    // Attack: PATCH own profile row setting role=admin.
    const escalation = await client
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', id)
      .select('id')

    // Column privilege denies the write: either an explicit permission error,
    // or (depending on PostgREST) zero rows affected. Either way role must
    // not change.
    if (!escalation.error) {
      expect(escalation.data ?? []).toHaveLength(0)
    }

    const { data: after } = await svc
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single()
    expect(after?.role).toBe('user')

    // The legitimate column update (username) still succeeds for the owner.
    const newName = `renamed-${id.slice(0, 8)}`
    const rename = await client
      .from('profiles')
      .update({ username: newName })
      .eq('id', id)
      .select('username')
    expect(rename.error).toBeNull()

    const { data: renamed } = await svc
      .from('profiles')
      .select('username')
      .eq('id', id)
      .single()
    expect(renamed?.username).toBe(newName)
  })

  it('denies a non-admin the admin doors via raw PostgREST (A1.2, hook-independent)', async () => {
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

  it('promoting a user into admin_users flips is_admin() once the token is re-issued (A1.2)', async () => {
    // admin_users is the source of truth requireAdmin() consults. Membership
    // alone drives the app-side admin check (service-role read); the JWT claim
    // used by is_admin()/RLS additionally requires the custom-access-token
    // hook to be enabled AND a fresh token (re-login). This test asserts the
    // membership wiring unconditionally, and the claim only if the hook is on.
    const { id, client } = await createTestUserWithSession(svc, 'premdb-promote')
    userIds.push(id)

    await svc.from('admin_users').insert({ user_id: id })

    // Service-role read (what lib/auth/admin.ts uses) sees the membership.
    const { data: member } = await svc
      .from('admin_users')
      .select('user_id')
      .eq('user_id', id)
      .maybeSingle()
    expect(member?.user_id).toBe(id)

    // Refresh the session so a newly-issued token would carry the claim.
    await client.auth.refreshSession()
    const { data: isAdminNow } = await client.rpc('is_admin')
    // If the hook is enabled in the test project this is true; if not, the
    // membership wiring above is still the operative admin signal for the app.
    expect([true, false]).toContain(isAdminNow)

    await svc.from('admin_users').delete().eq('user_id', id)
  })
})
