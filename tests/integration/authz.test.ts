import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserWithSession,
  deleteTestUser,
  hasAnonEnv,
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
})
