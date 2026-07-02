'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface SyncResult {
  pagesFetched: number
  candidates: number
  upserted: number
  skipped: number
  errors: { tmdbId: number; message: string }[]
}

export function SyncPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/tmdb-sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
      } else {
        setResult(data.result as SyncResult)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div>
        <h3 className="font-semibold">TMDb upcoming sync</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Fetches up to 3 pages of <code>/movie/upcoming</code> and upserts
          details, credits, and trailer for each. Admin-status movies and
          manually-set lock times are preserved.
        </p>
      </div>

      <Button onClick={run} disabled={running}>
        {running ? 'Syncing…' : 'Run TMDb sync'}
      </Button>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
          <div className="grid grid-cols-2 gap-y-1 sm:grid-cols-4">
            <dt className="text-muted-foreground">Pages</dt>
            <dd>{result.pagesFetched}</dd>
            <dt className="text-muted-foreground">Candidates</dt>
            <dd>{result.candidates}</dd>
            <dt className="text-muted-foreground">Upserted</dt>
            <dd>{result.upserted}</dd>
            <dt className="text-muted-foreground">Skipped</dt>
            <dd>{result.skipped}</dd>
          </div>
          {result.errors.length > 0 ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {result.errors.length} error(s)
              </summary>
              <ul className="mt-2 space-y-1 font-mono">
                {result.errors.map((e) => (
                  <li key={e.tmdbId}>
                    {e.tmdbId}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
