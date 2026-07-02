import { requireAdmin } from '@/lib/auth/admin'
import { createClient } from '@/lib/supabase/server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MovieEditRow } from '@/components/admin/movie-edit-row'
import { MovieSearch } from '@/components/admin/movie-search'
import { SyncPanel } from '@/components/admin/sync-panel'
import { SettlementForm } from '@/components/admin/settlement-form'
import type { Movie } from '@/types'

export const metadata = { title: 'Admin — PreMDB' }

const MOVIES_PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>
}

export default async function AdminPage({ searchParams }: PageProps) {
  await requireAdmin()

  const { tab = 'movies', q = '', page = '1' } = await searchParams
  const supabase = await createClient()

  // ---- Movies tab ----
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1)
  const from = (pageNum - 1) * MOVIES_PAGE_SIZE
  const to = from + MOVIES_PAGE_SIZE - 1

  let moviesQuery = supabase
    .from('movies')
    .select('*', { count: 'exact' })
    .order('release_date', { ascending: true, nullsFirst: false })
    .range(from, to)

  if (q.trim()) {
    moviesQuery = moviesQuery.ilike('title', `%${q.trim()}%`)
  }

  const { data: movies, count: moviesCount } = await moviesQuery

  // ---- Settlements tab ----
  const { data: candidateMovies } = await supabase
    .from('movies')
    .select('*')
    .in('status', ['awaiting_review', 'released_waiting_window', 'settled'])
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(50)

  const candidateIds = (candidateMovies ?? []).map((m) => m.id)
  const { data: existingSettlements } = candidateIds.length
    ? await supabase
        .from('settlements')
        .select('movie_id')
        .in('movie_id', candidateIds)
    : { data: [] as { movie_id: string }[] }

  const settledIds = new Set((existingSettlements ?? []).map((s) => s.movie_id))

  return (
    <main className="container space-y-6 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manual operations only. Cron handles date-driven lifecycle transitions.
        </p>
      </header>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="movies">Movies</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
        </TabsList>

        <TabsContent value="movies" className="space-y-4">
          <MovieSearch initial={q} />
          <p className="text-xs text-muted-foreground">
            {moviesCount ?? 0} movie(s){q ? ` matching "${q}"` : ''}
          </p>
          <ul className="space-y-3">
            {(movies ?? []).map((m: Movie) => (
              <MovieEditRow key={m.id} movie={m} />
            ))}
            {(!movies || movies.length === 0) && (
              <li className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                No movies found.
              </li>
            )}
          </ul>
          <Pagination
            q={q}
            tab="movies"
            page={pageNum}
            totalPages={Math.max(1, Math.ceil((moviesCount ?? 0) / MOVIES_PAGE_SIZE))}
          />
        </TabsContent>

        <TabsContent value="sync">
          <SyncPanel />
        </TabsContent>

        <TabsContent value="settlements" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Movies waiting for review, inside the 28-day window, or already
            settled. Enter IMDb numbers manually after verifying them on IMDb.
          </p>
          <ul className="space-y-3">
            {(candidateMovies ?? []).map((m: Movie) => (
              <li key={m.id}>
                <SettlementForm movie={m} alreadySettled={settledIds.has(m.id)} />
              </li>
            ))}
            {(!candidateMovies || candidateMovies.length === 0) && (
              <li className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                No candidate movies.
              </li>
            )}
          </ul>
        </TabsContent>
      </Tabs>
    </main>
  )
}

function Pagination({
  q,
  tab,
  page,
  totalPages,
}: {
  q: string
  tab: string
  page: number
  totalPages: number
}) {
  if (totalPages <= 1) return null
  const href = (p: number) => {
    const params = new URLSearchParams({ tab })
    if (q) params.set('q', q)
    params.set('page', String(p))
    return `/admin?${params.toString()}`
  }
  return (
    <nav className="flex items-center gap-2 text-sm">
      <a
        className={
          page <= 1
            ? 'pointer-events-none opacity-40'
            : 'rounded-md border border-border/60 px-3 py-1 hover:bg-muted'
        }
        href={href(page - 1)}
      >
        Previous
      </a>
      <span className="text-muted-foreground">
        Page {page} / {totalPages}
      </span>
      <a
        className={
          page >= totalPages
            ? 'pointer-events-none opacity-40'
            : 'rounded-md border border-border/60 px-3 py-1 hover:bg-muted'
        }
        href={href(page + 1)}
      >
        Next
      </a>
    </nav>
  )
}
