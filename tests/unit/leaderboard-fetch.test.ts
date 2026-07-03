import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { fetchLeaderboard } from '@/lib/leaderboard/aggregate'

/**
 * Minimal fake of the supabase-js query builder surface fetchLeaderboard uses:
 * `.from('score_events').select().order().order().range()` resolves to a page,
 * and `.from('profiles').select().in()` resolves to profile rows. We only need
 * to control whether the score_events read throws vs. returns rows.
 */
function fakeClient(opts: {
  scoreEvents: () => Promise<{ data: unknown; error: unknown }>
  profiles?: { data: unknown; error: unknown }
}): SupabaseClient<Database> {
  const profilesResult = opts.profiles ?? { data: [], error: null }

  const scoreEventsBuilder = () => {
    // Chainable AND thenable, like the real supabase-js builder: select /
    // order / gte / range all return the builder, and awaiting it runs the
    // query. gte can be applied after range (the code does exactly that).
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = chain
    builder.order = chain
    builder.gte = chain
    builder.range = chain
    builder.then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => opts.scoreEvents().then(resolve, reject)
    return builder
  }

  const profilesBuilder = () => {
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.in = () => Promise.resolve(profilesResult)
    return builder
  }

  return {
    from(table: string) {
      if (table === 'score_events') return scoreEventsBuilder()
      if (table === 'profiles') return profilesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  } as unknown as SupabaseClient<Database>
}

describe('fetchLeaderboard error vs empty (B1)', () => {
  it('returns ok:false when the score_events read errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = fakeClient({
      scoreEvents: async () => ({ data: null, error: { message: 'boom' } }),
    })

    const result = await fetchLeaderboard(client, 'all_time')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('boom')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('returns ok:false when the page fetch throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = fakeClient({
      scoreEvents: async () => {
        throw new Error('network down')
      },
    })

    const result = await fetchLeaderboard(client, 'weekly')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('network down')
    spy.mockRestore()
  })

  it('returns ok:true with an empty array when there are genuinely no events', async () => {
    const client = fakeClient({
      scoreEvents: async () => ({ data: [], error: null }),
    })

    const result = await fetchLeaderboard(client, 'all_time')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.entries).toEqual([])
  })

  it('returns ok:true with ranked entries on success', async () => {
    let called = false
    const client = fakeClient({
      scoreEvents: async () => {
        // First page returns the rows; second page (called by collectPages
        // only if the first were full) would be empty. A short first page
        // terminates the loop.
        if (called) return { data: [], error: null }
        called = true
        return {
          data: [
            { user_id: 'a', points: 110, created_at: '2026-01-01' },
            { user_id: 'b', points: 70, created_at: '2026-01-02' },
          ],
          error: null,
        }
      },
      profiles: {
        data: [
          { id: 'a', username: 'alice' },
          { id: 'b', username: 'bob' },
        ],
        error: null,
      },
    })

    const result = await fetchLeaderboard(client, 'all_time')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map((e) => [e.user_id, e.total_points, e.rank])).toEqual(
      [
        ['a', 110, 1],
        ['b', 70, 2],
      ],
    )
  })
})
