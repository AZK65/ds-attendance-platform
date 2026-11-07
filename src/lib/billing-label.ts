export function billingBalanceLabel(summary: { openBalance?: number; creditBalance?: number; needsReview?: boolean }) {
  if ((summary.creditBalance ?? 0) > 0) return `$${summary.creditBalance!.toFixed(2)} credit`
  if (summary.needsReview) return `$${(summary.openBalance ?? 0).toFixed(2)}`
  if ((summary.openBalance ?? 0) > 0) return `$${summary.openBalance!.toFixed(2)}`
  return 'No balance due'
}
