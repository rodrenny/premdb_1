import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * A user is admin if either:
 *  - their email is in the `ADMIN_EMAILS` env var (email-only admins whose
 *    `profiles.role` stays `'user'`), or
 *  - they are a DB-role admin, i.e. present in `public.admin_users`.
 *
 * DB-role admin status moved from `profiles.role` to `admin_users` in
 * migration 012 (profiles.role is deprecated for authorization). `admin_users`
 * is service-role-only, so the check uses the service client. Both admin
 * notions continue to work through the app.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  if (user.email && adminEmails().includes(user.email.toLowerCase())) {
    return true
  }

  const svc = createServiceClient()
  const { data: adminRow } = await svc
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return !!adminRow
}

/**
 * Redirects to `/login` if not signed in, or to `/` if signed in but not
 * admin. Use at the top of admin server components and server actions.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/admin')

  const allowed = await isAdmin()
  if (!allowed) redirect('/')

  return user
}
