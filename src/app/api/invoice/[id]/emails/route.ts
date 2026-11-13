import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true, onlinePaymentReceiptEmail: { select: { sentAt: true } } } })
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  const attempts = await prisma.invoiceEmailAttempt.findMany({ where: { invoiceId: id }, orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }], take: 100 })
  const legacySentAt = invoice.onlinePaymentReceiptEmail?.sentAt
  const hasReceiptLog = await prisma.invoiceEmailAttempt.count({ where: { invoiceId: id, source: 'online-payment', status: 'sent' } })
  const history = attempts.map((attempt) => ({ ...attempt, status: attempt.status === 'pending' && Date.now() - attempt.attemptedAt.getTime() > 120000 ? 'unknown' : attempt.status }))
  // Old automatic receipts have a reliable sent marker, but no saved recipient.
  if (legacySentAt && !hasReceiptLog) history.push({ id: 'legacy-receipt', invoiceId: id, recipient: '', source: 'online-payment', status: 'sent', attemptedAt: legacySentAt, sentAt: legacySentAt, providerId: null, error: null })
  history.sort((a, b) => b.attemptedAt.getTime() - a.attemptedAt.getTime())
  return NextResponse.json({ attempts: history }, { headers: { 'Cache-Control': 'no-store' } })
}
