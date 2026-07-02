import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata = { title: 'Check your email — PreMDB' }

export default async function VerifyRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <main className="container flex min-h-[calc(100vh-8rem)] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            {email ? (
              <>
                We sent a magic link to <span className="font-medium text-foreground">{email}</span>.
              </>
            ) : (
              <>We sent you a magic link.</>
            )}{' '}
            Click the link to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>You can close this tab once you click the link in your inbox.</p>
        </CardContent>
      </Card>
    </main>
  )
}
