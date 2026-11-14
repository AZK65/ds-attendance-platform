import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'

const databaseFile = path.join(mkdtempSync(path.join(tmpdir(), 'qazi-invoice-delete-')), 'test.db')
closeSync(openSync(databaseFile, 'wx'))
process.env.DATABASE_URL = `file:${databaseFile}`

let prisma: typeof import('./db').prisma
let remove: typeof import('../app/api/invoice/[id]/route').DELETE
let restore: typeof import('../app/api/invoice/[id]/restore/route').POST
let getInvoice: typeof import('../app/api/invoice/[id]/route').GET
let listInvoices: typeof import('../app/api/invoice/list/route').GET
let search: typeof import('../app/api/search/route').GET
let review: typeof import('../app/api/invoice/balance-review/route').GET
let updatePayment: typeof import('../app/api/invoice/update-payment/route').PUT
let billing: typeof import('./invoice-billing')
let findInvoicesForStudent: typeof import('./invoice-lookup').findInvoicesForStudent
let loadPaymentHistory: typeof import('../app/api/invoice/generate/route').loadPaymentHistory

const cookie = 'auth-token=valid; sid=delete-staff'

before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' })
  prisma = (await import('./db')).prisma
  remove = (await import('../app/api/invoice/[id]/route')).DELETE
  restore = (await import('../app/api/invoice/[id]/restore/route')).POST
  getInvoice = (await import('../app/api/invoice/[id]/route')).GET
  listInvoices = (await import('../app/api/invoice/list/route')).GET
  search = (await import('../app/api/search/route')).GET
  review = (await import('../app/api/invoice/balance-review/route')).GET
  updatePayment = (await import('../app/api/invoice/update-payment/route')).PUT
  billing = await import('./invoice-billing')
  findInvoicesForStudent = (await import('./invoice-lookup')).findInvoicesForStudent
  loadPaymentHistory = (await import('../app/api/invoice/generate/route')).loadPaymentHistory
  await prisma.adminSession.create({ data: { id: 'delete-staff', label: 'Front desk' } })
  await prisma.invoiceSettings.create({ data: { id: 'default', nextInvoiceNumber: 50 } })
})

after(async () => { await prisma?.$disconnect() })

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

function withoutDeleteFields<T extends { deletedAt: Date | null; deletedBy: string | null }>(row: T) {
  const { deletedAt, deletedBy, ...rest } = row
  return { deletedAt, deletedBy, rest }
}

