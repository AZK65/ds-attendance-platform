import { prisma } from '@/lib/db'

export class EmailStatusUnknownError extends Error {}

// Send via Resend's REST API directly (no SDK — matches the invoice/contract
// email routes). Throws on failure; callers decide whether that's fatal.
export async function sendEmailViaResend(payload: {
  from: string
  to: string[]
  subject: string
  html: string
  text?: string
  attachments?: { filename: string; content: string }[]
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => { throw new EmailStatusUnknownError('Sending status could not be confirmed. Check before sending again.') })
  if (res.status >= 500) throw new EmailStatusUnknownError('Sending status could not be confirmed. Check before sending again.')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Resend API error')
  return data
}

// Resolve the "From" header + school name from settings (same source the
// invoice emails use). Returns null if no sender email is configured.
export async function getEmailSender(): Promise<{ from: string; schoolName: string } | null> {
  const settings = await prisma.invoiceSettings.findUnique({ where: { id: 'default' } })
  const senderEmail = settings?.senderEmail
  if (!senderEmail) return null
  const schoolInfo = await prisma.certificateSettings.findUnique({ where: { id: 'default' } })
  const schoolName = schoolInfo?.schoolName || 'École de Conduite Qazi'
  return { from: `${schoolName} <${senderEmail}>`, schoolName }
}
