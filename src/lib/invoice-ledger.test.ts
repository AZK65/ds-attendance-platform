import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdtempSync, openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NextRequest } from 'next/server'
import { cents, chargeForInvoice, ledgerSummary } from './invoice-ledger'
import { reconciliationPreview, applyReviewedBalance } from './invoice-reconciliation'
import { listPriorPayments } from './invoice-payments'
import { billingBalanceLabel } from './billing-label'

const databaseFile=path.join(mkdtempSync(path.join(tmpdir(),'qazi-ledger-test-')),'test.db')
closeSync(openSync(databaseFile,'wx'))
process.env.DATABASE_URL = `file:${databaseFile}`
let prisma: typeof import('./db').prisma
let billing: typeof import('./invoice-billing')
let update: typeof import('../app/api/invoice/update-payment/route').PUT
let refund: typeof import('../app/api/invoice/refund/route').POST
let remove: typeof import('../app/api/invoice/[id]/route').DELETE
let edit: typeof import('../app/api/invoice/edit/route').PUT

before(async()=>{
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{env:process.env,stdio:'pipe'})
  prisma=(await import('./db')).prisma
  billing=await import('./invoice-billing')
  update=(await import('../app/api/invoice/update-payment/route')).PUT
  refund=(await import('../app/api/invoice/refund/route')).POST
  remove=(await import('../app/api/invoice/[id]/route')).DELETE
  edit=(await import('../app/api/invoice/edit/route')).PUT
})
after(async()=>{await prisma?.$disconnect()})
const req=(body:unknown)=>new NextRequest('http://localhost/api/invoice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
let seq=0
async function account(student:number,total=1000){return prisma.billingAccount.create({data:{identityKey:`student:${student}`,openingChargesCents:cents(total),reviewNote:'Synthetic reviewed opening total'}})}
async function receipt(student:number,accountId:string|null,total:number,status='unpaid',chargeCents=0){
  return prisma.invoice.create({data:{invoiceNumber:`TEST-${++seq}`,studentName:`Test ${student}`,externalStudentId:student,invoiceDate:'2026-11-04',lineItems:'[]',subtotal:total,total,paymentStatus:status,billingAccountId:accountId,chargeCents}})
}

test('integer-cent arithmetic and explicit invoice roles',()=>{
  assert.equal(chargeForInvoice('installment',250),0)
  assert.equal(chargeForInvoice('new-charge',150),15000)
  assert.equal(chargeForInvoice('new-course',250,1000),100000)
  assert.throws(()=>chargeForInvoice('new-course',250),/requires/)
  assert.throws(()=>cents(NaN))
  assert.equal(ledgerSummary(30,[{id:'a',total:0.1,paymentStatus:'paid'},{id:'b',total:0.2,paymentStatus:'paid'}]).netBalance,0)
})

test('unpaid installment does not reduce course balance; paid status does, once',async()=>{
  const a=await account(1),r=await receipt(1,a.id,250)
  assert.equal((await billing.studentBillingSummary({externalStudentId:1})).openBalance,1000)
  assert.equal((await update(req({invoiceId:r.id,paymentStatus:'paid'}))).status,200)
  assert.equal((await billing.studentBillingSummary({externalStudentId:1})).openBalance,750)
  assert.equal((await update(req({invoiceId:r.id,paymentStatus:'paid'}))).status,200)
  assert.equal((await billing.studentBillingSummary({externalStudentId:1})).openBalance,750)
  await update(req({invoiceId:r.id,paymentStatus:'unpaid'}))
  assert.equal((await billing.studentBillingSummary({externalStudentId:1})).openBalance,1000)
})

test('delete a draft does not rewrite older snapshots; paid receipts cannot be erased',async()=>{
  const a=await account(2),first=await receipt(2,a.id,250,'paid'),second=await receipt(2,a.id,250)
  const params={params:Promise.resolve({id:second.id})}
  assert.equal((await remove(req({}),params)).status,200)
  assert.equal((await billing.studentBillingSummary({externalStudentId:2})).openBalance,750)
  assert.equal((await remove(req({}),{params:Promise.resolve({id:first.id})})).status,409)
  assert.ok(await prisma.invoice.findUnique({where:{id:first.id}}))
})

test('refunded installment restores debt once; repeating refund is idempotent',async()=>{
  const a=await account(3),r=await receipt(3,a.id,250,'paid')
  assert.equal((await refund(req({invoiceId:r.id,reason:'Test'}))).status,200)
  assert.equal((await refund(req({invoiceId:r.id,reason:'Test'}))).status,200)
  assert.equal(await prisma.invoice.count({where:{creditForInvoiceId:r.id}}),1)
  const summary=await billing.studentBillingSummary({externalStudentId:3})
  assert.equal(summary.totalPaid,0);assert.equal(summary.openBalance,1000)
  assert.equal((await update(req({invoiceId:r.id,paymentStatus:'paid'}))).status,409)
})

test('refund of standalone service cancels its charge without creating course credit',async()=>{
  const a=await account(4),r=await receipt(4,a.id,150,'paid',15000)
  await refund(req({invoiceId:r.id}))
  assert.equal((await billing.studentBillingSummary({externalStudentId:4})).openBalance,1000)
})

test('new services increase charges; installment edits do not alter course cost',async()=>{
  const a=await account(5),service=await receipt(5,a.id,150,'unpaid',15000),part=await receipt(5,a.id,250)
  assert.equal((await billing.studentBillingSummary({externalStudentId:5})).openBalance,1150)
  assert.equal((await edit(req({invoiceId:service.id,total:200,subtotal:200}))).status,200)
  assert.equal((await edit(req({invoiceId:part.id,total:300,subtotal:300}))).status,200)
  assert.equal((await billing.studentBillingSummary({externalStudentId:5})).openBalance,1200)
  assert.equal((await edit(req({invoiceId:part.id,total:900}))).status,400)
  assert.equal((await edit(req({invoiceId:part.id,gstAmount:-1}))).status,400)
  assert.equal((await billing.studentBillingSummary({externalStudentId:5})).openBalance,1200)
})

test('reviewed account links retain receipt history after a phone changes',()=>{
  const history=listPriorPayments([
    {invoiceNumber:'OLD',invoiceDate:'2026-08-01',total:250,paymentStatus:'paid',billingAccountId:'account-one',studentPhone:'15145550111'},
    {invoiceNumber:'OTHER',invoiceDate:'2026-08-01',total:900,paymentStatus:'paid',billingAccountId:'account-two',studentPhone:'15145550222'},
  ],{invoiceNumber:'NEW',invoiceDate:'2026-11-04',phone:'15145550222',billingAccountId:'account-one'})
  assert.equal(history.totalPaid,250)
  assert.equal(history.payments[0].invoiceNumber,'OLD')
})

test('confirmed overpayment is a visible credit; it is not clamped away',async()=>{
  const a=await account(6),r=await receipt(6,a.id,1100,'paid')
  const s=await billing.studentBillingSummary({externalStudentId:6})
  assert.equal(s.openBalance,0);assert.equal(s.creditBalance,100)
  assert.equal(billingBalanceLabel(s),'$100.00 credit')
  assert.equal(billingBalanceLabel({openBalance:0,needsReview:true}),'Needs review')
  await prisma.invoice.update({where:{id:r.id},data:{cloverPaid:true}})
  assert.equal((await update(req({invoiceId:r.id,paymentStatus:'unpaid'}))).status,409)
})

test('first paid receipt includes itself; future and same-day later payments are excluded',()=>{
  const r={invoiceNumber:'A',invoiceDate:'2026-11-03',paidAt:'2026-11-04T15:00:00Z',externalStudentId:10,total:250,paymentStatus:'paid'}
  const h=listPriorPayments([r,{...r,invoiceNumber:'B',paidAt:'2026-11-04T16:00:00Z'},{...r,invoiceNumber:'C',paidAt:'2026-11-05T15:00:00Z'},{...r,invoiceNumber:'D',externalStudentId:11}],{...r})
  assert.deepEqual(h.payments.map(x=>x.invoiceNumber),['A']);assert.equal(h.totalPaid,250)
})

test('preview never writes; reviewed baseline requires approval and rejects stale plans',async()=>{
  const r=await receipt(7,null,1000)
  await prisma.invoice.update({where:{id:r.id},data:{remainingBalance:0}})
  const rows=await prisma.invoice.findMany({where:{externalStudentId:7}})
  const [p]=reconciliationPreview(rows)
  assert.equal(p.currentBalance,0);assert.equal(p.proposedBalance,1000)
  assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:r.id}})).billingAccountId,null)
  const plan={...p,openingChargesCents:100000,reviewNote:'Synthetic approval'}
  await assert.rejects(()=>prisma.$transaction(tx=>applyReviewedBalance(tx,plan)),/approval/)
  await update(req({invoiceId:r.id,paymentStatus:'paid'}))
  await assert.rejects(()=>prisma.$transaction(tx=>applyReviewedBalance(tx,{...plan,approved:true})),/changed/)
  const [fresh]=reconciliationPreview(await prisma.invoice.findMany({where:{externalStudentId:7}}))
  await prisma.$transaction(tx=>applyReviewedBalance(tx,{...fresh,openingChargesCents:100000,reviewNote:'Reviewed in test',approved:true}))
  assert.equal((await billing.studentBillingSummary({externalStudentId:7})).openBalance,0)
})

