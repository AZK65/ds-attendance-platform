import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { invoiceBelongsToStudent, type StudentIdentity } from '@/lib/invoice-match'
import { phoneLast10 } from '@/lib/student-match'
import { cents, chargeForInvoice, ledgerSummary, type BillingMode } from '@/lib/invoice-ledger'
import { reconciliationPreview, applyReviewedBalance } from './invoice-reconciliation'
import { legacyInvoiceBalance } from './legacy-invoice-balance'

export class BillingReviewRequired extends Error {}

export function billingIdentityKey(identity: StudentIdentity): string {
  if (identity.externalStudentId) return `student:${identity.externalStudentId}`
  const phone = phoneLast10(identity.phone)
  if (phone) return `phone:${phone}`
  throw new BillingReviewRequired('Select a student with an ID or phone before creating an invoice.')
}

export async function studentBillingSummary(identity: StudentIdentity) {
  const all = await prisma.invoice.findMany()
  const own = all.filter(row => invoiceBelongsToStudent(row, identity))
  const accountIds = [...new Set(own.map(row => row.billingAccountId).filter((id): id is string => !!id))]
  let account = accountIds.length === 1
    ? await prisma.billingAccount.findUnique({ where: { id: accountIds[0] }, include: { invoices: true } })
    : null
  if (!own.length) {
    try { account = await prisma.billingAccount.findUnique({ where: { identityKey: billingIdentityKey(identity) }, include: { invoices: true } }) } catch { /* identity may be incomplete */ }
  }
  if (account && own.every(row => row.billingAccountId === account.id)) {
    return { ...ledgerSummary(account.openingChargesCents, account.invoices), needsReview: false, hasAccount: true,
      balanceSource: 'ledger' as const, balanceNote: null, savedBalance: null,
      hasCourseAgreement: account.openingChargesCents > 0 || account.invoices.some(row => row.billingMode === 'new-course') }
  }
  // Preserve unapproved historical balances. Do not migrate on a GET request.
  const paid = own.filter(row => row.paymentStatus === 'paid').reduce((sum, row) => sum + cents(row.total), 0) / 100
  const preview = reconciliationPreview(all).find(row => own.length && own.every(invoice => row.invoiceIds.includes(invoice.id)))
  const identityBlocked = !preview || preview.identityKey.startsWith('unresolved:') || preview.issues.includes('Phone belongs to more than one student ID')
  const legacy = legacyInvoiceBalance(own.filter(row => !row.billingAccountId))
  const knownActivity = account ? ledgerSummary(account.openingChargesCents, account.invoices) : null
  const netBalance = Math.round((legacy.netBalance + (knownActivity?.netBalance ?? 0)) * 100) / 100
  return {
    totalCharges: null, totalPaid: paid, ...legacy, openBalance: Math.max(0, netBalance),
    creditBalance: Math.max(0, -netBalance), netBalance,
    unpaidInvoiceTotal: own.filter(row => row.paymentStatus === 'unpaid').reduce((sum, row) => sum + cents(row.total), 0) / 100,
    needsReview: own.length > 0, hasAccount: !!account,
    hasCourseAgreement: !!account && (account.openingChargesCents > 0 || account.invoices.some(row => row.billingMode === 'new-course')),
    knownActivityBalance: knownActivity?.netBalance ?? 0,
    historyFingerprint: preview?.fingerprint ?? null,
    canConfirmHistory: !identityBlocked && accountIds.length <= 1 && !account?.reviewedFingerprint,
  }
}

/** Run inside the same transaction that saves the invoice. Never infer old debt. */
export async function prepareInvoiceBilling(
  tx: Prisma.TransactionClient,
  identity: StudentIdentity,
  input: { mode: BillingMode; total: number; courseTotal?: number | null;
    history?: { chargesCents: number; fingerprint: string; confirmed: boolean; staffSessionId: string; staffName: string } },
) {
  const all = await tx.invoice.findMany()
  let own = all.filter(row => invoiceBelongsToStudent(row, identity))
  if (own.some(row => !row.billingAccountId) && input.history) {
    const preview = reconciliationPreview(all).find(row => own.every(invoice => row.invoiceIds.includes(invoice.id)))
    if (!preview) throw new BillingReviewRequired('Student identity needs checking before applying payments.')
    try { await applyReviewedBalance(tx, { identityKey: preview.identityKey, invoiceIds: preview.invoiceIds,
      fingerprint: input.history.fingerprint, openingChargesCents: input.history.chargesCents,
      approved: input.history.confirmed, reviewedBy: input.history.staffName, reviewedBySessionId: input.history.staffSessionId,
      reviewNote: 'Full agreed charges confirmed by staff in the invoice flow before recording an installment.' })
    } catch (error) { throw new BillingReviewRequired(error instanceof Error ? error.message : 'Reload the invoice and confirm the latest total.') }
    own = (await tx.invoice.findMany()).filter(row => invoiceBelongsToStudent(row, identity))
  }
  const ids = [...new Set(own.map(row => row.billingAccountId).filter(Boolean))]
  if (ids.length > 1) {
    throw new BillingReviewRequired('This student has conflicting account links. Check their identity before saving.')
  }
  const key = billingIdentityKey(identity)
  // A receipt can be recorded without inventing an opening course price.
  // Leave installments against unresolved history unlinked, so they cannot
  // appear as credits against an unrelated new-service account. A later
  // explicit reconciliation includes these receipts along with the old ones.
  if (input.mode === 'installment' && own.some(row => !row.billingAccountId)) {
    return { billingAccountId: null, chargeCents: chargeForInvoice(input.mode, input.total), billingMode: input.mode }
  }
  let account = ids.length === 1
    ? await tx.billingAccount.findUnique({ where: { id: ids[0]! } })
    : await tx.billingAccount.findUnique({ where: { identityKey: key } })
  if (!account && input.mode === 'installment') {
    return { billingAccountId: null, chargeCents: chargeForInvoice(input.mode, input.total), billingMode: input.mode }
  }
  if (!account) account = await tx.billingAccount.create({ data: { identityKey: key, reviewNote: own.length ? 'New charges only; unresolved historical invoices remain separate until their agreed total is confirmed.' : 'New account; no historical invoices.' } })
  return { billingAccountId: account.id, chargeCents: chargeForInvoice(input.mode, input.total, input.courseTotal), billingMode: input.mode }
}
