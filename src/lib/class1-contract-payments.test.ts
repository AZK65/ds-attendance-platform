import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickClass1Registration } from './class1-contract-lookup'
import {
  CLASS1_INSTALLMENT_AMOUNT,
  CLASS1_INSTALLMENT_COUNT,
  CLASS1_INSTALLMENT_STAGES,
  buildContractInstallmentRows,
  contractPaymentDate,
  formatQuebecMoney,
  listContractPayments,
  moneyToCents,
  type ContractInvoiceInput,
} from './class1-contract-payments'

const STUDENT = { externalStudentId: 42, phone: '(514) 555-0199', name: 'Amélie Bouchard' }

function invoice(partial: Partial<ContractInvoiceInput> & Pick<ContractInvoiceInput, 'invoiceNumber'>): ContractInvoiceInput {
  return {
    invoiceDate: '2026-01-01',
    total: 100,
    paymentStatus: 'paid',
    externalStudentId: 42,
    studentPhone: '514-555-0199',
    studentName: 'Someone Else',
    createdAt: '2026-01-01T12:00:00.000Z',
    ...partial,
  }
}

function rowsFor(invoices: ContractInvoiceInput[]) {
  return buildContractInstallmentRows(listContractPayments(invoices, STUDENT))
}

test('Quebec money uses a grouped amount, a comma, and a trailing dollar sign', () => {
  assert.equal(formatQuebecMoney(1250), '1\u00a0250,00\u00a0$')
  assert.equal(formatQuebecMoney(2262.5), '2\u00a0262,50\u00a0$')
  assert.equal(formatQuebecMoney(0), '0,00\u00a0$')
})

const FILLED = formatQuebecMoney(CLASS1_INSTALLMENT_AMOUNT)

function filledDates(rows: ReturnType<typeof rowsFor>): string[] {
  return rows.map((row) => row.datePaid)
}

test('installment size and count are the named contract constants', () => {
  assert.equal(CLASS1_INSTALLMENT_AMOUNT, 2500)
  assert.equal(CLASS1_INSTALLMENT_COUNT, 4)
  assert.equal(moneyToCents(2499.99), 249999)
  assert.equal(moneyToCents(2500), 250000)
})

test('zero payments leave four blank rows and a blank scheduled date', () => {
  const rows = rowsFor([])
  assert.equal(rows.length, 4)
  assert.deepEqual(rows.map((row) => row.number), ['01', '02', '03', '04'])
  assert.deepEqual(rows.map((row) => row.stepFr), CLASS1_INSTALLMENT_STAGES.map((stage) => stage.fr))
  for (const row of rows) {
    assert.equal(row.amount, '')
    assert.equal(row.dateScheduled, '')
    assert.equal(row.datePaid, '')
  }
})

test('Vikrant: 500 then 2000 reaches the first 2500, and the next 2500 reaches the second', () => {
  const rows = rowsFor([
    invoice({ invoiceNumber: 'C', invoiceDate: '2026-09-01', total: 2500, createdAt: '2026-09-01T00:00:00.000Z' }),
    invoice({ invoiceNumber: 'A', invoiceDate: '2026-08-03', total: 500, createdAt: '2026-08-03T00:00:00.000Z' }),
    invoice({ invoiceNumber: 'B', invoiceDate: '2026-08-06', total: 2000, createdAt: '2026-08-06T00:00:00.000Z' }),
  ])
  assert.equal(rows.length, 4)
  assert.equal(rows[0].amount, FILLED)
  assert.equal(rows[0].datePaid, '2026-08-06')
  assert.equal(rows[1].amount, FILLED)
  assert.equal(rows[1].datePaid, '2026-09-01')
  assert.equal(rows[2].amount, '')
  assert.equal(rows[2].datePaid, '')
  assert.equal(rows[3].amount, '')
  assert.equal(rows[3].datePaid, '')
  assert.ok(rows.every((row) => row.dateScheduled === ''))
})

