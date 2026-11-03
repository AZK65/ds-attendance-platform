import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { NextRequest } from 'next/server'

const databaseFile = path.join(mkdtempSync(path.join(os.tmpdir(), 'qazi-receipt-date-')), 'test.db')
closeSync(openSync(databaseFile, 'wx'))
process.env.DATABASE_URL = `file:${databaseFile}`
let prisma: typeof import('./db').prisma
let updatePayment: typeof import('../app/api/invoice/update-payment/route').PUT

before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' })
  prisma = (await import('./db')).prisma
  updatePayment = (await import('../app/api/invoice/update-payment/route')).PUT
})
after(async () => { await prisma?.$disconnect() })

async function update(invoiceId: string, values: Record<string, string>) {
  const response = await updatePayment(new NextRequest('http://localhost/api/invoice/update-payment', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invoiceId, ...values }),
  }))
  assert.equal(response.status, 200)
  return prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
}

test('paying an old invoice records receipt time; edits preserve it; unpaid clears it', async () => {
  const invoice = await prisma.invoice.create({ data: {
    invoiceNumber: 'TEST-RECEIPT', studentName: 'Sample Student',
    invoiceDate: '2026-01-01', lineItems: '[]', subtotal: 2000, total: 2000,
  } })
  const beforePayment = Date.now()
  const paid = await update(invoice.id, { paymentStatus: 'paid' })
  assert.ok(paid.paidAt && paid.paidAt.getTime() >= beforePayment)
  const edited = await update(invoice.id, { paymentStatus: 'paid', paymentMethod: 'card' })
  assert.equal(edited.paidAt?.getTime(), paid.paidAt?.getTime())
  const unpaid = await update(invoice.id, { paymentStatus: 'unpaid' })
  assert.equal(unpaid.paidAt, null)
})

test('editing a historical paid receipt does not assign today as its original payment date', async () => {
  const invoice = await prisma.invoice.create({ data: {
    invoiceNumber: 'TEST-HISTORY', studentName: 'Sample Student',
    invoiceDate: '2026-08-06', lineItems: '[]', subtotal: 2000, total: 2000,
    paymentStatus: 'paid',
  } })
  const edited = await update(invoice.id, { paymentStatus: 'paid', paymentMethod: 'cash' })
  assert.equal(edited.paidAt, null)
})
