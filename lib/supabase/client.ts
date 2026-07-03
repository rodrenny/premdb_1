'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Browser client. Asserted to `SupabaseClient<Database>` for the same reason
 * as in lib/supabase/server.ts: `@supabase/ssr@0.5.x` declares stale generics
 * against `supabase-js@2.10x` and collapses typed queries to `never`.
 */
export function createClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  ) as unknown as SupabaseClient<Database>
}
