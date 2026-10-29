import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickClass1Registration } from './class1-contract-lookup'
import {
  CLASS1_INSTALLMENT_STAGES,
  CLASS1_PAYMENT_OVERFLOW,
  buildContractInstallmentRows,
  contractPaymentDate,
  formatQuebecMoney,
  listContractPayments,
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

test('one payment fills row 01 only', () => {
  const rows = rowsFor([
    invoice({ invoiceNumber: 'INV-1', invoiceDate: '2026-02-02', total: 2262.5 }),
  ])
  assert.equal(rows.length, 4)
  assert.equal(rows[0].amount, '2\u00a0262,50\u00a0$')
  assert.equal(rows[0].datePaid, '2026-02-02')
  assert.equal(rows[0].dateScheduled, '')
  assert.equal(rows[0].stepFr, 'Au début de la formation')
  for (const row of rows.slice(1)) {
    assert.equal(row.amount, '')
    assert.equal(row.datePaid, '')
    assert.equal(row.dateScheduled, '')
  }
})

test('four payments stay on the four stage rows, oldest first', () => {
  const rows = rowsFor([
    invoice({ invoiceNumber: 'INV-4', invoiceDate: '2026-08-01', total: 400, createdAt: '2026-08-01T00:00:00.000Z' }),
    invoice({ invoiceNumber: 'INV-1', invoiceDate: '2026-02-01', total: 100, createdAt: '2026-02-01T00:00:00.000Z' }),
    invoice({ invoiceNumber: 'INV-3', invoiceDate: '2026-06-01', total: 300, createdAt: '2026-06-01T00:00:00.000Z' }),
    invoice({ invoiceNumber: 'INV-2', invoiceDate: '2026-04-01', total: 200, createdAt: '2026-04-01T00:00:00.000Z' }),
  ])
  assert.equal(rows.length, 4)
  assert.deepEqual(rows.map((row) => row.datePaid), ['2026-02-01', '2026-04-01', '2026-06-01', '2026-08-01'])
  assert.deepEqual(rows.map((row) => row.amount), [
    '100,00\u00a0$',
    '200,00\u00a0$',
    '300,00\u00a0$',
    '400,00\u00a0$',
  ])
  assert.deepEqual(rows.map((row) => row.stepFr), CLASS1_INSTALLMENT_STAGES.map((stage) => stage.fr))
  assert.ok(rows.every((row) => row.dateScheduled === ''))
})

test('six payments add rows 05 and 06 instead of dropping any', () => {
  assert.equal(CLASS1_PAYMENT_OVERFLOW, 'extra-rows')
  const amounts = [100, 200, 300, 400, 500, 600]
  const rows = rowsFor(amounts.map((total, index) => invoice({
    invoiceNumber: `INV-${index + 1}`,
    invoiceDate: `2026-0${index + 1}-15`,
    total,
    createdAt: `2026-0${index + 1}-15T00:00:00.000Z`,
  })))
  assert.equal(rows.length, 6)
  assert.deepEqual(rows.map((row) => row.number), ['01', '02', '03', '04', '05', '06'])
  assert.deepEqual(rows.map((row) => row.datePaid), [
    '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15',
  ])
  assert.equal(rows[4].stepFr, 'Autre versement')
  assert.equal(rows[5].stepFr, 'Autre versement')
  assert.equal(rows[4].stepEn, 'Additional payment')
  assert.equal(rows[3].stepFr, 'Après 50 % du volet pratique')
  assert.equal(rows[5].amount, '600,00\u00a0$')
  assert.ok(rows.every((row) => row.dateScheduled === ''))
})

test('refunded and unpaid invoices are excluded, and the rest stay in paid-date order', () => {
  const rows = rowsFor([
    invoice({ invoiceNumber: 'PAID-LATE', invoiceDate: '2026-05-20', total: 1250, createdAt: '2026-05-20T00:00:00.000Z' }),
    invoice({ invoiceNumber: 'REFUND-OLD', invoiceDate: '2026-01-02', total: 9999, paymentStatus: 'refunded' }),
    invoice({ invoiceNumber: 'UNPAID', invoiceDate: '2026-01-03', total: 50, paymentStatus: 'unpaid' }),
    invoice({
      invoiceNumber: 'OTHER',
      invoiceDate: '2026-01-04',
      total: 80,
      externalStudentId: 99,
      studentPhone: '438-555-0100',
      studentName: 'Amélie Bouchard',
    }),
    invoice({ invoiceNumber: 'PAID-EARLY', invoiceDate: '2026-02-02', total: 500, createdAt: '2026-02-02T00:00:00.000Z' }),
    invoice({ invoiceNumber: 'CREDIT', invoiceDate: '2026-01-05', total: -500, paymentStatus: 'refunded' }),
  ])
  assert.deepEqual(rows.map((row) => row.datePaid), ['2026-02-02', '2026-05-20', '', ''])
  assert.equal(rows[0].amount, '500,00\u00a0$')
  assert.equal(rows[1].amount, '1\u00a0250,00\u00a0$')
  assert.equal(rows[2].amount, '')
  assert.equal(rows[3].amount, '')
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

test('autres-versements rolls payments after the fourth into one line', () => {
  const payments = listContractPayments([
    invoice({ invoiceNumber: '1', invoiceDate: '2026-01-01', total: 10 }),
    invoice({ invoiceNumber: '2', invoiceDate: '2026-02-01', total: 20 }),
    invoice({ invoiceNumber: '3', invoiceDate: '2026-03-01', total: 30 }),
    invoice({ invoiceNumber: '4', invoiceDate: '2026-04-01', total: 40 }),
    invoice({ invoiceNumber: '5', invoiceDate: '2026-05-01', total: 50 }),
    invoice({ invoiceNumber: '6', invoiceDate: '2026-06-01', total: 60 }),
  ], STUDENT)
  const rows = buildContractInstallmentRows(payments, 'autres-versements')
  assert.equal(rows.length, 5)
  assert.equal(rows[4].number, '05')
  assert.equal(rows[4].stepFr, 'Autres versements')
  assert.equal(rows[4].amount, '110,00\u00a0$')
  assert.equal(rows[4].datePaid, '2026-05-01 – 2026-06-01')
  assert.equal(rows[4].dateScheduled, '')
  assert.equal(rows[3].datePaid, '2026-04-01')
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
