import { Resend, type CreateEmailOptions } from 'resend'
import { fetchLeaderboard } from '@/lib/leaderboard/aggregate'

/**
 * Settlement emails (C2). Server-only module — never import from client
 * components: it reads RESEND_API_KEY / SUPABASE_SERVICE_ROLE_KEY and uses
 * the Supabase admin API. `resend` must not appear outside this file.
 *
 * Contract: email is strictly fire-and-forget *after* settlement succeeds.
 * Callers invoke `sendSettlementEmails` without letting a rejection reach
 * the settlement path, and unconfigured email (no RESEND_API_KEY) degrades
 * to a logged skip rather than a throw.
 */

/** Resend's batch endpoint accepts up to 100 emails; stay comfortably under. */
export const EMAIL_BATCH_SIZE = 50

export interface SendSettlementEmailsResult {
  sent: number
  failed: number
  skipped?: true
}

export interface SettlementScoreEvent {
  user_id: string
  points: number
  prediction_value: number
}

export interface RecipientProfile {
  id: string
  email_opt_out: boolean
}

export interface Recipient {
  userId: string
  email: string
  points: number
  predictedValue: number
  /** All-time leaderboard rank; null if the leaderboard read failed. */
  rank: number | null
}

/**
 * Pure recipient assembly: one entry per unique user with a score event,
 * minus opt-outs, minus users we have no email address for, joined with
 * their points, prediction, and current all-time rank. Unit-tested core —
 * keep it free of I/O.
 */
export function buildRecipientList(
  scoreEvents: SettlementScoreEvent[],
  profiles: RecipientProfile[],
  emailByUserId: Map<string, string>,
  rankByUserId: Map<string, number>,
): Recipient[] {
  const optedIn = new Set(
    profiles.filter((p) => !p.email_opt_out).map((p) => p.id),
  )

  const seen = new Set<string>()
  const recipients: Recipient[] = []
  for (const event of scoreEvents) {
    if (seen.has(event.user_id)) continue
    seen.add(event.user_id)
    if (!optedIn.has(event.user_id)) continue
    const email = emailByUserId.get(event.user_id)
    if (!email) continue
    recipients.push({
      userId: event.user_id,
      email,
      points: event.points,
      predictedValue: Number(event.prediction_value),
      rank: rankByUserId.get(event.user_id) ?? null,
    })
  }
  return recipients
}

/**
 * Emails need an absolute link. VERCEL_PROJECT_PRODUCTION_URL is set
 * automatically on Vercel (host only, no protocol), so no extra required
 * env var; local smoke tests link to localhost.
 */
