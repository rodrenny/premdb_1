import { z } from 'zod'

export const emailSchema = z.object({
  email: z.email(),
})

export const usernameSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers and underscores'),
})

export const predictionSchema = z.object({
  movieId: z.uuid(),
  value: z
    .number()
    .min(1)
    .max(10)
    .refine((v) => Math.round(v * 10) === v * 10, 'One decimal place only'),
})

export const settlementSchema = z.object({
  movieId: z.uuid(),
  officialRating: z.number().min(1).max(10),
  // Informational metadata only — not part of the settlement contract (B4).
  officialNumVotes: z.int().min(0).optional(),
  settlementSnapshotDate: z.iso.date(),
  releaseDateUsed: z.iso.date(),
  settlementNotes: z.string().optional(),
})

export const movieAdminSchema = z.object({
  imdbId: z.string().optional(),
  releaseDate: z.iso.date().optional(),
  predictionLocksAt: z.iso.datetime().optional(),
  status: z
    .enum([
      'upcoming',
      'released_waiting_window',
      'awaiting_review',
      'settled',
      'canceled',
    ])
    .optional(),
})

export type EmailInput = z.infer<typeof emailSchema>
export type UsernameInput = z.infer<typeof usernameSchema>
export type PredictionInput = z.infer<typeof predictionSchema>
export type SettlementInput = z.infer<typeof settlementSchema>
export type MovieAdminInput = z.infer<typeof movieAdminSchema>
