import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth/admin'
import { syncUpcomingMovies } from '@/lib/tmdb/sync'

export const dynamic = 'force-dynamic'

export async function POST() {
  const admin = await isAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await syncUpcomingMovies()
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
