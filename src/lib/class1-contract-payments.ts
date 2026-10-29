// Paid rows on the Class 1 service contract (section 2.4).
//
// A payment in this app is an Invoice with paymentStatus "paid". There is no
// payments table and no paid-at column. Date payée is an explicit paid date
// when the caller has one, otherwise the invoice date (YYYY-MM-DD). Refunded
// invoices are not payments. Rows are not matched to the stage labels.
//
// More than four payments: CLASS1_PAYMENT_OVERFLOW. The default adds rows
// 05, 06, … so nothing is dropped or merged. Switch that constant to
// 'autres-versements' to roll payments 5+ into one line instead.

import { invoiceBelongsToStudent, roundMoney, type StudentIdentity } from '@/lib/invoice-match'

export type Class1PaymentOverflow = 'extra-rows' | 'autres-versements'

/** Change this one constant if Ars wants a single "Autres versements" line. */
export const CLASS1_PAYMENT_OVERFLOW: Class1PaymentOverflow = 'extra-rows'

export const CLASS1_INSTALLMENT_STAGES = [
  { en: 'At the start of training', fr: 'Au début de la formation' },
  { en: 'After 50% of theoretical component', fr: 'Après 50 % du volet théorique' },
  { en: 'Before start of practical component', fr: 'Avant le début du volet pratique' },
  { en: 'After 50% of practical component', fr: 'Après 50 % du volet pratique' },
] as const

const EXTRA_PAYMENT_STEP = { en: 'Additional payment', fr: 'Autre versement' }
const OTHER_PAYMENTS_STEP = { en: 'Other payments', fr: 'Autres versements' }

export interface ContractInvoiceInput {
  invoiceNumber: string
  invoiceDate?: string | null
  /**
   * Optional. Invoice rows do not store this. When it is missing, the
   * invoice date is the paid date.
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
  /** Quebec French money, e.g. "1 250,00 $", or '' when the row has no payment. */
  amount: string
  /** Always blank. Date prévue is not filled from invoices. */
  dateScheduled: ''
  /** YYYY-MM-DD, or '' when the row has no payment. */
  datePaid: string
}

function calendarDay(value: string | Date | null | undefined): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
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
 * after the amount. Uses a non-breaking space (fr-CA), e.g. "1 250,00 $".
 */
export function formatQuebecMoney(amount: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(amount))
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
      amount: roundMoney(invoice.total),
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

function emptyRow(index: number): ContractInstallmentRow {
  const stage = CLASS1_INSTALLMENT_STAGES[index]
  return {
    number: String(index + 1).padStart(2, '0'),
    stepEn: stage?.en ?? EXTRA_PAYMENT_STEP.en,
    stepFr: stage?.fr ?? EXTRA_PAYMENT_STEP.fr,
    amount: '',
    dateScheduled: '',
    datePaid: '',
  }
}

function filledRow(index: number, payment: ListedContractPayment, step = stepFor(index)): ContractInstallmentRow {
  return {
    number: String(index + 1).padStart(2, '0'),
    stepEn: step.en,
    stepFr: step.fr,
    amount: formatQuebecMoney(payment.amount),
    dateScheduled: '',
    datePaid: payment.date,
  }
}

function stepFor(index: number): { en: string; fr: string } {
  return CLASS1_INSTALLMENT_STAGES[index] ?? EXTRA_PAYMENT_STEP
}

/**
 * Map paid invoices onto the printed schedule. The first four payments use
 * the four stage labels in order. They are not checked against those stages.
 * Date prévue is always blank. Rows with no payment stay blank.
 */
export function buildContractInstallmentRows(
  payments: readonly ListedContractPayment[],
  overflow: Class1PaymentOverflow = CLASS1_PAYMENT_OVERFLOW,
): ContractInstallmentRow[] {
  if (overflow === 'autres-versements') {
    const rows: ContractInstallmentRow[] = []
    for (let index = 0; index < 4; index += 1) {
      const payment = payments[index]
      rows.push(payment ? filledRow(index, payment) : emptyRow(index))
    }
    if (payments.length > 4) {
      const extra = payments.slice(4)
      const dates = extra.map((payment) => payment.date).filter((date) => date.length > 0).sort()
      const datePaid = dates.length <= 1 ? (dates[0] || '') : `${dates[0]} – ${dates[dates.length - 1]}`
      rows.push({
        number: '05',
        stepEn: OTHER_PAYMENTS_STEP.en,
        stepFr: OTHER_PAYMENTS_STEP.fr,
        amount: formatQuebecMoney(extra.reduce((sum, payment) => sum + payment.amount, 0)),
        dateScheduled: '',
        datePaid,
      })
    }
    return rows
  }

  const count = Math.max(CLASS1_INSTALLMENT_STAGES.length, payments.length)
  const rows: ContractInstallmentRow[] = []
  for (let index = 0; index < count; index += 1) {
    const payment = payments[index]
    rows.push(payment ? filledRow(index, payment) : emptyRow(index))
  }
  return rows
}