test('one 10000 payment fills all four rows on that date', () => {
  const rows = rowsFor([
    invoice({ invoiceNumber: 'FULL', invoiceDate: '2026-04-15', total: 10000 }),
  ])
  assert.deepEqual(rows.map((row) => row.amount), [FILLED, FILLED, FILLED, FILLED])
  assert.deepEqual(filledDates(rows), ['2026-04-15', '2026-04-15', '2026-04-15', '2026-04-15'])
})

test('12000 paid still prints only the four contract rows', () => {
  const rows = rowsFor([
    invoice({ invoiceNumber: 'OVER', invoiceDate: '2026-05-01', total: 12000 }),
  ])
  assert.equal(rows.length, 4)
  assert.deepEqual(rows.map((row) => row.amount), [FILLED, FILLED, FILLED, FILLED])
  assert.ok(rows.every((row) => row.datePaid === '2026-05-01'))
  assert.ok(rows.every((row) => row.number !== '05'))
})

test('2400 paid leaves every row blank', () => {
  const rows = rowsFor([
    invoice({ invoiceNumber: 'PART', invoiceDate: '2026-06-01', total: 2400 }),
  ])
  assert.ok(rows.every((row) => row.amount === '' && row.datePaid === ''))
})

test('2499.99 does not reach an installment and 2500 does, compared in cents', () => {
  const short = rowsFor([
    invoice({ invoiceNumber: 'SHORT', invoiceDate: '2026-07-01', total: 2499.99 }),
  ])
  assert.ok(short.every((row) => row.amount === '' && row.datePaid === ''))

  const exact = rowsFor([
    invoice({ invoiceNumber: 'EXACT', invoiceDate: '2026-07-02', total: 2500 }),
  ])
  assert.equal(exact[0].amount, FILLED)
  assert.equal(exact[0].datePaid, '2026-07-02')
  assert.ok(exact.slice(1).every((row) => row.amount === ''))

  const split = rowsFor([
    invoice({ invoiceNumber: 'A', invoiceDate: '2026-07-01', total: 2499.99, createdAt: '2026-07-01T00:00:00.000Z' }),
    invoice({ invoiceNumber: 'B', invoiceDate: '2026-07-03', total: 0.01, createdAt: '2026-07-03T00:00:00.000Z' }),
  ])
  assert.equal(split[0].datePaid, '2026-07-03')
  assert.equal(split[0].amount, FILLED)
  assert.equal(split[1].amount, '')
})

test('refunded invoices are excluded from the running total', () => {
  const rows = rowsFor([
    invoice({ invoiceNumber: 'REFUND', invoiceDate: '2026-01-02', total: 10000, paymentStatus: 'refunded' }),
    invoice({ invoiceNumber: 'UNPAID', invoiceDate: '2026-01-03', total: 2500, paymentStatus: 'unpaid' }),
    invoice({
      invoiceNumber: 'OTHER',
      invoiceDate: '2026-01-04',
      total: 2500,
      externalStudentId: 99,
      studentPhone: '438-555-0100',
      studentName: 'Amélie Bouchard',
    }),
    invoice({ invoiceNumber: 'PAID', invoiceDate: '2026-08-06', total: 2500, createdAt: '2026-08-06T00:00:00.000Z' }),
  ])
  assert.equal(rows[0].amount, FILLED)
  assert.equal(rows[0].datePaid, '2026-08-06')
  assert.ok(rows.slice(1).every((row) => row.amount === '' && row.datePaid === ''))
})

