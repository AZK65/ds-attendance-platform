import { contractPaymentDate } from '@/lib/class1-contract-payments'
import { invoiceBelongsToStudent, roundMoney, type StudentIdentity } from '@/lib/invoice-match'
import { givenPhoneKeys, phoneLast10 } from '@/lib/student-match'

/**
 * A collected payment in this app is an Invoice row with paymentStatus "paid".
 * There is no payment table. Date is invoiceDate, amount is total, and method
 * is paymentMethod when staff stored one (cash, card, online).
 *
 * Rows belong to the student on this document the same way the balance API
 * matches them: MySQL student id when both sides have one, otherwise phone
 * last-10, otherwise exact name only when neither side has a phone.
 */
export interface StoredInvoicePayment {
  billingAccountId?: string | null
  invoiceNumber: string
  invoiceDate: string
  /** Receipt timestamp. Older paid invoices fall back to invoiceDate. */
  paidAt?: string | Date | null
  total: number
  /** Balance stored on that invoice after the payment. Null when none was recorded. */
  remainingBalance?: number | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  externalStudentId?: number | null
  studentPhone?: string | null
  studentName?: string | null
  createdAt?: Date | string | number | null
}

export interface ListedPayment {
  /** YYYY-MM-DD receipt date, or the invoice date when no receipt date was stored. */
  date: string
  amount: number
  /** Null when the invoice has no paymentMethod stored. */
  method: string | null
  /** Legacy snapshots are not a verified running balance; currently always null. */
  balanceAfter: number | null
  invoiceNumber: string
}

export interface PaymentHistory {
  payments: ListedPayment[]
  totalPaid: number
  throughDate?: string
}

function createdAtMs(value: Date | string | number | null | undefined): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * Confirmed payments through this receipt's date, including this receipt.
 * Refunded and unpaid rows are left out. Matching is invoiceBelongsToStudent:
 * MySQL student id when both sides have one, otherwise phone last-10,
 * otherwise the exact name only when neither side has a phone.
 * The returned total is only the sum of the listed amounts. The current account
 * balance is calculated separately and labelled as current on regenerated PDFs.
 */
export function listPriorPayments(
  invoices: readonly StoredInvoicePayment[],
  current: StudentIdentity & { billingAccountId?: string | null; invoiceNumber: string; invoiceDate?: string | null; paidAt?: Date | string | null },
): PaymentHistory {
  const student: StudentIdentity = {
    externalStudentId: current.externalStudentId,
    phone: current.phone,
    name: current.name,
  }
  const throughDate = contractPaymentDate(current)
  const cutoffTimestamp = current.paidAt ? createdAtMs(current.paidAt) : null
  const phones = givenPhoneKeys(current.phone, current.phoneAlt)
  const phoneIds = new Set(invoices.filter(row => phones.includes(phoneLast10(row.studentPhone)))
    .map(row => row.externalStudentId).filter((id): id is number => id != null && id > 0))
  if (current.externalStudentId) phoneIds.add(current.externalStudentId)
  const payments = invoices
    .filter((invoice) => invoice.paymentStatus === 'paid')
    .filter((invoice) => {
      if (current.billingAccountId && invoice.billingAccountId === current.billingAccountId) return true
      // Do not cross into another linked account just because a phone matches.
      if (current.billingAccountId && invoice.billingAccountId) return false
      if (!invoiceBelongsToStudent(invoice, student)) return false
      // Phone-only historical receipts cannot resolve a shared student identity.
      if ((!invoice.externalStudentId || !current.externalStudentId) && phones.length && phoneIds.size > 1) return false
      return true
    })
    .filter((invoice) => !throughDate || contractPaymentDate(invoice) <= throughDate)
    .filter((invoice) => !cutoffTimestamp || !invoice.paidAt || createdAtMs(invoice.paidAt) <= cutoffTimestamp)
    .sort((a, b) => {
      const byDate = contractPaymentDate(a).localeCompare(contractPaymentDate(b))
      if (byDate !== 0) return byDate
      const byCreated = createdAtMs(a.createdAt) - createdAtMs(b.createdAt)
      if (byCreated !== 0) return byCreated
      return a.invoiceNumber.localeCompare(b.invoiceNumber)
    })
    .map((invoice) => ({
      date: contractPaymentDate(invoice),
      amount: roundMoney(invoice.total),
      method: invoice.paymentMethod?.trim() ? invoice.paymentMethod.trim() : null,
      // A historical snapshot may have deducted unpaid invoices. Do not present
      // it as a verified running balance. Show the account summary separately.
      balanceAfter: null as number | null,
      invoiceNumber: invoice.invoiceNumber,
    }))

  return {
    payments,
    totalPaid: roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0)),
    throughDate: throughDate || undefined,
  }
}

/**
 * Accept finite account balances, including zero and explicit credits.
 */
export function printedRemainingBalance(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  return value
}
