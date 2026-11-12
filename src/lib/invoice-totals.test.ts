import assert from 'node:assert/strict'
import test from 'node:test'
import { computeInvoiceTotals } from './invoice-totals'

const GST_QST = { taxesEnabled: true, gstRate: 5, qstRate: 9.975 }

test('six tax-inclusive lines reproduce a $1000 invoice exactly', () => {
  const totals = computeInvoiceTotals([
    { quantity: 1, unitPrice: 250, taxInclusive: true },
    { quantity: 1, unitPrice: 150, taxInclusive: true },
    { quantity: 1, unitPrice: 150, taxInclusive: true },
    { quantity: 1, unitPrice: 150, taxInclusive: true },
    { quantity: 1, unitPrice: 150, taxInclusive: true },
    { quantity: 1, unitPrice: 150, taxInclusive: true },
  ], GST_QST)

  assert.equal(totals.subtotal, 869.75)
  assert.equal(totals.gstAmount, 43.49)
  assert.equal(totals.qstAmount, 86.76)
  assert.equal(totals.total, 1000)
  assert.equal(
    Math.round((totals.subtotal + totals.gstAmount + totals.qstAmount) * 100),
    Math.round(totals.total * 100),
  )
})

test('the same $1000 entered as one tax-inclusive line does not add tax on top', () => {
  const totals = computeInvoiceTotals([
    { quantity: 1, unitPrice: 1000, taxInclusive: true },
  ], GST_QST)

  assert.equal(totals.subtotal, 869.75)
  assert.equal(totals.gstAmount, 43.49)
  assert.equal(totals.qstAmount, 86.76)
  assert.equal(totals.total, 1000)
})

test('tax-exclusive prices still have GST and QST added on top', () => {
  const totals = computeInvoiceTotals([
    { quantity: 1, unitPrice: 1000, taxInclusive: false },
  ], GST_QST)

  assert.equal(totals.subtotal, 1000)
  assert.equal(totals.gstAmount, 50)
  assert.equal(totals.qstAmount, 99.75)
  assert.equal(totals.total, 1149.75)
})

test('a missing taxInclusive flag is treated as tax-exclusive', () => {
  const totals = computeInvoiceTotals([
    { quantity: 1, unitPrice: 100 },
  ], GST_QST)

  assert.equal(totals.subtotal, 100)
  assert.equal(totals.gstAmount, 5)
  assert.equal(totals.qstAmount, 9.98)
  assert.equal(totals.total, 114.98)
})

test('disabled taxes leave the entered amount unchanged', () => {
  const totals = computeInvoiceTotals([
    { quantity: 1, unitPrice: 250, taxInclusive: true },
    { quantity: 5, unitPrice: 150, taxInclusive: false },
  ], { taxesEnabled: false, gstRate: 5, qstRate: 9.975 })

  assert.equal(totals.subtotal, 1000)
  assert.equal(totals.gstAmount, 0)
  assert.equal(totals.qstAmount, 0)
  assert.equal(totals.total, 1000)
})
