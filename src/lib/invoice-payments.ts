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
  total: number
  paymentMethod?: string | null
  paymentStatus?: string | null
  externalStudentId?: number | null
  studentPhone?: string | null
  studentName?: string | null
  createdAt?: Date | string | number | null
}

export interface ListedPayment {
  date: string
  amount: number
  /** Null when the invoice has no paymentMethod stored. */
  method: string | null
  invoiceNumber: string
}

export interface PaymentHistory {
  payments: ListedPayment[]
  totalPaid: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function createdAtMs(value: Date | string | number | null | undefined): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** Earlier than this document, or the same calendar day. A later date is not a previous payment. */
function isPreviousPayment(candidateDate: string, currentDate: string): boolean {
  if (!ISO_DATE.test(currentDate) || !ISO_DATE.test(candidateDate)) return true
  return candidateDate <= currentDate
}

/**
 * Paid invoices for this student, excluding the invoice being printed.
 * Unpaid and refunded rows are not payments. The returned total is only the
 * sum of the listed rows. It is not a remaining balance.
 */
export function listPriorPayments(
  invoices: readonly StoredInvoicePayment[],
  current: StudentIdentity & { invoiceNumber: string; invoiceDate?: string | null },
): PaymentHistory {
  const student: StudentIdentity = {
    externalStudentId: current.externalStudentId,
    phone: current.phone,
    name: current.name,
  }
  const currentDate = current.invoiceDate || ''
  const payments = invoices
    .filter((invoice) => invoice.invoiceNumber !== current.invoiceNumber)
    .filter((invoice) => invoice.paymentStatus === 'paid')
    .filter((invoice) => invoiceBelongsToStudent(invoice, student))
    .filter((invoice) => isPreviousPayment(invoice.invoiceDate || '', currentDate))
    .sort((a, b) => {
      const byDate = (a.invoiceDate || '').localeCompare(b.invoiceDate || '')
      if (byDate !== 0) return byDate
      const byCreated = createdAtMs(a.createdAt) - createdAtMs(b.createdAt)
      if (byCreated !== 0) return byCreated
      return a.invoiceNumber.localeCompare(b.invoiceNumber)
    })
    .map((invoice) => ({
      date: invoice.invoiceDate || '',
      amount: roundMoney(invoice.total),
      method: invoice.paymentMethod?.trim() ? invoice.paymentMethod.trim() : null,
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
