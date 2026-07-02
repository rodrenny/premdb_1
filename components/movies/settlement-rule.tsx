export const SETTLEMENT_RULE_TEXT =
  'This movie settles at the first daily IMDb snapshot taken on or after 28 days post-release.'

export function SettlementRuleBox() {
  return (
    <aside className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Settlement rule</p>
      <p className="mt-1">{SETTLEMENT_RULE_TEXT}</p>
    </aside>
  )
}