test('soft delete hides an invoice from lists, payment history and totals, and restore puts it back', async () => {
  const account = await prisma.billingAccount.create({
    data: { identityKey: 'student:8801', openingChargesCents: 100000, reviewNote: 'Synthetic opening total' },
  })
  const kept = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-KEEP-8801', studentName: 'DelStudent 8801', externalStudentId: 8801,
      invoiceDate: '2026-11-01', lineItems: '[]', subtotal: 250, total: 250, paymentStatus: 'paid',
      billingAccountId: account.id, remainingBalance: 750, chargeCents: 0,
    },
  })
  const target = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-DEL-8801', studentName: 'DelStudent 8801', externalStudentId: 8801,
      invoiceDate: '2026-11-02', lineItems: '[{"description":"Course payment","quantity":1,"unitPrice":250}]',
      subtotal: 250, total: 250, paymentStatus: 'paid', paymentMethod: 'cash',
      billingAccountId: account.id, remainingBalance: 500, chargeCents: 0, notes: 'Do not rewrite',
    },
  })
  await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-OPEN-8801', studentName: 'DelStudent 8801', externalStudentId: 8801,
      invoiceDate: '2026-11-03', lineItems: '[]', subtotal: 80, total: 80, paymentStatus: 'unpaid',
      billingAccountId: account.id, chargeCents: 0,
    },
  })

  const before = await prisma.invoice.findUniqueOrThrow({ where: { id: target.id } })
  const keptBefore = await prisma.invoice.findUniqueOrThrow({ where: { id: kept.id } })
  assert.equal((await billing.studentBillingSummary({ externalStudentId: 8801 })).totalPaid, 500)
  assert.equal((await billing.studentBillingSummary({ externalStudentId: 8801 })).openBalance, 500)

  const deleted = await remove(
    new NextRequest(`http://localhost/api/invoice/${target.id}`, { method: 'DELETE', headers: { cookie } }),
    params(target.id),
  )
  assert.equal(deleted.status, 200)

  const after = await prisma.invoice.findUniqueOrThrow({ where: { id: target.id } })
  const beforeComparable = withoutDeleteFields(before)
  const afterComparable = withoutDeleteFields(after)
  assert.deepEqual(afterComparable.rest, beforeComparable.rest)
  assert.equal(beforeComparable.deletedAt, null)
  assert.ok(after.deletedAt)
  assert.equal(after.deletedBy, 'Front desk')
  assert.equal(after.invoiceNumber, 'INV-DEL-8801')
  assert.equal(after.total, 250)
  assert.equal(after.remainingBalance, 500)
  assert.equal(after.paymentStatus, 'paid')
  assert.equal(after.notes, 'Do not rewrite')
  assert.equal((await prisma.invoiceSettings.findUniqueOrThrow({ where: { id: 'default' } })).nextInvoiceNumber, 50)
  await assert.rejects(() => prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-DEL-8801', studentName: 'DelStudent 8801', invoiceDate: '2026-11-04',
      lineItems: '[]', subtotal: 1, total: 1,
    },
  }))
  const keptAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: kept.id } })
  assert.deepEqual(keptAfter, keptBefore)

  const activeList = await listInvoices(new NextRequest('http://localhost/api/invoice/list?search=DelStudent'))
  const activeBody = await activeList.json()
  assert.equal(activeBody.invoices.some((row: { invoiceNumber: string }) => row.invoiceNumber === 'INV-DEL-8801'), false)
  assert.equal(activeBody.invoices.some((row: { invoiceNumber: string }) => row.invoiceNumber === 'INV-KEEP-8801'), true)

  const deletedList = await listInvoices(new NextRequest('http://localhost/api/invoice/list?deleted=1'))
  const deletedBody = await deletedList.json()
  assert.equal(deletedBody.invoices.some((row: { invoiceNumber: string }) => row.invoiceNumber === 'INV-DEL-8801'), true)
  assert.equal(deletedBody.invoices.some((row: { invoiceNumber: string }) => row.invoiceNumber === 'INV-KEEP-8801'), false)

  const studentInvoices = await findInvoicesForStudent({ externalStudentId: 8801, name: 'DelStudent 8801' })
  assert.equal(studentInvoices.some(row => row.invoiceNumber === 'INV-DEL-8801'), false)

  const history = await loadPaymentHistory({
    invoiceNumber: 'INV-OPEN-8801', invoiceDate: '2026-11-03', studentName: 'DelStudent 8801',
    studentPhone: '', externalStudentId: 8801, paymentStatus: 'unpaid',
  })
  assert.equal(history.history?.payments.some(payment => payment.invoiceNumber === 'INV-DEL-8801'), false)
  assert.equal(history.history?.payments.some(payment => payment.invoiceNumber === 'INV-KEEP-8801'), true)

  const hidden = await billing.studentBillingSummary({ externalStudentId: 8801 })
  assert.equal(hidden.totalPaid, 250)
  assert.equal(hidden.openBalance, 750)

  const searchHidden = await search(new NextRequest('http://localhost/api/search?q=INV-DEL-8801'))
  const searchHiddenBody = await searchHidden.json()
  assert.equal(searchHiddenBody.results.some((row: { type: string; title: string }) => row.type === 'invoice' && row.title.includes('INV-DEL-8801')), false)

  const reviewHidden = await review(new NextRequest('http://localhost/api/invoice/balance-review', { headers: { cookie } }))
  assert.equal(reviewHidden.status, 200)
  const reviewAccount = (await reviewHidden.json()).accounts.find((row: { identityKey: string }) => row.identityKey === 'student:8801')
  assert.equal(reviewAccount.totalPaid, 250)
  assert.equal(reviewAccount.invoices.some((row: { number: string }) => row.number === 'INV-DEL-8801'), false)
  assert.equal(reviewAccount.invoices.some((row: { number: string }) => row.number === 'INV-KEEP-8801'), true)

  assert.equal((await getInvoice(new NextRequest(`http://localhost/api/invoice/${target.id}`), params(target.id))).status, 404)
  const blocked = await updatePayment(new NextRequest('http://localhost/api/invoice/update-payment', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId: target.id, paymentStatus: 'unpaid' }),
  }))
  assert.equal(blocked.status, 409)
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: target.id } })).paymentStatus, 'paid')
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: target.id } })).total, 250)

  const restored = await restore(
    new NextRequest(`http://localhost/api/invoice/${target.id}/restore`, { method: 'POST' }),
    params(target.id),
  )
  assert.equal(restored.status, 200)
  const back = await prisma.invoice.findUniqueOrThrow({ where: { id: target.id } })
  const backComparable = withoutDeleteFields(back)
  assert.deepEqual(backComparable.rest, beforeComparable.rest)
  assert.equal(back.deletedAt, null)
  assert.equal(back.deletedBy, null)
  assert.equal(back.invoiceNumber, 'INV-DEL-8801')
  assert.equal(back.total, 250)
  assert.equal(back.remainingBalance, 500)
  assert.equal(back.paymentStatus, 'paid')

  const visibleList = await listInvoices(new NextRequest('http://localhost/api/invoice/list?search=DelStudent'))
  assert.equal((await visibleList.json()).invoices.some((row: { invoiceNumber: string }) => row.invoiceNumber === 'INV-DEL-8801'), true)
  assert.equal((await listInvoices(new NextRequest('http://localhost/api/invoice/list?deleted=1'))).ok, true)
  const stillDeleted = await (await listInvoices(new NextRequest('http://localhost/api/invoice/list?deleted=1'))).json()
  assert.equal(stillDeleted.invoices.some((row: { invoiceNumber: string }) => row.invoiceNumber === 'INV-DEL-8801'), false)

  const historyBack = await loadPaymentHistory({
    invoiceNumber: 'INV-OPEN-8801', invoiceDate: '2026-11-03', studentName: 'DelStudent 8801',
    studentPhone: '', externalStudentId: 8801, paymentStatus: 'unpaid',
  })
  assert.equal(historyBack.history?.payments.some(payment => payment.invoiceNumber === 'INV-DEL-8801'), true)
  const visible = await billing.studentBillingSummary({ externalStudentId: 8801 })
  assert.equal(visible.totalPaid, 500)
  assert.equal(visible.openBalance, 500)
  assert.equal((await getInvoice(new NextRequest(`http://localhost/api/invoice/${target.id}`), params(target.id))).status, 200)
  assert.equal((await prisma.invoiceSettings.findUniqueOrThrow({ where: { id: 'default' } })).nextInvoiceNumber, 50)
})