function dashboardUrl(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return `${host ? `https://${host}` : 'http://localhost:3000'}/dashboard`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderSettlementEmail(
  recipient: Recipient,
  movieTitle: string,
  officialRating: number,
): { subject: string; html: string; text: string } {
  const rating = officialRating.toFixed(1)
  const predicted = recipient.predictedValue.toFixed(1)
  const url = dashboardUrl()
  const rankLine =
    recipient.rank !== null
      ? `Your all-time rank is #${recipient.rank}.`
      : null

  const subject = `${movieTitle} settled at ${rating} — you scored ${recipient.points} points`

  const text = [
    `${movieTitle} settled at ${rating}.`,
    '',
    `You predicted ${predicted}. The official rating is ${rating}.`,
    `You earned ${recipient.points} points.${rankLine ? ` ${rankLine}` : ''}`,
    '',
    `See your results: ${url}`,
    '',
    'You can turn these emails off on your dashboard.',
  ].join('\n')

  const title = escapeHtml(movieTitle)
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:18px;margin:0 0 16px">${title} settled at ${rating}</h1>
  <p style="margin:0 0 8px">You predicted ${predicted}. The official rating is ${rating}.</p>
  <p style="margin:0 0 16px">You earned <strong>${recipient.points} points</strong>.${rankLine ? ` ${escapeHtml(rankLine)}` : ''}</p>
  <p style="margin:0 0 24px">
    <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px">See your results</a>
  </p>
  <p style="margin:0;font-size:12px;color:#6b7280">You can turn these emails off on your dashboard.</p>
</div>`

  return { subject, html, text }
}

/**
 * Send the one settlement email to every opted-in user who predicted the
 * movie. Called only after the settle_movie RPC has succeeded; the score
 * events it reads are the ones that settlement just wrote.
 *
 * Never throws for the unconfigured case: without RESEND_API_KEY (or
 * EMAIL_FROM) it logs one warning and reports a skip. Send failures are
 * captured per recipient — one bad address costs one email, not the batch.
 */
export async function sendSettlementEmails(
  movieId: string,
): Promise<SendSettlementEmailsResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    console.warn(
      `[settlement-email] RESEND_API_KEY/EMAIL_FROM not set — skipping emails for movie ${movieId}`,
    )
    return { sent: 0, failed: 0, skipped: true }
  }

  // Lazy import keeps this module loadable outside a Next.js runtime (the
  // supabase server helper pulls in next/headers); nothing below runs when
  // email is unconfigured.
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const { data: settlement } = await supabase
    .from('settlements')
    .select('official_rating')
    .eq('movie_id', movieId)
    .maybeSingle()
  if (!settlement) {
    console.warn(`[settlement-email] no settlement for movie ${movieId}`)
    return { sent: 0, failed: 0 }
  }

  const { data: movie } = await supabase
    .from('movies')
    .select('title')
    .eq('id', movieId)
    .maybeSingle()

  const { data: scoreEvents, error: eventsError } = await supabase
    .from('score_events')
    .select('user_id, points, prediction_value')
    .eq('movie_id', movieId)
  if (eventsError) {
    throw new Error(`[settlement-email] score_events: ${eventsError.message}`)
  }
  if (!scoreEvents || scoreEvents.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const userIds = [...new Set(scoreEvents.map((e) => e.user_id))]

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email_opt_out')
    .in('id', userIds)
    .eq('email_opt_out', false)
  if (profilesError) {
    throw new Error(`[settlement-email] profiles: ${profilesError.message}`)
  }

  // Batched listUsers over per-user getUserById: one admin call covers 1000
  // users, so at this app's size the whole user table fits in a single call
  // regardless of recipient count, where getUserById costs one call per
  // recipient.
  const emailByUserId = new Map<string, string>()
  const wanted = new Set(userIds)
  for (let page = 1; page <= 20 && wanted.size > 0; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })
    if (error) {
      throw new Error(`[settlement-email] listUsers: ${error.message}`)
    }
    for (const user of data.users) {
      if (wanted.has(user.id) && user.email) {
        emailByUserId.set(user.id, user.email)
        wanted.delete(user.id)
      }
    }
    if (data.users.length < 1000) break
  }

  // Reuse the leaderboard aggregation for ranks; a failed read degrades to
  // rank-less emails rather than no emails.
  const leaderboard = await fetchLeaderboard(
    supabase,
    'all_time',
    Number.MAX_SAFE_INTEGER,
  )
  const rankByUserId = new Map<string, number>()
  if (leaderboard.ok) {
    for (const entry of leaderboard.entries) {
      rankByUserId.set(entry.user_id, entry.rank)
    }
  }

  const recipients = buildRecipientList(
    scoreEvents,
    profiles ?? [],
    emailByUserId,
    rankByUserId,
  )
  if (recipients.length === 0) return { sent: 0, failed: 0 }

  const officialRating = Number(settlement.official_rating)
  const movieTitle = movie?.title ?? 'A movie you predicted'
  const payloads: CreateEmailOptions[] = recipients.map((recipient) => {
    const { subject, html, text } = renderSettlementEmail(
      recipient,
      movieTitle,
      officialRating,
    )
    return { from, to: recipient.email, subject, html, text }
  })

  const resend = new Resend(apiKey)
  let sent = 0
  let failed = 0

  for (let i = 0; i < payloads.length; i += EMAIL_BATCH_SIZE) {
    const batch = payloads.slice(i, i + EMAIL_BATCH_SIZE)
    try {
      const { error } = await resend.batch.send(batch)
      if (!error) {
        sent += batch.length
        continue
      }
      console.warn(
        `[settlement-email] batch send failed (${error.message}) — retrying individually`,
      )
    } catch (e) {
      console.warn(
        `[settlement-email] batch send threw (${e instanceof Error ? e.message : 'unknown'}) — retrying individually`,
      )
    }

    // The batch endpoint is all-or-nothing on validation, so isolate the bad
    // address(es) by resending this chunk one email at a time.
    for (const payload of batch) {
      try {
        const { error } = await resend.emails.send(payload)
        if (error) {
          failed += 1
          console.error(
            `[settlement-email] send to ${payload.to} failed: ${error.message}`,
          )
        } else {
          sent += 1
        }
      } catch (e) {
        failed += 1
        console.error(
          `[settlement-email] send to ${payload.to} threw: ${e instanceof Error ? e.message : 'unknown'}`,
        )
      }
    }
  }

  return { sent, failed }
}
