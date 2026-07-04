'use client'

import { useState, useTransition } from 'react'
import { Label } from '@/components/ui/label'
import { updateEmailOptOutAction } from '@/lib/auth/actions'

/**
 * Settlement email toggle. The checkbox shows the opt-IN state (checked =
 * receive emails), stored inverted as profiles.email_opt_out.
 */
export function EmailPrefsForm({ initialOptOut }: { initialOptOut: boolean }) {
  const [optOut, setOptOut] = useState(initialOptOut)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const toggle = (checked: boolean) => {
    const previous = optOut
    const nextOptOut = !checked
    setOptOut(nextOptOut)
    setError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('emailOptOut', String(nextOptOut))
      const res = await updateEmailOptOutAction(formData)
      if (!res.ok) {
        setOptOut(previous)
        setError(res.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="settlement-emails"
          className="h-4 w-4 accent-primary"
          checked={!optOut}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
        />
        <Label htmlFor="settlement-emails">
          Email me when my predictions settle
        </Label>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
