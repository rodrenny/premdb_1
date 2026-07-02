'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  deletePredictionAction,
  submitPredictionAction,
} from '@/lib/predictions/actions'

interface Props {
  movieId: string
  existingValue?: number | null
}

export function PredictionForm({ movieId, existingValue }: Props) {
  const [value, setValue] = useState<string>(
    existingValue != null ? existingValue.toFixed(1) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
      <div className="space-y-2">
        <Label htmlFor={`prediction-${movieId}`}>Your prediction</Label>
        <div className="flex items-center gap-2">
          <Input
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
            placeholder="e.g. 7.3"
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">/ 10</span>
        </div>
        <p className="text-xs text-muted-foreground">
          One decimal place. Points scored = 100 − 20 × |prediction − actual|,
          with a +10 bonus for an exact match.
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
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {success}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? 'Saving…'
            : existingValue != null
              ? 'Update prediction'
              : 'Submit prediction'}
        </Button>
        {existingValue != null ? (
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={pending}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  )
}
