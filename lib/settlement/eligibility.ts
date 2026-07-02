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
