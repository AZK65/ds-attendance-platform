import { createdAtMs, type BalanceInvoice } from './invoice-match'
import { cents } from './invoice-ledger'

/** Read-only carry-forward of stored history, never an approved contract price. */
export function legacyInvoiceBalance(rows: readonly (BalanceInvoice & { billingMode?: string | null })[]) {
  const ordered = [...rows].sort((a, b) => createdAtMs(a.createdAt) - createdAtMs(b.createdAt) || a.id.localeCompare(b.id))
  const snapshotIndex = ordered.findLastIndex(row => row.remainingBalance != null)
  const latest = ordered[snapshotIndex]
  const snapshot = latest && latest.remainingBalance! >= 0 && latest.paymentStatus !== 'refunded' ? latest : undefined
  // Only an explicit installment can reduce an older saved balance. Older
  // untyped invoices might be extra services; never guess their accounting role.
  const laterInstallments = snapshot ? ordered.slice(snapshotIndex + 1).filter(row => row.billingMode === 'installment') : []
  const paidAfter = laterInstallments.filter(row => row.paymentStatus === 'paid').reduce((sum, row) => sum + cents(row.total), 0)
  const saved = snapshot ? cents(snapshot.remainingBalance!) : null
  const unclearLater = snapshot && ordered.slice(snapshotIndex + 1).some(row => !row.billingMode)
  const unpaid = rows.filter(row => !row.billingMode && row.paymentStatus === 'unpaid').reduce((sum, row) => sum + cents(row.total), 0)
  return {
    // Unpaid recorded invoices must not disappear behind a saved zero balance.
    netBalance: snapshot ? Math.max(unpaid, saved! - paidAfter, 0) / 100 : unpaid / 100,
    savedBalance: saved == null ? null : saved / 100,
    savedBalanceInvoice: snapshot?.id ?? null,
    balanceSource: snapshot ? 'saved' as const : 'invoices' as const,
    balanceNote: snapshot
      ? `Based on the saved balance of $${(saved! / 100).toFixed(2)}, with later recorded course payments applied. Unpaid invoices remain due.${unclearLater ? ' Some later invoices have no payment type; their effect on the saved balance is not assumed.' : ''}${paidAfter > saved! ? ' Payments exceed the saved balance; any credit needs the course total confirmed.' : ''}`
      : 'Recorded invoice amounts only. No full course balance was saved.',
  }
}
