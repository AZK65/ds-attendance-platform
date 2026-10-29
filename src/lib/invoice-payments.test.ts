import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildInvoicePdf } from '../app/api/invoice/generate/route'
import { listPriorPayments, printedRemainingBalance, type StoredInvoicePayment } from './invoice-payments'

const student = {
  externalStudentId: 42,
  studentPhone: '514-555-0199',
  studentName: 'Sample Student',
}

function row(overrides: Partial<StoredInvoicePayment> & Pick<StoredInvoicePayment, 'invoiceNumber' | 'invoiceDate' | 'total'>): StoredInvoicePayment {
  return {
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    ...student,
    createdAt: `${overrides.invoiceDate}T12:00:00.000Z`,
    ...overrides,
  }
}

const history = [
  row({ invoiceNumber: 'INV-0002', invoiceDate: '2026-06-15', total: 150, paymentMethod: 'card' }),
  row({ invoiceNumber: 'INV-0003', invoiceDate: '2026-08-01', total: 100, paymentMethod: null }),
  row({ invoiceNumber: 'INV-0001', invoiceDate: '2026-03-02', total: 250, paymentMethod: 'cash' }),
  row({ invoiceNumber: 'INV-0004', invoiceDate: '2026-09-01', total: 80, paymentStatus: 'unpaid', paymentMethod: 'online' }),
  row({ invoiceNumber: 'INV-0005', invoiceDate: '2026-04-01', total: 40, paymentStatus: 'refunded' }),
  row({ invoiceNumber: 'INV-0099', invoiceDate: '2026-03-02', total: 999, studentPhone: '514-555-0100', externalStudentId: 99 }),
  row({ invoiceNumber: 'INV-0006', invoiceDate: '2026-11-01', total: 60, paymentMethod: 'cash' }),
]

test('prior payments are paid invoices for this student, dated on or before this invoice', () => {
  const listed = listPriorPayments(history, {
    invoiceNumber: 'INV-2026-0142',
    invoiceDate: '2026-10-01',
    externalStudentId: 42,
    phone: '514-555-0199',
    name: 'Sample Student',
  })
  assert.deepEqual(listed.payments.map(payment => payment.invoiceNumber), ['INV-0001', 'INV-0002', 'INV-0003'])
  assert.deepEqual(listed.payments.map(payment => payment.date), ['2026-03-02', '2026-06-15', '2026-08-01'])
  assert.deepEqual(listed.payments.map(payment => payment.method), ['cash', 'card', null])
  assert.equal(listed.totalPaid, 500)
  assert.equal(listed.payments.some(payment => payment.invoiceNumber === 'INV-0006'), false)
})

test('the invoice being printed is not listed as its own previous payment', () => {
  const listed = listPriorPayments(history, {
    invoiceNumber: 'INV-0002',
    invoiceDate: '2026-06-15',
    externalStudentId: 42,
    phone: '514-555-0199',
    name: 'Sample Student',
  })
  assert.deepEqual(listed.payments.map(payment => payment.invoiceNumber), ['INV-0001'])
  assert.equal(listed.totalPaid, 250)
})

test('a stored remaining balance is printed as given, even when payments do not add up to it', () => {
  const listed = listPriorPayments(history, {
    invoiceNumber: 'INV-2026-0142',
    invoiceDate: '2026-10-01',
    externalStudentId: 42,
    phone: '514-555-0199',
    name: 'Sample Student',
  })
  const storedRemaining = 120
  assert.equal(printedRemainingBalance(storedRemaining), 120)
  assert.notEqual(listed.totalPaid, storedRemaining)
  assert.equal(printedRemainingBalance(0), null)
  assert.equal(printedRemainingBalance(undefined), null)
})

const invoiceBase = {
  schoolName: 'Qazi Driving School',
  schoolAddress: '786 Jean-Talon St W',
  schoolCity: 'Montreal',
  schoolProvince: 'QC',
  schoolPostalCode: 'H3N 1S2',
  gstNumber: '123456789 RT0001',
  qstNumber: '1234567890 TQ0001',
  studentName: 'Sample Student',
  studentAddress: '100 Example Street',
  studentCity: 'Montreal',
  studentProvince: 'QC',
  studentPostalCode: 'H2X 1Y4',
  studentPhone: '514-555-0199',
  studentEmail: 'sample.student@example.com',
  invoiceNumber: 'INV-2026-0142',
  invoiceDate: '2026-10-01',
  dueDate: '2026-10-15',
  lineItems: [
    { description: 'Class 5 driving course — Phase 2', quantity: 1, unitPrice: 150 },
  ],
  subtotal: 150,
  gstRate: 5,
  qstRate: 9.975,
  gstAmount: 7.5,
  qstAmount: 14.96,
  total: 172.46,
  taxesEnabled: true,
  notes: 'Sample invoice for layout preview. Not a real student.',
  remainingBalance: 120,
}

async function pdfText(name: string, body: Parameters<typeof buildInvoicePdf>[0]) {
  const pdf = await buildInvoicePdf(body)
  const dir = mkdtempSync(path.join(tmpdir(), 'invoice-payments-'))
  const file = path.join(dir, name)
  writeFileSync(file, pdf)
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
}

test('the invoice PDF lists dated payments and still prints the stored remaining balance', async () => {
  const listed = listPriorPayments(history, {
    invoiceNumber: 'INV-2026-0142',
    invoiceDate: '2026-10-01',
    externalStudentId: 42,
    phone: '514-555-0199',
    name: 'Sample Student',
  })
  const text = await pdfText('with-payments.pdf', { ...invoiceBase, paymentHistory: listed })
  assert.match(text, /Payment history/)
  assert.match(text, /2026-03-02/)
  assert.match(text, /Cash/)
  assert.match(text, /\$250\.00/)
  assert.match(text, /2026-06-15/)
  assert.match(text, /Card/)
  assert.match(text, /2026-08-01/)
  assert.match(text, /\$100\.00/)
  assert.match(text, /Total paid:/)
  assert.match(text, /\$500\.00/)
  assert.match(text, /Remaining Balance:/)
  assert.match(text, /Remaining balance:/)
  assert.match(text, /\$120\.00/)
  assert.doesNotMatch(text, /INV-0004/)
  assert.doesNotMatch(text, /\$999\.00/)
})

test('an invoice with no earlier payments says so and keeps the stored balance', async () => {
  const text = await pdfText('no-payments.pdf', {
    ...invoiceBase,
    paymentHistory: { payments: [], totalPaid: 0 },
  })
  assert.match(text, /No payments yet/)
  assert.match(text, /Remaining Balance:/)
  assert.match(text, /\$120\.00/)
  assert.doesNotMatch(text, /Total paid:/)
})
