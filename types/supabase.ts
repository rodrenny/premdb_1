// Placeholder. Regenerate after applying migrations with:
//
//   npm run db:types
//
// (or `supabase gen types typescript --project-id <ref> > types/supabase.ts`
// for remote projects).
//
// This hand-written version mirrors `supabase/migrations/001_initial.sql`
// so the app is type-safe before you first run the generator.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MovieStatus =
  | 'upcoming'
  | 'released_waiting_window'
  | 'awaiting_review'
  | 'settled'
  | 'canceled'

export type UserRole = 'user' | 'admin'

export type SettlementSourceType = 'manual' | 'dataset' | 'api_import'

export type RatingSnapshotSource = 'tmdb' | 'imdb'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          role: UserRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      movies: {
        Row: {
          id: string
          tmdb_id: number
          imdb_id: string | null
          title: string
          original_title: string | null
          overview: string | null
          poster_path: string | null
          backdrop_path: string | null
          release_date: string | null
          release_date_source: string | null
          prediction_locks_at: string | null
          runtime: number | null
          tmdb_rating_snapshot: number | null
          tmdb_num_votes_snapshot: number | null
          tmdb_snapshot_date: string | null
          genres: Json
          director_name: string | null
          cast_preview: Json
          trailer_youtube_key: string | null
          status: MovieStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tmdb_id: number
          imdb_id?: string | null
          title: string
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          backdrop_path?: string | null
          release_date?: string | null
          release_date_source?: string | null
          prediction_locks_at?: string | null
          runtime?: number | null
          tmdb_rating_snapshot?: number | null
          tmdb_num_votes_snapshot?: number | null
          tmdb_snapshot_date?: string | null
          genres?: Json
          director_name?: string | null
          cast_preview?: Json
          trailer_youtube_key?: string | null
          status?: MovieStatus
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['movies']['Insert']>
        Relationships: []
      }
      predictions: {
        Row: {
          id: string
          user_id: string
          movie_id: string
          predicted_value: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          movie_id: string
          predicted_value: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['predictions']['Insert']>
        Relationships: []
      }
      settlements: {
        Row: {
          id: string
          movie_id: string
          official_rating: number
          official_num_votes: number | null
          settlement_snapshot_date: string
          settled_at: string
          release_date_used: string
          eligible_from_date: string
          settlement_rule_version: string
          source_type: SettlementSourceType
          source_snapshot: string | null
          settlement_notes: string | null
        }
        Insert: {
          id?: string
          movie_id: string
          official_rating: number
          official_num_votes?: number | null
          settlement_snapshot_date: string
          settled_at?: string
          release_date_used: string
          eligible_from_date: string
          settlement_rule_version?: string
          source_type?: SettlementSourceType
          source_snapshot?: string | null
          settlement_notes?: string | null
        }
        Update: Partial<Database['public']['Tables']['settlements']['Insert']>
        Relationships: []
      }
      rating_snapshots: {
        Row: {
          id: string
          movie_id: string
          source: RatingSnapshotSource
          rating: number
          num_votes: number | null
          snapshot_date: string
          created_at: string
        }
        Insert: {
          id?: string
          movie_id: string
          source?: RatingSnapshotSource
          rating: number
          num_votes?: number | null
          snapshot_date: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['rating_snapshots']['Insert']>
        Relationships: []
      }
      score_events: {
        Row: {
          id: string
          user_id: string
          movie_id: string
          points: number
          prediction_value: number
          official_value: number
          movie_title_snapshot: string | null
          settlement_snapshot_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          movie_id: string
          points: number
          prediction_value: number
          official_value: number
          movie_title_snapshot?: string | null
          settlement_snapshot_date?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['score_events']['Insert']>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      get_prediction_consensus: {
        Args: {
          p_movie_id: string
        }
        Returns: {
          bucket: number
          count: number
        }[]
      }
      get_prediction_stats: {
        Args: {
          p_movie_id: string
        }
        Returns: {
          prediction_count: number
          median: number
          mean: number
        }[]
      }
      settle_movie: {
        Args: {
          p_movie_id: string
          p_official_rating: number
          p_official_num_votes?: number | null
          p_settlement_snapshot_date: string
          p_release_date_used: string
          p_settlement_notes?: string | null
          p_source_type?: string | null
          p_source_snapshot?: string | null
        }
        Returns: string
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
