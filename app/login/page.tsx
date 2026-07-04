import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/auth/login-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata = { title: 'Sign in — PreMDB' }

interface LoginSearchParams {
  error?: string
  next?: string
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect(params.next && params.next.startsWith('/') ? params.next : '/dashboard')
  }

  return (
    <main className="relative isolate flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden px-6 py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.1),transparent_55%)]" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-2xl uppercase tracking-wide">
            Sign in
          </CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a magic link — no password
            needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm error={params.error} next={params.next} />
        </CardContent>
      </Card>
    </main>
  )
}
