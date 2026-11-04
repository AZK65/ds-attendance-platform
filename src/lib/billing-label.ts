export function billingBalanceLabel(summary: { openBalance?: number; creditBalance?: number; needsReview?: boolean }) {
  if (summary.needsReview) return 'Needs review'
  if ((summary.creditBalance ?? 0) > 0) return `$${summary.creditBalance!.toFixed(2)} credit`
  if ((summary.openBalance ?? 0) > 0) return `$${summary.openBalance!.toFixed(2)}`
  return 'No balance due'
}
