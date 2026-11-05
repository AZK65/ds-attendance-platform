import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { invoiceBelongsToStudent, openBalanceFromInvoices, type StudentIdentity } from '@/lib/invoice-match'
import { phoneLast10 } from '@/lib/student-match'
import { cents, chargeForInvoice, ledgerSummary, type BillingMode } from '@/lib/invoice-ledger'
import { reconciliationPreview, applyReviewedBalance } from './invoice-reconciliation'

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
      hasCourseAgreement: account.openingChargesCents > 0 || account.invoices.some(row => row.billingMode === 'new-course') }
  }
  // Preserve unapproved historical balances. Do not migrate on a GET request.
  const paid = own.filter(row => row.paymentStatus === 'paid').reduce((sum, row) => sum + cents(row.total), 0) / 100
  const preview = reconciliationPreview(all).find(row => own.length && own.every(invoice => row.invoiceIds.includes(invoice.id)))
  const identityBlocked = !preview || preview.identityKey.startsWith('unresolved:') || preview.issues.includes('Phone belongs to more than one student ID')
  return {
    totalCharges: null, totalPaid: paid, openBalance: openBalanceFromInvoices(own),
    creditBalance: 0, netBalance: openBalanceFromInvoices(own),
    unpaidInvoiceTotal: own.filter(row => row.paymentStatus === 'unpaid').reduce((sum, row) => sum + cents(row.total), 0) / 100,
    needsReview: own.length > 0, hasAccount: !!account,
    hasCourseAgreement: !!account && (account.openingChargesCents > 0 || account.invoices.some(row => row.billingMode === 'new-course')),
    knownActivityBalance: account ? ledgerSummary(account.openingChargesCents, account.invoices).netBalance : 0,
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
  if ((own.some(row => !row.billingAccountId) && input.mode === 'installment') || ids.length > 1) {
    throw new BillingReviewRequired('This student’s historical balance needs review before another invoice can be saved. No balance was changed.')
  }
  const key = billingIdentityKey(identity)
  let account = ids.length === 1
    ? await tx.billingAccount.findUnique({ where: { id: ids[0]! } })
    : await tx.billingAccount.findUnique({ where: { identityKey: key } })
  if (!account && input.mode === 'installment') {
    throw new BillingReviewRequired('Record the course total before taking an installment.')
  }
  if (!account) account = await tx.billingAccount.create({ data: { identityKey: key, reviewNote: own.length ? 'New charges only; unresolved historical invoices remain separate until their agreed total is confirmed.' : 'New account; no historical invoices.' } })
  return { billingAccountId: account.id, chargeCents: chargeForInvoice(input.mode, input.total, input.courseTotal), billingMode: input.mode }
}
