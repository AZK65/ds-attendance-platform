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
let reviewRoutes: typeof import('../app/api/invoice/balance-review/route')

before(async()=>{
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{env:process.env,stdio:'pipe'})
  prisma=(await import('./db')).prisma
  billing=await import('./invoice-billing')
  update=(await import('../app/api/invoice/update-payment/route')).PUT
  refund=(await import('../app/api/invoice/refund/route')).POST
  remove=(await import('../app/api/invoice/[id]/route')).DELETE
  edit=(await import('../app/api/invoice/edit/route')).PUT
  reviewRoutes=await import('../app/api/invoice/balance-review/route')
})
after(async()=>{await prisma?.$disconnect()})
const req=(body:unknown)=>new NextRequest('http://localhost/api/invoice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
const reviewReq=(body?:unknown, cookie='auth-token=valid; sid=review-test', extra:Record<string,string>={})=>new NextRequest('http://localhost/api/invoice/balance-review',{
  method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),
})
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

test('balance review requires authentication, same origin and a registered staff session',async()=>{
  assert.equal((await reviewRoutes.GET(reviewReq(undefined,''))).status,401)
  assert.equal((await reviewRoutes.POST(reviewReq({},''))).status,401)
  for(const origin of ['https://other.example','null','invalid']) {
    assert.equal((await reviewRoutes.POST(reviewReq({},undefined,{origin}))).status,403)
  }
  assert.equal((await reviewRoutes.POST(reviewReq({},undefined,{'sec-fetch-site':'cross-site'}))).status,403)
  assert.equal((await reviewRoutes.POST(reviewReq({},undefined,{origin:'https://qazidrivingschool.ca',host:'qazidrivingschool.ca'}))).status,400)
  const body={identityKey:'student:901',fingerprint:'test',openingChargesCents:100000,approved:true,reviewNote:'Checked signed contract',reviewedBy:'Test staff'}
  assert.equal((await reviewRoutes.POST(reviewReq(body))).status,401)
  await prisma.adminSession.create({data:{id:'review-test',label:'Synthetic review test'}})
  for(const change of [{openingChargesCents:-1},{openingChargesCents:1.1},{openingChargesCents:2147483648},{approved:false},{reviewNote:'short'},{reviewedBy:''}]) {
    assert.equal((await reviewRoutes.POST(reviewReq({...body,...change}))).status,400)
  }
})

test('staff review is read-only until approval, saves audit, preserves receipts and rejects replay',async()=>{
  const a=await receipt(901,null,250,'paid'),b=await receipt(901,null,250,'unpaid')
  await prisma.invoice.update({where:{id:b.id},data:{remainingBalance:500}})
  const before=await prisma.invoice.findMany({where:{externalStudentId:901},orderBy:{invoiceNumber:'asc'}})
  const response=await reviewRoutes.GET(reviewReq())
  assert.equal(response.headers.get('cache-control'),'no-store')
  const preview=(await response.json()).accounts.find((x:{identityKey:string})=>x.identityKey==='student:901')
  assert.equal(preview.totalPaid,250);assert.equal(preview.canApprove,true)
  assert.equal(await prisma.billingAccount.count({where:{identityKey:'student:901'}}),0)
  const payload={identityKey:preview.identityKey,fingerprint:preview.fingerprint,openingChargesCents:100000,approved:true,reviewedBy:'Test staff',reviewNote:'Checked signed course contract and both receipts',invoiceIds:['untrusted-id']}
  const saved=await reviewRoutes.POST(reviewReq(payload))
  assert.equal(saved.status,200);assert.equal((await saved.json()).summary.openBalance,750)
  const account=await prisma.billingAccount.findUniqueOrThrow({where:{identityKey:'student:901'}})
  assert.equal(account.reviewedBy,'Test staff');assert.equal(account.reviewedBySessionId,'review-test')
  assert.equal(account.reviewedFingerprint,preview.fingerprint);assert.equal(account.reviewedPaidCents,25000)
  assert(account.reviewedAt);assert.equal(account.reviewedChargesCents,100000)
  assert.equal(account.previousBalanceCents,50000)
  const after=await prisma.invoice.findMany({where:{externalStudentId:901},orderBy:{invoiceNumber:'asc'}})
  for(let i=0;i<before.length;i++) {
    const {billingAccountId:_a,chargeCents:_b,billingMode:_c,updatedAt:_d,...original}=before[i]
    const {billingAccountId,chargeCents,billingMode,updatedAt:_e,...current}=after[i]
    assert.deepEqual(current,original);assert.equal(billingAccountId,account.id);assert.equal(chargeCents,0);assert.equal(billingMode,'legacy-reviewed')
  }
  assert.equal((await reviewRoutes.POST(reviewReq(payload))).status,409)
  const publicResponse=await (await reviewRoutes.GET(reviewReq())).text()
  assert(!publicResponse.includes('review-test'));assert(!publicResponse.includes('reviewedBySessionId'))
  const reviewed=JSON.parse(publicResponse).accounts.find((x:{identityKey:string})=>x.identityKey===preview.identityKey)
  assert.equal(reviewed.currentBalance,750);assert.equal(reviewed.reviewed,true);assert.equal(reviewed.canApprove,false)
  assert.equal(reviewed.audit.by,'Test staff')
  assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:a.id}})).paymentStatus,'paid')
})