test('uncertain legacy snapshots cannot silently become credits or new ledger entries',async()=>{
  const r=await receipt(8,null,250,'paid')
  await prisma.invoice.update({where:{id:r.id},data:{remainingBalance:-500}})
  const [p]=reconciliationPreview(await prisma.invoice.findMany({where:{externalStudentId:8}}))
  assert.equal(p.proposedBalance,null);assert.ok(p.issues.some(x=>x.includes('Negative')))
  await assert.rejects(()=>prisma.$transaction(tx=>billing.prepareInvoiceBilling(tx,{externalStudentId:8},{mode:'installment',total:250})),/historical balance needs review/)
})

test('transactionally opening a new course cannot deduct an unpaid installment',async()=>{
  await prisma.$transaction(async tx=>{
    const data=await billing.prepareInvoiceBilling(tx,{externalStudentId:9},{mode:'new-course',total:250,courseTotal:1000})
    await tx.invoice.create({data:{invoiceNumber:'NEW-COURSE',studentName:'Test 9',externalStudentId:9,invoiceDate:'2026-11-04',lineItems:'[]',subtotal:250,total:250,...data}})
  })
  const s=await billing.studentBillingSummary({externalStudentId:9})
  assert.equal(s.totalCharges,1000);assert.equal(s.totalPaid,0);assert.equal(s.openBalance,1000)
})

