import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getLeaderboard } from '@/lib/leaderboard/service'
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'
import type { LeaderboardRange } from '@/types'

export const metadata = { title: 'Leaderboard — PreMDB' }

const RANGES: { value: LeaderboardRange; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'all_time', label: 'All-time' },
]

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

function parseRange(raw: string | undefined): LeaderboardRange {
  if (raw === 'weekly' || raw === 'monthly' || raw === 'all_time') return raw
  return 'all_time'
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { range: rawRange } = await searchParams
  const range = parseRange(rawRange)
  const supabase = await createClient()
  const [result, userRes] = await Promise.all([
    getLeaderboard(range),
    supabase.auth.getUser(),
  ])
  // Session read only — powers the "your row" highlight in the table.
  const currentUserId = userRes.data.user?.id ?? null

  return (
    <main className="container space-y-6 py-10">
      <header>
        <h1 className="font-display text-4xl uppercase tracking-tight">
          Leaderboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global ranking by points earned on settled movies.
        </p>
      </header>

      <nav className="flex gap-2">
        {RANGES.map((r) => {
          const active = r.value === range
          return (
            <Link
              key={r.value}
              href={r.value === 'all_time' ? '/leaderboard' : `/leaderboard?range=${r.value}`}
              className={
                active
                  ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                  : 'rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground'
              }
            >
              {r.label}
            </Link>
          )
        })}
      </nav>

      {result.ok ? (
        <LeaderboardTable entries={result.entries} currentUserId={currentUserId} />
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
          <p className="font-medium">Couldn&apos;t load the leaderboard.</p>
          <p className="mt-1 text-muted-foreground">
            Something went wrong fetching the scores. Please try again.
          </p>
        </div>
      )}
    </main>
  )
}
