import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyInvoiceBalance } from './legacy-invoice-balance'

const old = { id: 'old', total: 250, paymentStatus: 'paid', remainingBalance: 750, createdAt: '2026-09-01' }
const installment = { id: 'new', total: 150, paymentStatus: 'paid', billingMode: 'installment', createdAt: '2026-11-07' }

test('saved balance applies explicit payments once, not drafts, and leaves input untouched', () => {
  const rows = [old, installment]
  const before = structuredClone(rows)
  assert.equal(legacyInvoiceBalance(rows).netBalance,600)
  assert.equal(legacyInvoiceBalance(rows).netBalance,600)
  assert.equal(legacyInvoiceBalance([old,{...installment,paymentStatus:'unpaid'}]).netBalance,750)
  assert.equal(legacyInvoiceBalance([old,{...installment,paymentStatus:'refunded'}]).netBalance,750)
  assert.deepEqual(rows,before)
})
test('untyped later receipts are visible evidence, not guessed deductions', () => {
  const s=legacyInvoiceBalance([old,{...installment,billingMode:null}])
  assert.equal(s.netBalance,750)
  assert.match(s.balanceNote,/not assumed/)
})
test('newer snapshots supersede earlier deductions and negative snapshots do not revive old debt', () => {
  assert.equal(legacyInvoiceBalance([old,installment,{...old,id:'latest',createdAt:'2026-11-08',remainingBalance:600}]).netBalance,600)
  assert.equal(legacyInvoiceBalance([old,{...old,id:'invalid',createdAt:'2026-11-08',remainingBalance:-10}]).netBalance,0)
})
test('unpaid zero snapshots do not erase an unpaid invoice; unknown course payments never become credits', () => {
  assert.equal(legacyInvoiceBalance([{...old,total:1000,paymentStatus:'unpaid',remainingBalance:0}]).netBalance,1000)
  assert.equal(legacyInvoiceBalance([installment]).netBalance,0)
  const over=legacyInvoiceBalance([old,{...installment,total:900}])
  assert.equal(over.netBalance,0)
  assert.match(over.balanceNote,/exceed/)
})
