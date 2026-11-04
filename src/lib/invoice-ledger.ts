/** Pure integer-cent accounting. No legacy balance is silently reinterpreted. */
export interface LedgerInvoice {
  id: string
  total: number
  paymentStatus?: string | null
  chargeCents?: number
}

export function cents(value: number): number {
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100))) {
    throw new Error('Amount must be a finite monetary value')
  }
  return Math.round(value * 100)
}

export function ledgerSummary(openingChargesCents: number, invoices: readonly LedgerInvoice[]) {
  const charges = openingChargesCents + invoices.reduce((sum, row) => sum + (row.chargeCents ?? 0), 0)
  // Refunded originals no longer count as receipts. Their negative credit-note
  // rows are not a second cash refund. chargeCents cancels only new-service charges.
  const paid = invoices.reduce((sum, row) => sum + (row.paymentStatus === 'paid' ? cents(row.total) : 0), 0)
  const balance = charges - paid
  return {
    totalCharges: charges / 100,
    totalPaid: paid / 100,
    openBalance: Math.max(0, balance) / 100,
    creditBalance: Math.max(0, -balance) / 100,
    netBalance: balance / 100,
    unpaidInvoiceTotal: invoices.reduce((sum, row) => sum + (row.paymentStatus === 'unpaid' ? cents(row.total) : 0), 0) / 100,
  }
}

export type BillingMode = 'installment' | 'new-charge' | 'new-course'

export function chargeForInvoice(mode: BillingMode, total: number, courseTotal?: number | null): number {
  if (total <= 0) throw new Error('Invoice amount must be greater than zero')
  cents(total)
  if (mode === 'installment') return 0
  if (mode === 'new-charge') return cents(total)
  if (mode !== 'new-course' || courseTotal == null || courseTotal <= 0) {
    throw new Error('A new course requires its total price')
  }
  return cents(courseTotal)
}
