export const SETTLEMENT_RULE_TEXT =
  'This movie settles at the first daily IMDb snapshot taken on or after 28 days post-release.'

/** The settlement rule, styled as the fine print on a ticket stub. */
export function SettlementRuleBox() {
  return (
    <aside className="rounded-lg border border-dashed border-border bg-card/60 p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Settlement rule
      </p>
      <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
        {SETTLEMENT_RULE_TEXT}
      </p>
    </aside>
  )
}
