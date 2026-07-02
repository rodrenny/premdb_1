'use client'

import { useState, useTransition } from 'react'
import type { Movie } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getMovieDisplayState } from '@/lib/movies/display'
import { MovieStatusBadge } from '@/components/movies/movie-status-badge'
import {
  markMovieCanceledAction,
  updateMovieAdminAction,
} from '@/lib/admin/actions'

const STATUSES = [
  'upcoming',
  'released_waiting_window',
  'awaiting_review',
  'settled',
  'canceled',
] as const

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export function MovieEditRow({ movie }: { movie: Movie }) {
  const state = getMovieDisplayState(movie)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const runAction = (
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) => {
    return (formData: FormData) => {
      setMessage(null)
      startTransition(async () => {
        const res = await action(formData)
        if (res.ok) {
          setMessage({ kind: 'ok', text: res.message ?? 'Saved.' })
        } else {
          setMessage({ kind: 'err', text: res.error ?? 'Failed.' })
        }
      })
    }
  }

  return (
    <li className="rounded-lg border border-border/60 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{movie.title}</p>
          <p className="text-xs text-muted-foreground">
            tmdb_id {movie.tmdb_id} · release {movie.release_date ?? '—'}
          </p>
        </div>
        <MovieStatusBadge state={state} />
      </div>

      <form action={runAction(updateMovieAdminAction)} className="grid gap-3 md:grid-cols-4">
        <input type="hidden" name="movieId" value={movie.id} />
        <div className="space-y-1">
          <Label htmlFor={`imdb-${movie.id}`} className="text-xs">
            IMDb id
          </Label>
          <Input
            id={`imdb-${movie.id}`}
            name="imdbId"
            defaultValue={movie.imdb_id ?? ''}
            placeholder="tt1234567"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`date-${movie.id}`} className="text-xs">
            Release date
          </Label>
          <Input
            id={`date-${movie.id}`}
            name="releaseDate"
            type="date"
            defaultValue={movie.release_date ?? ''}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lock-${movie.id}`} className="text-xs">
            Prediction locks at (UTC)
          </Label>
          <Input
            id={`lock-${movie.id}`}
            name="predictionLocksAt"
            type="datetime-local"
            defaultValue={toDateTimeLocal(movie.prediction_locks_at)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`status-${movie.id}`} className="text-xs">
            Status
          </Label>
          <select
            id={`status-${movie.id}`}
            name="status"
            defaultValue={movie.status}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-4 flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save overrides'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              const fd = new FormData()
              fd.set('movieId', movie.id)
              runAction(markMovieCanceledAction)(fd)
            }}
          >
            Mark canceled
          </Button>
          {message ? (
            <span
              className={
                message.kind === 'ok'
                  ? 'ml-2 text-xs text-emerald-400'
                  : 'ml-2 text-xs text-destructive-foreground'
              }
            >
              {message.text}
            </span>
          ) : null}
        </div>
      </form>
    </li>
  )
}