test('refunding the first course payment does not cancel the full course charge',async()=>{
  const a=await account(12,0),r=await receipt(12,a.id,250,'paid',100000)
  await prisma.invoice.update({where:{id:r.id},data:{billingMode:'new-course'}})
  await refund(req({invoiceId:r.id}))
  assert.equal((await billing.studentBillingSummary({externalStudentId:12})).openBalance,1000)
})

test('PDF history and student summary use the same reviewed account',async()=>{
  const a=await account(13),r=await receipt(13,a.id,250,'paid')
  const {loadPaymentHistory}=await import('../app/api/invoice/generate/route')
  const h=await loadPaymentHistory({invoiceNumber:r.invoiceNumber,invoiceDate:r.invoiceDate,studentName:'stale browser name',studentPhone:'9999999999',externalStudentId:99})
  assert.equal(h.history?.totalPaid,250);assert.equal(h.balance,750);assert.equal(h.needsReview,false)
})

test('save ignores caller balance and duplicate number does not create extra debt',async()=>{
  const {POST:save}=await import('../app/api/invoice/save/route')
  const payload={invoiceNumber:'SAVE-TEST',studentName:'Test 14',externalStudentId:14,invoiceDate:'2026-11-04',lineItems:[],subtotal:250,gstAmount:0,qstAmount:0,total:250,billingMode:'new-course',courseTotal:1000,remainingBalance:0}
  assert.equal((await save(req(payload))).status,200)
  assert.equal((await billing.studentBillingSummary({externalStudentId:14})).openBalance,1000)
  assert.equal((await save(req(payload))).status,409)
  assert.equal((await billing.studentBillingSummary({externalStudentId:14})).totalCharges,1000)
})
