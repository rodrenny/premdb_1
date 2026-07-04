'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  emailOptOutSchema,
  emailSchema,
  usernameSchema,
} from '@/lib/validations'

export async function signInWithMagicLinkAction(formData: FormData) {
  const parsed = emailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    redirect(
      `/login?error=${encodeURIComponent('Enter a valid email address.')}`,
    )
  }

  const supabase = await createClient()
  const hdr = await headers()
  const origin =
    hdr.get('origin') ??
    (hdr.get('host')
      ? `${hdr.get('x-forwarded-proto') ?? 'https'}://${hdr.get('host')}`
      : 'http://localhost:3000')

  const next = (formData.get('next') as string | null) ?? '/dashboard'
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: redirectTo },
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/verify-request?email=${encodeURIComponent(parsed.data.email)}`)
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function updateUsernameAction(formData: FormData) {
  const parsed = usernameSchema.safeParse({ username: formData.get('username') })
  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        parsed.error.issues[0]?.message ?? 'Invalid username.',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false as const, error: 'Not signed in.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ username: parsed.data.username, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    // Unique violation on username
    if (error.code === '23505') {
      return { ok: false as const, error: 'That username is already taken.' }
    }
    return { ok: false as const, error: error.message }
  }

  return { ok: true as const }
}

export async function updateEmailOptOutAction(formData: FormData) {
  const raw = formData.get('emailOptOut')
  const parsed = emailOptOutSchema.safeParse({
    emailOptOut: raw === 'true' ? true : raw === 'false' ? false : raw,
  })
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid value.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false as const, error: 'Not signed in.' }
  }

  // Writes through the user's own session: the row policy limits it to their
  // row and migration 015's column grant to (username, updated_at,
  // email_opt_out).
  const { error } = await supabase
    .from('profiles')
    .update({
      email_opt_out: parsed.data.emailOptOut,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return { ok: false as const, error: error.message }
  }

  return { ok: true as const }
}
