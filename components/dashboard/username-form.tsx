'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateUsernameAction } from '@/lib/auth/actions'

export function UsernameForm({
  initialUsername,
}: {
  initialUsername: string | null
}) {
  const [username, setUsername] = useState(initialUsername ?? '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (formData: FormData) => {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await updateUsernameAction(formData)
      if (res.ok) {
        setSuccess('Username saved.')
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <form action={submit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="pick-something-unique"
        />
        <p className="text-xs text-muted-foreground">
          3–20 characters. Letters, numbers, and underscores only.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-settle/40 bg-settle/10 px-3 py-2 text-sm text-settle">
          {success}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save username'}
      </Button>
    </form>
  )
}
