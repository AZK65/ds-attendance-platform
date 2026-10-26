// Which invoices and exam attempts belong to one student.
//
// Order: MySQL student id, then phone last-10, then the exact full name.
// The name is used only when neither side has a usable phone. A shared word,
// a substring ("Deep Singh" inside "Sandeep Singh"), or a second person with
// the same name and a different phone must not match.
//
// Stored phones keep spaces and dashes, and SQLite has no normalized phone
// column, so callers load candidates and filter here. Do not use Prisma
// `contains` for this.

import { givenPhoneKeys, namesEqual, phoneLast10 } from '@/lib/student-match'

export interface StudentIdentity {
  externalStudentId?: number | null
  phone?: string | null
  phoneAlt?: string | null
  name?: string | null
}

export interface InvoiceIdentity {
  externalStudentId?: number | null
  studentPhone?: string | null
  studentName?: string | null
}

export interface BalanceInvoice extends InvoiceIdentity {
  id: string
  total: number
  paymentStatus?: string | null
  remainingBalance?: number | null
  createdAt?: Date | string | number | null
}

function externalId(value: number | null | undefined): number | null {
  if (value == null) return null
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

export function createdAtMs(value: Date | string | number | null | undefined): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * True when this invoice (or exam attempt, passed with the same fields)
 * is the same student.
 *
 * Both external ids present: they decide, and nothing else is consulted.
 * Otherwise a usable phone on the student matches only the same last 10
 * digits. Name equality is not a fallback while a phone is present on
 * either side.
 */
export function invoiceBelongsToStudent(invoice: InvoiceIdentity, student: StudentIdentity): boolean {
  const invoiceId = externalId(invoice.externalStudentId)
  const studentId = externalId(student.externalStudentId)
  if (invoiceId != null && studentId != null) return invoiceId === studentId

  const studentPhones = givenPhoneKeys(student.phone, student.phoneAlt)
  const invoicePhone = phoneLast10(invoice.studentPhone)
  if (studentPhones.length > 0 || invoicePhone) {
    if (studentPhones.length === 0 || !invoicePhone) return false
    return studentPhones.includes(invoicePhone)
  }

  return namesEqual(invoice.studentName, student.name)
}

export function filterInvoicesForStudent<T extends InvoiceIdentity>(
  invoices: readonly T[],
  student: StudentIdentity,
): T[] {
  return invoices.filter((invoice) => invoiceBelongsToStudent(invoice, student))
}

/** Newest invoice that belongs to this student. Edit balance writes only this row. */
export function selectInvoiceForBalanceEdit<T extends BalanceInvoice>(
  invoices: readonly T[],
  student: StudentIdentity,
): T | null {
  const own = filterInvoicesForStudent(invoices, student)
  if (own.length === 0) return null
  return own.reduce((newest, invoice) => (
    createdAtMs(invoice.createdAt) >= createdAtMs(newest.createdAt) ? invoice : newest
  ))
}

/**
 * The newest stored remainingBalance, including 0 and negatives.
 * Null means that invoice never recorded one, so an older stored value
 * still counts. A newer negative is not skipped for an older positive one.
 */
export function newestRemainingBalance(invoices: readonly BalanceInvoice[]): number | null {
  const ordered = [...invoices].sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
  const withBalance = ordered.find((invoice) => invoice.remainingBalance != null)
  return withBalance?.remainingBalance ?? null
}

/**
 * Owed amount for a student. A stored negative remainingBalance is shown
 * as $0. Those values were left behind by the old name-match bug and are
 * not a credit. Positive and zero stored values are kept. When every
 * remainingBalance is null, the balance is still total invoiced minus paid.
 * This does not write the stored number.
 */
export function openBalanceFromInvoices(invoices: readonly BalanceInvoice[]): number {
  const stored = newestRemainingBalance(invoices)
  if (stored != null) return roundMoney(Math.max(0, stored))
  const totalInvoiced = invoices.reduce((sum, invoice) => sum + invoice.total, 0)
  const totalPaid = invoices
    .filter((invoice) => invoice.paymentStatus === 'paid')
    .reduce((sum, invoice) => sum + invoice.total, 0)
  return roundMoney(totalInvoiced - totalPaid)
}

/**
 * After a delete, the only invoice that may be rewritten is the newest
 * remaining invoice for that same student. Returns null when there is
 * nothing of theirs left, or when that invoice has no stored balance.
 */
export function remainingBalanceUpdateAfterDelete<T extends BalanceInvoice>(
  deleted: T,
  remaining: readonly T[],
): { id: string; remainingBalance: number } | null {
  const student: StudentIdentity = {
    externalStudentId: deleted.externalStudentId,
    phone: deleted.studentPhone,
    name: deleted.studentName,
  }
  const own = filterInvoicesForStudent(remaining, student)
    .filter((invoice) => invoice.id !== deleted.id)
    .sort((a, b) => createdAtMs(a.createdAt) - createdAtMs(b.createdAt))
  const last = own[own.length - 1]
  if (!last || last.remainingBalance == null) return null
  return {
    id: last.id,
    remainingBalance: roundMoney(last.remainingBalance + deleted.total),
  }
}
