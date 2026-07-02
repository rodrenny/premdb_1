import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * A user is admin if either:
 *  - their `profiles.role` is `'admin'`, or
 *  - their email is in the `ADMIN_EMAILS` env var.
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return profile?.role === 'admin'
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
