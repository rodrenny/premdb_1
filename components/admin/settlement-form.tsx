'use client'

import { useState, useTransition } from 'react'
import type { Movie } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  recomputeScoreEventsAction,
  settleMovieAction,
} from '@/lib/admin/actions'

interface Props {
  movie: Movie
  alreadySettled: boolean
}

export function SettlementForm({ movie, alreadySettled }: Props) {
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (formData: FormData) => {
    setMessage(null)
    startTransition(async () => {
      const res = await settleMovieAction(formData)
      setMessage(
        res.ok
          ? { kind: 'ok', text: res.message ?? 'Settled.' }
          : { kind: 'err', text: res.error ?? 'Failed.' },
      )
    })
  }

  const recompute = () => {
    setMessage(null)
    const fd = new FormData()
    fd.set('movieId', movie.id)
    startTransition(async () => {
      const res = await recomputeScoreEventsAction(fd)
      setMessage(
        res.ok
          ? { kind: 'ok', text: res.message ?? 'Recomputed.' }
          : { kind: 'err', text: res.error ?? 'Failed.' },
      )
    })
  }

  return (
    <form action={submit} className="space-y-3 rounded-lg border border-border/60 p-4">
      <input type="hidden" name="movieId" value={movie.id} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{movie.title}</p>
          <p className="text-xs text-muted-foreground">
            Release {movie.release_date ?? '—'} · status {movie.status}
          </p>
        </div>
        {alreadySettled ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
            Settled
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`rating-${movie.id}`} className="text-xs">
            Official rating
          </Label>
          <Input
            id={`rating-${movie.id}`}
            name="officialRating"
            type="number"
            min={1}
            max={10}
            step={0.1}
            required
            disabled={alreadySettled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`votes-${movie.id}`} className="text-xs">
            Official num votes
          </Label>
          <Input
            id={`votes-${movie.id}`}
            name="officialNumVotes"
            type="number"
            min={0}
            step={1}
            required
            disabled={alreadySettled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`snapshot-${movie.id}`} className="text-xs">
            Settlement snapshot date
          </Label>
          <Input
            id={`snapshot-${movie.id}`}
            name="settlementSnapshotDate"
            type="date"
            required
            disabled={alreadySettled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`used-${movie.id}`} className="text-xs">
            Release date used
          </Label>
          <Input
            id={`used-${movie.id}`}
            name="releaseDateUsed"
            type="date"
            required
            defaultValue={movie.release_date ?? ''}
            disabled={alreadySettled}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`notes-${movie.id}`} className="text-xs">
          Notes (optional)
        </Label>
        <Input
          id={`notes-${movie.id}`}
          name="settlementNotes"
          placeholder="e.g. snapshot taken from IMDb at 10:00 UTC"
          disabled={alreadySettled}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!alreadySettled ? (
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Settling…' : 'Finalize settlement'}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={recompute}
          >
            {pending ? 'Working…' : 'Recompute missing score events'}
          </Button>
        )}
        {message ? (
          <span
            className={
              message.kind === 'ok'
                ? 'text-xs text-emerald-400'
                : 'text-xs text-destructive-foreground'
            }
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  )
}
