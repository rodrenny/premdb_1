import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Request-scoped Supabase client for server components, server actions, and
 * route handlers. Session cookies are refreshed automatically.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
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
  )
}

/**
 * Service-role client. Bypasses RLS — only use inside server-only code where
 * you have verified the caller is authorized (e.g. cron endpoints with a
 * shared secret, or after `requireAdmin()`).
 */
export function createServiceClient() {
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
