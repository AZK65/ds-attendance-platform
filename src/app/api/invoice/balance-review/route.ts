import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { reconciliationPreview, applyReviewedBalance } from '@/lib/invoice-reconciliation'
import { ledgerSummary } from '@/lib/invoice-ledger'
import type { BillingReviewAccount } from '@/lib/billing-review-types'

export const dynamic = 'force-dynamic'

function unauthorized(request: NextRequest) {
  return request.cookies.get('auth-token')?.value !== 'valid'
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: NextRequest) {
  if (unauthorized(request)) return json({ error: 'Sign in to review balances.' }, 401)
  try {
    const [rows, accounts] = await prisma.$transaction([
      prisma.invoice.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.billingAccount.findMany({ include: { invoices: true } }),
    ])
    const result: BillingReviewAccount[] = reconciliationPreview(rows).map(preview => {
      const own = rows.filter(row => preview.invoiceIds.includes(row.id))
      const account = accounts.find(a => own.length > 0 && own.every(row => row.billingAccountId === a.id))
      const blocked = preview.identityKey.startsWith('unresolved:') || preview.issues.some(issue =>
        issue === 'Phone belongs to more than one student ID' || issue === 'Already linked to a reviewed account')
      const current = account ? ledgerSummary(account.openingChargesCents, account.invoices) : null
      return {
        identityKey: preview.identityKey, studentName: preview.studentName,
        phone: own.at(-1)?.studentPhone ?? null, studentId: own.find(row => row.externalStudentId)?.externalStudentId ?? null,
        fingerprint: preview.fingerprint, currentBalance: current?.netBalance ?? preview.currentBalance,
        totalPaid: current?.totalPaid ?? preview.totalPaid, suggestedChargesCents: preview.suggestedChargesCents,
        issues: account ? [] : preview.issues, canApprove: !account && !blocked, reviewed: !!account,
        audit: account ? { by: account.reviewedBy, note: account.reviewNote, at: account.createdAt.toISOString(),
          openingCharges: account.openingChargesCents / 100, previousBalance: account.previousBalanceCents == null ? null : account.previousBalanceCents / 100,
          paidAtReview: account.reviewedPaidCents == null ? null : account.reviewedPaidCents / 100 } : null,
        invoices: own.map(row => ({ id: row.id, number: row.invoiceNumber, date: row.invoiceDate, total: row.total, status: row.paymentStatus, savedBalance: row.remainingBalance })),
      }
    })
    return json({ accounts: result })
  } catch (error) {
    console.error('Balance review load failed', error)
    return json({ error: 'Could not load balances. Try again; nothing was changed.' }, 500)
  }
}

export async function POST(request: NextRequest) {
  if (unauthorized(request)) return json({ error: 'Sign in to review balances.' }, 401)
  const origin = request.headers.get('origin')
  // Caddy preserves the public Host; Next's internal URL can use the container host.
  const requestHost = request.headers.get('host') || request.nextUrl.host
  let originMatches = !origin
  try { originMatches = !origin || new URL(origin).host === requestHost } catch { originMatches = false }
  if (request.headers.get('sec-fetch-site') === 'cross-site' || !originMatches) {
    return json({ error: 'Open balance review from the school platform.' }, 403)
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body.identityKey !== 'string' || typeof body.fingerprint !== 'string'
    || !Number.isSafeInteger(body.openingChargesCents) || body.openingChargesCents < 0 || body.openingChargesCents > 2147483647
    || body.approved !== true || typeof body.reviewNote !== 'string' || body.reviewNote.trim().length < 10 || body.reviewNote.length > 2000
    || typeof body.reviewedBy !== 'string' || body.reviewedBy.trim().length < 2 || body.reviewedBy.length > 100) {
    return json({ error: 'Enter a verified total, your name and a review note, then confirm the receipts were checked.' }, 400)
  }
  try {
    const sid = request.cookies.get('sid')?.value
    const session = sid ? await prisma.adminSession.findUnique({ where: { id: sid } }) : null
    if (!session) return json({ error: 'Your staff session is missing or expired. Reload or sign in again before approving.' }, 401)
    const result = await prisma.$transaction(async tx => {
      const preview = reconciliationPreview(await tx.invoice.findMany()).find(row => row.identityKey === body.identityKey)
      if (!preview || preview.fingerprint !== body.fingerprint) throw new Error('Invoices changed since preview; reload and review the latest payments.')
      // The server selects every invoice in this account. Caller-supplied IDs,
      // payment totals and suggested balances are never trusted.
      return applyReviewedBalance(tx, {
        identityKey: preview.identityKey, invoiceIds: preview.invoiceIds, fingerprint: body.fingerprint,
        openingChargesCents: body.openingChargesCents, reviewNote: body.reviewNote.trim(), approved: true,
        reviewedBy: body.reviewedBy.trim(), reviewedBySessionId: session.id,
      })
    }, { timeout: 15000 })
    return json({ success: true, summary: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/changed|already reconciled|identity|Additional matching|Unique constraint|write conflict|database is locked/i.test(message)) {
      return json({ error: 'This account changed or needs identity review. Reload and check the latest records before approving.' }, 409)
    }
    console.error('Balance review approval failed', error)
    return json({ error: 'Approval could not be saved. Reload the account before trying again.' }, 500)
  }
}