test('payment changes and additional receipts invalidate the screen approval without writing a balance',async()=>{
  const r=await receipt(902,null,250)
  const get=async()=> (await (await reviewRoutes.GET(reviewReq())).json()).accounts.find((x:{identityKey:string})=>x.identityKey==='student:902')
  const stale=await get()
  await prisma.invoice.update({where:{id:r.id},data:{paymentStatus:'paid'}})
  const payload={identityKey:stale.identityKey,fingerprint:stale.fingerprint,openingChargesCents:100000,approved:true,reviewedBy:'Test staff',reviewNote:'Checked receipts and course contract'}
  assert.equal((await reviewRoutes.POST(reviewReq(payload))).status,409)
  const fresh=await get();await receipt(902,null,100,'paid')
  assert.equal((await reviewRoutes.POST(reviewReq({...payload,fingerprint:fresh.fingerprint}))).status,409)
  assert.equal(await prisma.billingAccount.count({where:{identityKey:'student:902'}}),0)
  assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:r.id}})).billingAccountId,null)
})

test('shared-phone and missing-identity accounts cannot be approved through the screen',async()=>{
  const a=await receipt(903,null,250),b=await receipt(904,null,250),c=await receipt(905,null,250)
  await prisma.invoice.updateMany({where:{id:{in:[a.id,b.id]}},data:{studentPhone:'15145550903'}})
  await prisma.invoice.update({where:{id:c.id},data:{externalStudentId:null}})
  const previews=(await (await reviewRoutes.GET(reviewReq())).json()).accounts
  for(const identityKey of ['student:903',`unresolved:${c.id}`]) {
    const preview=previews.find((x:{identityKey:string})=>x.identityKey===identityKey)
    assert.equal(preview.canApprove,false)
    assert.equal((await reviewRoutes.POST(reviewReq({identityKey,fingerprint:preview.fingerprint,openingChargesCents:100000,approved:true,reviewedBy:'Test staff',reviewNote:'Checked receipts and course contract'}))).status,409)
    assert.equal(await prisma.billingAccount.count({where:{identityKey}}),0)
  }
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

test('custom charges work with unresolved history, without inventing old debt or using old payments as credit',async()=>{
  const old=await receipt(910,null,250,'paid')
  await prisma.invoice.update({where:{id:old.id},data:{remainingBalance:750}})
  const created=await prisma.$transaction(async tx=>{
    const data=await billing.prepareInvoiceBilling(tx,{externalStudentId:910},{mode:'new-charge',total:175})
    return tx.invoice.create({data:{invoiceNumber:'CUSTOM-910',studentName:'Test 910',externalStudentId:910,invoiceDate:'2026-11-05',lineItems:'[]',subtotal:175,total:175,paymentStatus:'unpaid',...data}})
  })
  const summary=await billing.studentBillingSummary({externalStudentId:910})
  assert.equal(summary.needsReview,true);assert.equal(summary.knownActivityBalance,175)
  assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:old.id}})).billingAccountId,null)
  await update(req({invoiceId:created.id,paymentStatus:'paid'}))
  assert.equal((await billing.studentBillingSummary({externalStudentId:910})).knownActivityBalance,0)
  const fresh=await billing.studentBillingSummary({externalStudentId:910})
  assert(fresh.canConfirmHistory)
  await prisma.$transaction(async tx=>{
    const data=await billing.prepareInvoiceBilling(tx,{externalStudentId:910},{mode:'installment',total:250,history:{chargesCents:117500,fingerprint:fresh.historyFingerprint!,confirmed:true,staffSessionId:'review-test',staffName:'Test staff'}})
    assert.equal(data.chargeCents,0)
    await tx.invoice.create({data:{invoiceNumber:'PAYMENT-910',studentName:'Test 910',externalStudentId:910,invoiceDate:'2026-11-05',lineItems:'[]',subtotal:250,total:250,paymentStatus:'paid',...data}})
  })
  const resolved=await billing.studentBillingSummary({externalStudentId:910})
  assert.equal(resolved.needsReview,false);assert.equal(resolved.totalCharges,1175);assert.equal(resolved.totalPaid,675);assert.equal(resolved.openBalance,500)
  assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:created.id}})).chargeCents,17500)
})

