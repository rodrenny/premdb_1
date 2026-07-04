import type { LeaderboardEntry } from '@/types'

export function LeaderboardTable({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[]
  /** Highlights the viewer's own row when provided. */
  currentUserId?: string | null
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
        No scores in this range yet — settled predictions land here.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-16 px-4 py-3 text-left">Rank</th>
            <th className="px-4 py-3 text-left">Player</th>
            <th className="px-4 py-3 text-right">Settled</th>
            <th className="px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {entries.map((e) => {
            const isViewer = currentUserId != null && e.user_id === currentUserId
            const topThree = e.rank <= 3
            return (
              <tr
                key={e.user_id}
                className={isViewer ? 'bg-primary/10' : undefined}
              >
                <td
                  className={`num px-4 py-3 ${
                    topThree
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground'
                  }`}
                >
                  {e.rank}
                </td>
                <td className="px-4 py-3">
                  {e.username ? (
                    <span className="font-medium">@{e.username}</span>
                  ) : (
                    <span className="text-muted-foreground">Anonymous</span>
                  )}
                  {isViewer ? (
                    <span className="ml-2 text-xs text-primary">You</span>
                  ) : null}
                </td>
                <td className="num px-4 py-3 text-right text-muted-foreground">
                  {e.settled_count}
                </td>
                <td
                  className={`num px-4 py-3 text-right font-semibold ${
                    topThree ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {e.total_points}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
