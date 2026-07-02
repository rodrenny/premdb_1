import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Integration tests require a live Supabase project. They self-skip when
 * these env vars aren't present, so unit tests still pass in isolation.
 *
 * Set them in `.env.local` (or export in your shell):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
export const hasSupabaseEnv = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/** Anon-key-dependent tests additionally need the publishable (anon) key. */
export const hasAnonEnv =
  hasSupabaseEnv && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export function makeServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

/** Client with no session — sees exactly what an anonymous visitor sees. */
export function makeAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

/**
 * Create a confirmed user with a password and return a client signed in as
 * that user — i.e. a real user-session client that goes through RLS and
 * in-function auth checks exactly like the browser would.
 */
export async function createTestUserWithSession(
  svc: SupabaseClient<Database>,
  emailPrefix = 'premdb-test',
): Promise<{ id: string; email: string; client: SupabaseClient<Database> }> {
  const email = `${emailPrefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.test`
  const password = `pw-${Math.random().toString(36).slice(2)}-${Date.now()}`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`)
  }

  const client = makeAnonClient()
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) {
    throw new Error(`Failed to sign in test user: ${signInError.message}`)
  }
  return { id: data.user.id, email, client }
}

/** Generate a unique tmdb_id far above real TMDb ids to avoid collisions. */
export function testTmdbId(): number {
  return 9_900_000 + Math.floor(Math.random() * 99_999)
}

export async function createTestUser(
  svc: SupabaseClient<Database>,
  emailPrefix = 'premdb-test',
): Promise<{ id: string; email: string }> {
  const email = `${emailPrefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.test`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`)
  }
  return { id: data.user.id, email }
}

export async function deleteTestUser(
  svc: SupabaseClient<Database>,
  userId: string,
) {
  await svc.auth.admin.deleteUser(userId).catch(() => undefined)
}

export async function insertTestMovie(
  svc: SupabaseClient<Database>,
  overrides: Partial<Database['public']['Tables']['movies']['Insert']> = {},
): Promise<Database['public']['Tables']['movies']['Row']> {
  const tmdbId = overrides.tmdb_id ?? testTmdbId()
  const { data, error } = await svc
    .from('movies')
    .insert({
      tmdb_id: tmdbId,
      title: `Test Movie ${tmdbId}`,
      release_date: new Date().toISOString().slice(0, 10),
      prediction_locks_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'upcoming',
      ...overrides,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`Failed to insert test movie: ${error?.message}`)
  }
  return data
}