test('custom course price is saved once and installments need no package',async()=>{
  await prisma.$transaction(async tx=>{
    const data=await billing.prepareInvoiceBilling(tx,{externalStudentId:911},{mode:'new-course',total:200,courseTotal:1200})
    await tx.invoice.create({data:{invoiceNumber:'CUSTOM-COURSE-911',studentName:'Test 911',externalStudentId:911,invoiceDate:'2026-11-05',lineItems:'[]',subtotal:200,total:200,paymentStatus:'paid',...data}})
    const second=await billing.prepareInvoiceBilling(tx,{externalStudentId:911},{mode:'installment',total:300,courseTotal:9999})
    await tx.invoice.create({data:{invoiceNumber:'CUSTOM-INSTALLMENT-911',studentName:'Test 911',externalStudentId:911,invoiceDate:'2026-11-05',lineItems:'[]',subtotal:300,total:300,paymentStatus:'unpaid',...second}})
  })
  const s=await billing.studentBillingSummary({externalStudentId:911})
  assert.equal(s.totalCharges,1200);assert.equal(s.openBalance,1000)
  assert.equal(s.hasCourseAgreement,true)
})

test('a standalone custom invoice does not establish a course agreement',async()=>{
  await prisma.$transaction(async tx=>{
    const data=await billing.prepareInvoiceBilling(tx,{externalStudentId:916},{mode:'new-charge',total:100})
    await tx.invoice.create({data:{invoiceNumber:'ONLY-CUSTOM-916',studentName:'Test 916',externalStudentId:916,invoiceDate:'2026-11-05',lineItems:'[]',subtotal:100,total:100,paymentStatus:'paid',...data}})
  })
  assert.equal((await billing.studentBillingSummary({externalStudentId:916})).hasCourseAgreement,false)
})

test('invoice save defaults to new charge; inline total confirmation requires staff authentication',async()=>{
  const save=(await import('../app/api/invoice/save/route')).POST
  await receipt(915,null,250,'paid')
  const preview=await billing.studentBillingSummary({externalStudentId:915})
  const body={invoiceNumber:'INLINE-915',studentName:'Test 915',externalStudentId:915,invoiceDate:'2026-11-05',lineItems:[{description:'Course payment',quantity:1,unitPrice:250}],subtotal:250,gstAmount:0,qstAmount:0,total:250,billingMode:'installment',history:{chargesCents:100000,fingerprint:preview.historyFingerprint,confirmed:true}}
  assert.equal((await save(req(body))).status,401)
  assert.equal(await prisma.billingAccount.count({where:{identityKey:'student:915'}}),0)
  assert.equal((await save(reviewReq(body))).status,200)
  assert.equal((await billing.studentBillingSummary({externalStudentId:915})).openBalance,750)
  const {history:_h,billingMode:_m,...custom}=body
  const result=await save(req({...custom,invoiceNumber:'EXTRA-915',lineItems:[{description:'Custom service',quantity:1,unitPrice:100}],subtotal:100,total:100}))
  assert.equal(result.status,200)
  assert.equal((await result.json()).invoice.chargeCents,10000)
  assert.equal((await billing.studentBillingSummary({externalStudentId:915})).openBalance,850)
})

test('inline confirmation rejects stale history and rolls back with a failed invoice save',async()=>{
  const old=await receipt(912,null,250,'paid')
  const preview=await billing.studentBillingSummary({externalStudentId:912})
  const history={chargesCents:100000,fingerprint:preview.historyFingerprint!,confirmed:true,staffSessionId:'review-test',staffName:'Test staff'}
  await prisma.invoice.update({where:{id:old.id},data:{total:300}})
  await assert.rejects(()=>prisma.$transaction(tx=>billing.prepareInvoiceBilling(tx,{externalStudentId:912},{mode:'installment',total:250,history})),/changed/)
  const fresh=await billing.studentBillingSummary({externalStudentId:912})
  await assert.rejects(()=>prisma.$transaction(async tx=>{
    await billing.prepareInvoiceBilling(tx,{externalStudentId:912},{mode:'installment',total:250,history:{...history,fingerprint:fresh.historyFingerprint!}})
    throw new Error('invoice failed')
  }),/invoice failed/)
  assert.equal(await prisma.billingAccount.count({where:{identityKey:'student:912'}}),0)
  assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:old.id}})).billingAccountId,null)
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
