import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/admin'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/lib/auth/actions'

export async function SiteHeader() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const admin = user ? await isAdmin() : false

  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold tracking-tight">
            PreMDB
          </Link>
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <Link href="/movies" className="transition hover:text-foreground">
              Movies
            </Link>
            <Link
              href="/leaderboard"
              className="transition hover:text-foreground"
            >
              Leaderboard
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="transition hover:text-foreground"
              >
                Dashboard
              </Link>
            ) : null}
            {admin ? (
              <Link href="/admin" className="transition hover:text-foreground">
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
