import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * A user is admin iff they are present in `public.admin_users` — the single
 * source of truth (migration 012). `admin_users` is service-role-only, so the
 * lookup uses the service client.
 *
 * Promote a user by inserting their id into `admin_users` (see the README);
 * there is no self-serve path by design.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

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
