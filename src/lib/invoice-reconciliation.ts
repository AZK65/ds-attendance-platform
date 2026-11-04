import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { invoiceBelongsToStudent, openBalanceFromInvoices } from './invoice-match'
import { phoneLast10 } from './student-match'
import { cents, ledgerSummary } from './invoice-ledger'

export interface ReconciliationInvoice {
  id: string; invoiceNumber: string; studentName: string; studentPhone?: string | null
  externalStudentId?: number | null; total: number; paymentStatus: string
  remainingBalance?: number | null; createdAt: string | Date; invoiceDate: string
  paidAt?: string | Date | null; billingAccountId?: string | null
}

export function invoiceFingerprint(rows: readonly ReconciliationInvoice[]): string {
  return createHash('sha256').update(JSON.stringify([...rows].sort((a,b) => a.id.localeCompare(b.id)).map(r => ({
    id:r.id, number:r.invoiceNumber, student:r.externalStudentId ?? null, phone:r.studentPhone ?? null, name:r.studentName,
    total:r.total, status:r.paymentStatus, balance:r.remainingBalance ?? null,
    date:r.invoiceDate, created:new Date(r.createdAt).toISOString(), paid:r.paidAt ? new Date(r.paidAt).toISOString() : null,
    account:r.billingAccountId ?? null,
  })))).digest('hex')
}

export function reconciliationPreview(rows: readonly ReconciliationInvoice[]) {
  const groups = new Map<string, ReconciliationInvoice[]>()
  const phoneIds = new Map<string, Set<number>>()
  for (const row of rows) {
    const phone=phoneLast10(row.studentPhone)
    if(phone && row.externalStudentId) {
      if(!phoneIds.has(phone)) phoneIds.set(phone,new Set())
      phoneIds.get(phone)!.add(row.externalStudentId)
    }
  }
  for(const row of rows) {
    const phone=phoneLast10(row.studentPhone), ids=phoneIds.get(phone)
    const id=row.externalStudentId ?? (ids?.size === 1 ? [...ids][0] : null)
    const key=id ? `student:${id}` : phone ? `phone:${phone}` : `unresolved:${row.id}`
    if(!groups.has(key))groups.set(key,[])
    groups.get(key)!.push(row)
  }
  return [...groups].map(([identityKey, values]) => {
    const invoices=[...values].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime() || a.id.localeCompare(b.id))
    const issues:string[]=[]
    if(identityKey.startsWith('unresolved:'))issues.push('No reliable student ID or phone')
    if(invoices.some(r=>(phoneIds.get(phoneLast10(r.studentPhone))?.size ?? 0)>1))issues.push('Phone belongs to more than one student ID')
    if(invoices.some(r=>r.total<0 || r.paymentStatus==='refunded'))issues.push('Refund or credit needs manual review')
    if(invoices.some(r=>(r.remainingBalance ?? 0)<0))issues.push('Negative legacy snapshot is not proof of credit')
    if(invoices.some(r=>r.billingAccountId))issues.push('Already linked to a reviewed account')
    let running=0;const candidates:number[]=[];let lastSnapshot=-1
    for(let i=0;i<invoices.length;i++) {
      const r=invoices[i];running+=cents(r.total)
      if(r.remainingBalance!=null) { candidates.push(cents(r.remainingBalance)+running);lastSnapshot=i }
    }
    if(new Set(candidates).size>1)issues.push('Historical snapshots imply different course totals')
    if(lastSnapshot>=0 && lastSnapshot<invoices.length-1)issues.push('Later invoices have no balance: installment or extra service is unclear')
    if(!candidates.length)issues.push('No course total recorded; invoice totals alone do not establish the full course price')
    const suggestedChargesCents=issues.length ? null : candidates[candidates.length-1]
    const currentBalance=openBalanceFromInvoices(invoices)
    const preview=suggestedChargesCents==null ? null : ledgerSummary(suggestedChargesCents,invoices)
    return {
      identityKey, studentName:invoices[invoices.length-1].studentName,
      invoiceNumbers:invoices.map(r=>r.invoiceNumber), invoiceIds:invoices.map(r=>r.id),
      fingerprint:invoiceFingerprint(invoices), currentBalance,
      proposedBalance:preview?.openBalance ?? null, proposedCredit:preview?.creditBalance ?? null,
      suggestedChargesCents, totalPaid:ledgerSummary(0,invoices).totalPaid,
      issues, approved:false,
    }
  })
}

export interface ReviewedBalancePlan {
  identityKey: string; invoiceIds: string[]; fingerprint: string
  openingChargesCents: number; reviewNote: string; approved: boolean
}

/** Explicit approval only. The fingerprint makes a stale plan fail closed. */
export async function applyReviewedBalance(tx: Prisma.TransactionClient, plan: ReviewedBalancePlan) {
  if(plan.approved!==true || !plan.reviewNote?.trim() || !plan.invoiceIds.length || !Number.isSafeInteger(plan.openingChargesCents) || plan.openingChargesCents<0) {
    throw new Error('A reviewed total, explanation, and explicit approval are required')
  }
  const all=await tx.invoice.findMany()
  const selected=all.filter(r=>plan.invoiceIds.includes(r.id))
  const preview=reconciliationPreview(all).find(r=>r.identityKey===plan.identityKey)
  if(!preview || preview.fingerprint!==plan.fingerprint || invoiceFingerprint(selected)!==plan.fingerprint || selected.length!==new Set(plan.invoiceIds).size) {
    throw new Error('Invoices changed since preview; generate a fresh report')
  }
  if(plan.identityKey.startsWith('unresolved:') || preview.issues.includes('Phone belongs to more than one student ID'))throw new Error('Resolve student identity before reconciliation')
  if(selected.some(r=>r.billingAccountId))throw new Error('Account already reconciled')
  // Every record selected for a student must remain in that identity group.
  const identity=plan.identityKey.startsWith('student:') ? {externalStudentId:Number(plan.identityKey.slice(8)),phone:selected[0].studentPhone,name:selected[0].studentName} : {phone:selected[0].studentPhone,name:selected[0].studentName}
  if(all.some(r=>invoiceBelongsToStudent(r,identity)&&!plan.invoiceIds.includes(r.id)))throw new Error('Additional matching invoices need review')
  const account=await tx.billingAccount.create({data:{identityKey:plan.identityKey,openingChargesCents:plan.openingChargesCents,reviewNote:plan.reviewNote}})
  await tx.invoice.updateMany({where:{id:{in:plan.invoiceIds}},data:{billingAccountId:account.id,chargeCents:0,billingMode:'legacy-reviewed'}})
  return {accountId:account.id,...ledgerSummary(account.openingChargesCents,selected)}
}
