'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  deletePredictionAction,
  submitPredictionAction,
} from '@/lib/predictions/actions'

interface Props {
  movieId: string
  existingValue?: number | null
}

const clamp = (v: number) => Math.min(10, Math.max(1, v))

export function PredictionForm({ movieId, existingValue }: Props) {
  const [value, setValue] = useState<string>(
    existingValue != null ? existingValue.toFixed(1) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const parsed = Number.parseFloat(value)
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 10

  const step = (delta: number) => {
    const base = Number.isFinite(parsed) ? parsed : 7.0
    setValue(clamp(Math.round((base + delta) * 10) / 10).toFixed(1))
  }

  const submit = (formData: FormData) => {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await submitPredictionAction(formData)
      if (res.ok) {
        setSuccess(existingValue != null ? 'Prediction updated.' : 'Prediction saved.')
      } else {
        setError(res.error ?? 'Something went wrong.')
      }
    })
  }

  const remove = () => {
    setError(null)
    setSuccess(null)
    const fd = new FormData()
    fd.set('movieId', movieId)
    startTransition(async () => {
      const res = await deletePredictionAction(fd)
      if (res.ok) {
        setValue('')
        setSuccess('Prediction removed.')
      } else {
        setError(res.error ?? 'Could not remove prediction.')
      }
    })
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="movieId" value={movieId} />
      <div className="space-y-3">
        <Label
          htmlFor={`prediction-${movieId}`}
          className="block text-center text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          Your prediction
        </Label>
        {/* The marquee: entering a number should feel like putting it up in lights. */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Decrease by 0.1"
            onClick={() => step(-0.1)}
            disabled={pending}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-xl text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          >
            −
          </button>
          <input
            id={`prediction-${movieId}`}
            name="value"
            type="number"
            min={1}
            max={10}
            step={0.1}
            inputMode="decimal"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="7.0"
            className="num text-glow h-20 w-36 rounded-md border border-transparent bg-transparent text-center text-6xl font-semibold text-primary placeholder:text-primary/25 focus-visible:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Increase by 0.1"
            onClick={() => step(0.1)}
            disabled={pending}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-xl text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          >
            +
          </button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          1.0 to 10.0, one decimal place.
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

      <div className="flex flex-col items-stretch gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? 'Saving…'
            : valid
              ? existingValue != null
                ? `Update to ${parsed.toFixed(1)}`
                : `Lock in ${parsed.toFixed(1)}`
              : 'Lock in your rating'}
        </Button>
        {existingValue != null ? (
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={pending}
          >
            Remove prediction
          </Button>
        ) : null}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        Points scored = 100 − 20 × |prediction − actual|, with a +10 bonus for
        an exact match. You can change or remove your prediction until it
        locks.
      </p>
    </form>
  )
}
