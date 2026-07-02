/**
 * Pure eligibility logic for movie settlement. No DB access.
 *
 * Rules:
 *  - A movie becomes settlement-eligible once 28 days have passed
 *    since the release date.
 */

export type Eligibility =
  | 'waiting_window' // pre-day-28
  | 'ready_to_settle' // day-28 reached

export const SETTLEMENT_WINDOW_DAYS = 28

export interface EligibilityInput {
  releaseDate: Date | string | null | undefined
  now?: Date
}

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d
}

function daysBetween(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function checkEligibility(input: EligibilityInput): Eligibility {
  const { releaseDate, now = new Date() } = input

  if (!releaseDate) return 'waiting_window'
  const release = toDate(releaseDate)
  const daysSince = daysBetween(now, release)

  if (daysSince < SETTLEMENT_WINDOW_DAYS) {
    return 'waiting_window'
  }

  return 'ready_to_settle'
}

/**
 * Whole days until the movie becomes settlement-eligible (release + 28),
 * clamped at 0. 0 means the window has been reached — the movie settles at
 * the first daily snapshot from now on. Returns null without a release date.
 *
 * Boundaries: day 27 → 1, day 28 → 0.
 */
export function daysUntilSettlement(input: EligibilityInput): number | null {
  const { releaseDate, now = new Date() } = input

  if (!releaseDate) return null
  const release = toDate(releaseDate)
  const daysSince = daysBetween(now, release)

  return Math.max(0, SETTLEMENT_WINDOW_DAYS - daysSince)
}
