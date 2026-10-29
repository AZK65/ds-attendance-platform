// Section 2.4 of the Class 1 service contract.
//
// The contract is four installments of CLASS1_INSTALLMENT_AMOUNT, tax
// included (10 000 $ in total). A row is filled only once paid, non-refunded
// invoices, oldest first, reach that multiple. Anything past the contract
// total is left off. There are never rows after the fourth. Date prévue is
// always blank.
//
// A payment is an Invoice with paymentStatus "paid". There is no payments
// table. Date payée uses the receipt timestamp, falling back to invoice date
// for historical records. Amounts are compared in cents.

import { invoiceBelongsToStudent, type StudentIdentity } from '@/lib/invoice-match'

/** Tax-included amount of each printed installment. */
export const CLASS1_INSTALLMENT_AMOUNT = 2500

/** Printed rows. Payments beyond this many installments stay off the contract. */
export const CLASS1_INSTALLMENT_COUNT = 4

export const CLASS1_INSTALLMENT_CENTS = CLASS1_INSTALLMENT_AMOUNT * 100
export const CLASS1_CONTRACT_TOTAL_CENTS = CLASS1_INSTALLMENT_CENTS * CLASS1_INSTALLMENT_COUNT

export const CLASS1_INSTALLMENT_STAGES = [
  { en: 'At the start of training', fr: 'Au début de la formation' },
  { en: 'After 50% of theoretical component', fr: 'Après 50 % du volet théorique' },
  { en: 'Before start of practical component', fr: 'Avant le début du volet pratique' },
  { en: 'After 50% of practical component', fr: 'Après 50 % du volet pratique' },
] as const

export interface ContractInvoiceInput {
  invoiceNumber: string
  invoiceDate?: string | null
  /**
   * Receipt timestamp. Historical invoices fall back to their invoice date.
   */
  paidAt?: string | Date | null
  total: number
  paymentStatus?: string | null
  externalStudentId?: number | null
  studentPhone?: string | null
  studentName?: string | null
  createdAt?: Date | string | number | null
}

export interface ListedContractPayment {
  invoiceNumber: string
  /** YYYY-MM-DD, or '' when neither paid date nor invoice date is usable. */
  date: string
  amount: number
  createdAt?: Date | string | number | null
}

export interface ContractInstallmentRow {
  number: string
  stepEn: string
  stepFr: string
  /** "2 500,00 $" once this installment is reached, otherwise ''. */
  amount: string
  /** Always blank. Date prévue is not filled from invoices. */
  dateScheduled: ''
  /** YYYY-MM-DD of the payment that reached this installment, or ''. */
  datePaid: string
}

export function moneyToCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

function calendarDay(value: string | Date | null | undefined): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Paid date, or the invoice date when no paid date was stored. */
export function contractPaymentDate(invoice: {
  paidAt?: string | Date | null
  invoiceDate?: string | null
}): string {
  return calendarDay(invoice.paidAt) || calendarDay(invoice.invoiceDate)
}

function createdAtMs(value: Date | string | number | null | undefined): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * Quebec French currency: grouped thousands, comma decimals, dollar sign
 * after the amount. Uses a non-breaking space (fr-CA), e.g. "2 500,00 $".
 */
export function formatQuebecMoney(amount: number): string {
  const cents = moneyToCents(amount)
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * This student's paid invoices, oldest first. Refunded and unpaid rows are
 * left out. Matching is invoiceBelongsToStudent: MySQL student id when both
 * sides have one, otherwise phone last-10, otherwise the exact name only
 * when neither side has a phone.
 */
export function listContractPayments(
  invoices: readonly ContractInvoiceInput[],
  student: StudentIdentity,
): ListedContractPayment[] {
  return invoices
    .filter((invoice) => invoice.paymentStatus === 'paid')
    .filter((invoice) => invoiceBelongsToStudent(invoice, student))
    .map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      date: contractPaymentDate(invoice),
      amount: moneyToCents(invoice.total) / 100,
      createdAt: invoice.createdAt,
    }))
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      const byCreated = createdAtMs(a.createdAt) - createdAtMs(b.createdAt)
      if (byCreated !== 0) return byCreated
      return a.invoiceNumber.localeCompare(b.invoiceNumber)
    })
}

const INSTALLMENT_LABEL = formatQuebecMoney(CLASS1_INSTALLMENT_AMOUNT)

function emptyRow(index: number): ContractInstallmentRow {
  const stage = CLASS1_INSTALLMENT_STAGES[index]
  return {
    number: String(index + 1).padStart(2, '0'),
    stepEn: stage.en,
    stepFr: stage.fr,
    amount: '',
    dateScheduled: '',
    datePaid: '',
  }
}

function filledRow(index: number, datePaid: string): ContractInstallmentRow {
  const stage = CLASS1_INSTALLMENT_STAGES[index]
  return {
    number: String(index + 1).padStart(2, '0'),
    stepEn: stage.en,
    stepFr: stage.fr,
    amount: INSTALLMENT_LABEL,
    dateScheduled: '',
    datePaid,
  }
}

/**
 * Walk paid invoices oldest first. Row N (1-based) fills when the running
 * total reaches N × 2 500 $, using the date of the payment that crossed
 * that line. One payment can fill several rows. Money past 10 000 $ is ignored.
 */
export function buildContractInstallmentRows(
  payments: readonly ListedContractPayment[],
): ContractInstallmentRow[] {
  const rows = Array.from({ length: CLASS1_INSTALLMENT_COUNT }, (_, index) => emptyRow(index))
  let runningCents = 0
  let nextIndex = 0
  for (const payment of payments) {
    if (nextIndex >= CLASS1_INSTALLMENT_COUNT) break
    runningCents += moneyToCents(payment.amount)
    while (
      nextIndex < CLASS1_INSTALLMENT_COUNT
      && runningCents >= (nextIndex + 1) * CLASS1_INSTALLMENT_CENTS
    ) {
      rows[nextIndex] = filledRow(nextIndex, payment.date)
      nextIndex += 1
    }
  }
  return rows
}
