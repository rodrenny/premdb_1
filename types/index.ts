import type { Database, MovieStatus } from './supabase'

export type Movie = Database['public']['Tables']['movies']['Row']
export type MovieInsert = Database['public']['Tables']['movies']['Insert']
export type Prediction = Database['public']['Tables']['predictions']['Row']
export type Settlement = Database['public']['Tables']['settlements']['Row']
export type ScoreEvent = Database['public']['Tables']['score_events']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']

export type { MovieStatus }

export interface CastMember {
  name: string
  character: string
  profile_path?: string | null
}

export interface Genre {
  id: number
  name: string
}

/** Derived display state for a movie — combines persisted status with lock state. */
export type MovieDisplayState =
  | 'open'
  | 'locked'
  | 'released_waiting_window'
  | 'awaiting_review'
  | 'settled'
  | 'canceled'

export interface LeaderboardEntry {
  user_id: string
  username: string | null
  total_points: number
  settled_count: number
  rank: number
}

export type LeaderboardRange = 'weekly' | 'monthly' | 'all_time'
