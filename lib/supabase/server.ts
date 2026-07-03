import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  createClient as createSupabaseJsClient,
  type SupabaseClient,
} from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/**
 * Request-scoped Supabase client for server components, server actions, and
 * route handlers. Session cookies are refreshed automatically.
 *
 * The return type is asserted to supabase-js's own `SupabaseClient<Database>`:
 * `@supabase/ssr@0.5.x` still instantiates the client type with the old
 * three-generic parameter order, which collapses every typed query to `never`
 * against `supabase-js@2.10x`. The runtime object is exactly the same client,
 * only the declared generics are stale.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // `set` is unavailable in server components without a response
            // (i.e. during pure rendering). Middleware handles the refresh
            // cookie writes, so this is safe to ignore.
          }
        },
      },
    },
  ) as unknown as SupabaseClient<Database>
}

/**
 * Service-role client. Bypasses RLS — only use inside server-only code where
 * you have verified the caller is authorized (e.g. cron endpoints with a
 * shared secret, or after `requireAdmin()`).
 */
export function createServiceClient(): SupabaseClient<Database> {
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