test('same paid date orders by created time, then invoice number', () => {
  const payments = listContractPayments([
    invoice({ invoiceNumber: 'INV-B', invoiceDate: '2026-03-01', createdAt: '2026-03-02T00:00:00.000Z', total: 2 }),
    invoice({ invoiceNumber: 'INV-A', invoiceDate: '2026-03-01', createdAt: '2026-03-01T00:00:00.000Z', total: 1 }),
    invoice({ invoiceNumber: 'INV-C', invoiceDate: '2026-03-01', createdAt: '2026-03-01T00:00:00.000Z', total: 3 }),
  ], STUDENT)
  assert.deepEqual(payments.map((payment) => payment.invoiceNumber), ['INV-A', 'INV-C', 'INV-B'])
})

test('an explicit paid date is used ahead of the invoice date', () => {
  assert.equal(contractPaymentDate({ invoiceDate: '2026-01-01', paidAt: '2026-04-09' }), '2026-04-09')
  assert.equal(contractPaymentDate({ invoiceDate: '2026-01-01' }), '2026-01-01')
  const payments = listContractPayments([
    invoice({ invoiceNumber: 'A', invoiceDate: '2026-01-01', paidAt: '2026-05-01', total: 1 }),
    invoice({ invoiceNumber: 'B', invoiceDate: '2026-03-01', total: 2 }),
    invoice({ invoiceNumber: 'C', invoiceDate: '2026-06-01', paidAt: new Date('2026-04-01T15:00:00.000Z'), total: 3 }),
  ], STUDENT)
  assert.deepEqual(payments.map((payment) => payment.date), ['2026-03-01', '2026-04-01', '2026-05-01'])
})

test('MySQL id wins, then phone last-10, then exact name', () => {
  const byId = listContractPayments([
    invoice({
      invoiceNumber: 'ID',
      externalStudentId: 42,
      studentPhone: '438-555-0000',
      studentName: 'Not Amelie',
      total: 10,
    }),
  ], STUDENT)
  assert.equal(byId.length, 1)

  const byPhone = listContractPayments([
    invoice({
      invoiceNumber: 'PHONE',
      externalStudentId: null,
      studentPhone: '+1 514 555 0199',
      studentName: 'Different Person',
      total: 11,
    }),
  ], { phone: '5145550199', name: 'Amélie Bouchard' })
  assert.equal(byPhone.length, 1)

  const wrongPhone = listContractPayments([
    invoice({
      invoiceNumber: 'NAME-ONLY',
      externalStudentId: null,
      studentPhone: '438-555-2222',
      studentName: 'Amélie Bouchard',
      total: 12,
    }),
  ], { phone: '5145550199', name: 'Amélie Bouchard' })
  assert.equal(wrongPhone.length, 0)

  const byName = listContractPayments([
    invoice({
      invoiceNumber: 'NAME',
      externalStudentId: null,
      studentPhone: null,
      studentName: 'Bouchard, Amelie',
      total: 13,
    }),
  ], { name: 'Amélie Bouchard' })
  assert.equal(byName.length, 1)
})

test('registration lookup prefers id, contract number, and MySQL id, and skips Class 5', () => {
  const rows = [
    { id: 'car-1', vehicleType: 'car', contractNumber: 'C5-1', externalId: 7, fullName: 'Car Student' },
    { id: 'truck-1', vehicleType: 'truck', contractNumber: 'C1-2026-0007', externalId: 7, fullName: 'Amélie Bouchard' },
    { id: 'truck-2', vehicleType: 'truck', contractNumber: 'C1-2026-0008', externalId: 8, fullName: 'Jean Tremblay' },
  ]
  assert.equal(pickClass1Registration(rows, 'truck-1').id, 'truck-1')
  assert.equal(pickClass1Registration(rows, 'C1-2026-0008').id, 'truck-2')
  assert.equal(pickClass1Registration(rows, '8').id, 'truck-2')
  assert.equal(pickClass1Registration(rows, 'bouchard, amelie').id, 'truck-1')
  assert.throws(() => pickClass1Registration(rows, 'car-1'), /not a Class 1/)
  assert.throws(() => pickClass1Registration(rows, 'Nobody'), /No Class 1 registration/)
})
