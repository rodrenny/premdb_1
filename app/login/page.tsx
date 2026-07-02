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
    <main className="container flex min-h-[calc(100vh-8rem)] items-center justify-center py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a magic link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm error={params.error} next={params.next} />
        </CardContent>
      </Card>
    </main>
  )
}
