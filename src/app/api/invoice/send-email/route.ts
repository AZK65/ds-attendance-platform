import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { emailLogoAttachment } from '@/lib/brand-assets'
import { invoiceEmailHtml } from '@/lib/document-emails'
import { getEmailSender } from '@/lib/email'

export async function POST(request: NextRequest) {
  let attemptId: string | undefined
  let submitting = false
  let accepted = false
  let emailId: string | undefined
  try {
    const { to, invoiceId, invoiceNumber, pdfBase64 } = await request.json()
    if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim()) ||
        typeof invoiceNumber !== 'string' || typeof pdfBase64 !== 'string' || !pdfBase64 ||
        (invoiceId != null && typeof invoiceId !== 'string')) {
      return NextResponse.json({ error: 'A valid recipient, invoice number and PDF are required.' }, { status: 400 })
    }
    const invoice = await prisma.invoice.findUnique({ where: invoiceId ? { id: invoiceId } : { invoiceNumber } })
    if (!invoice || invoice.invoiceNumber !== invoiceNumber) {
      return NextResponse.json({ error: 'Save this invoice before emailing it.' }, { status: 400 })
    }
    const attempt = await prisma.invoiceEmailAttempt.create({ data: { invoiceId: invoice.id, recipient: to.trim() } })
    attemptId = attempt.id
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('Email service is not configured. Please contact an administrator.')
    const sender = await getEmailSender()
    if (!sender) throw new Error('Set a sender email in Invoice Settings before sending.')
    submitting = true
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `invoice-email/${attempt.id}` },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        from: sender.from, to: [to.trim()], subject: `Invoice ${invoice.invoiceNumber} - ${sender.schoolName}`,
        html: invoiceEmailHtml({ studentName: invoice.studentName, invoiceNumber: invoice.invoiceNumber, schoolName: sender.schoolName }),
        attachments: [emailLogoAttachment(), { filename: `invoice-${invoice.invoiceNumber}.pdf`, content: pdfBase64 }],
      }),
    })
    if (!response.ok) {
      submitting = response.status >= 500
      const data = await response.json().catch(() => ({}))
      throw new Error(typeof data.message === 'string' ? data.message : `Email service returned ${response.status}.`)
    }
    accepted = true
    const data = await response.json().catch(() => ({}))
    emailId = typeof data.id === 'string' ? data.id : undefined
    await prisma.invoiceEmailAttempt.update({ where: { id: attempt.id }, data: { status: 'sent', sentAt: new Date(), providerId: emailId } })
    return NextResponse.json({ success: true, emailId })
  } catch (error) {
    console.error('[Invoice Email]', error)
    // Do not encourage duplicate sending if the provider accepted it but saving history failed.
    if (accepted) return NextResponse.json({ success: true, emailId, warning: 'Email accepted; its history could not be updated.' })
    const message = !attemptId ? 'Email could not be started. Please try again.' : submitting ? 'Sending status could not be confirmed. Check before sending again.' : error instanceof Error ? error.message : 'Email could not be sent.'
    if (attemptId) {
      await prisma.invoiceEmailAttempt.update({ where: { id: attemptId }, data: { status: submitting ? 'unknown' : 'failed', error: message.slice(0, 500) } })
        .catch((logError) => console.error('[Invoice Email] Could not save outcome:', logError))
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
