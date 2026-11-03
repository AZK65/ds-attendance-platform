import { contractPaymentDate } from '@/lib/class1-contract-payments'
import { invoiceBelongsToStudent, roundMoney, type StudentIdentity } from '@/lib/invoice-match'

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
  /** Null when that invoice never stored a remaining balance. */
  balanceAfter: number | null
  invoiceNumber: string
}

export interface PaymentHistory {
  payments: ListedPayment[]
  totalPaid: number
}

function createdAtMs(value: Date | string | number | null | undefined): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * Paid invoices for this student, excluding the invoice being printed.
 * Refunded and unpaid rows are left out. Matching is invoiceBelongsToStudent:
 * MySQL student id when both sides have one, otherwise phone last-10,
 * otherwise the exact name only when neither side has a phone.
 * The returned total is only the sum of the listed amounts. It does not
 * replace the remaining balance stored on the invoice being printed.
 */
export function listPriorPayments(
  invoices: readonly StoredInvoicePayment[],
  current: StudentIdentity & { invoiceNumber: string },
): PaymentHistory {
  const student: StudentIdentity = {
    externalStudentId: current.externalStudentId,
    phone: current.phone,
    name: current.name,
  }
  const payments = invoices
    .filter((invoice) => invoice.invoiceNumber !== current.invoiceNumber)
    .filter((invoice) => invoice.paymentStatus === 'paid')
    .filter((invoice) => invoiceBelongsToStudent(invoice, student))
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
      balanceAfter: typeof invoice.remainingBalance === 'number' && Number.isFinite(invoice.remainingBalance)
        ? roundMoney(invoice.remainingBalance)
        : null,
      invoiceNumber: invoice.invoiceNumber,
    }))

  return {
    payments,
    totalPaid: roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0)),
  }
}

/**
 * The remaining balance the invoice already prints: the stored or
 * caller-supplied figure, and only when it is greater than zero.
 * Payment rows are not allowed to replace it.
 */
export function printedRemainingBalance(value: number | undefined): number | null {
  if (value === undefined || !(value > 0)) return null
  return value
}
