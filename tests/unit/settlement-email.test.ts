import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildRecipientList,
  sendSettlementEmails,
  type RecipientProfile,
  type SettlementScoreEvent,
} from '@/lib/email/settlement'

const events = (
  ...rows: [string, number, number][]
): SettlementScoreEvent[] =>
  rows.map(([user_id, points, prediction_value]) => ({
    user_id,
    points,
    prediction_value,
  }))

const profiles = (...rows: [string, boolean][]): RecipientProfile[] =>
  rows.map(([id, email_opt_out]) => ({ id, email_opt_out }))

describe('buildRecipientList', () => {
  const emails = new Map([
    ['a', 'a@example.test'],
    ['b', 'b@example.test'],
    ['c', 'c@example.test'],
  ])
  const ranks = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 2],
  ])

  it('joins points, prediction, email, and rank per recipient', () => {
    const list = buildRecipientList(
      events(['a', 110, 7.4], ['b', 90, 6.9]),
      profiles(['a', false], ['b', false]),
      emails,
      ranks,
    )
    expect(list).toEqual([
      {
        userId: 'a',
        email: 'a@example.test',
        points: 110,
        predictedValue: 7.4,
        rank: 1,
      },
      {
        userId: 'b',
        email: 'b@example.test',
        points: 90,
        predictedValue: 6.9,
        rank: 2,
      },
    ])
  })

  it('filters out opted-out users', () => {
    const list = buildRecipientList(
      events(['a', 110, 7.4], ['b', 90, 6.9]),
      profiles(['a', false], ['b', true]),
      emails,
      ranks,
    )
    expect(list.map((r) => r.userId)).toEqual(['a'])
  })

  it('dedupes repeated user ids, keeping the first score event', () => {
    const list = buildRecipientList(
      events(['a', 110, 7.4], ['a', 50, 5.0]),
      profiles(['a', false]),
      emails,
      ranks,
    )
    expect(list).toHaveLength(1)
    expect(list[0].points).toBe(110)
  })

  it('skips users without a profile row or a known email', () => {
    const list = buildRecipientList(
      // 'c' has no profile row; 'd' has a profile but no email.
      events(['c', 80, 8.0], ['d', 70, 7.0]),
      profiles(['d', false]),
      emails,
      ranks,
    )
    expect(list).toEqual([])
  })

  it('uses a null rank when the user is missing from the ranking', () => {
    const list = buildRecipientList(
      events(['a', 110, 7.4]),
      profiles(['a', false]),
      emails,
      new Map(),
    )
    expect(list[0].rank).toBeNull()
  })

  it('returns an empty list for empty score events', () => {
    expect(
      buildRecipientList([], profiles(['a', false]), emails, ranks),
    ).toEqual([])
  })
})

describe('sendSettlementEmails without configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns a skip result (never throws) when RESEND_API_KEY is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', undefined)
    vi.stubEnv('EMAIL_FROM', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendSettlementEmails('00000000-0000-0000-0000-000000000000')

    expect(result).toEqual({ sent: 0, failed: 0, skipped: true })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('also skips when only EMAIL_FROM is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('EMAIL_FROM', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendSettlementEmails('00000000-0000-0000-0000-000000000000')

    expect(result).toEqual({ sent: 0, failed: 0, skipped: true })
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
