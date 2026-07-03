import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/**
 * Refreshes the Supabase auth session on every request and forwards the
 * updated cookies to the response. Follows the official `@supabase/ssr`
 * pattern for Next.js App Router.
 *
 * The client is asserted to `SupabaseClient<Database>` for the same reason
 * as in lib/supabase/server.ts: `@supabase/ssr@0.5.x` declares stale
 * generics against `supabase-js@2.10x` and collapses typed queries to
 * `never` otherwise.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  ) as unknown as SupabaseClient<Database>

  // IMPORTANT: Do not run any code between createServerClient and
  // getUser(). Doing so risks desynchronising the auth cookies and
  // silently logging users out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isProtected =
    pathname.startsWith('/dashboard') || pathname.startsWith('/admin')

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return response
}
