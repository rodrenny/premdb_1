import { Badge } from '@/components/ui/badge'
import type { MovieDisplayState } from '@/types'

const LABELS: Record<
  MovieDisplayState,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'muted' | 'destructive' }
> = {
  open: { label: 'Open', variant: 'success' },
  locked: { label: 'Locked for predictions', variant: 'muted' },
  released_waiting_window: { label: 'Awaiting day 28', variant: 'warning' },
  awaiting_review: { label: 'Awaiting review', variant: 'warning' },
  settled: { label: 'Settled', variant: 'default' },
  canceled: { label: 'Canceled', variant: 'destructive' },
}

export function MovieStatusBadge({ state }: { state: MovieDisplayState }) {
  const { label, variant } = LABELS[state]
  return <Badge variant={variant}>{label}</Badge>
}
