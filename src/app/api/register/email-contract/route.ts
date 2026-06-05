import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/register/email-contract
// Generates the truck SAAQ Class 1 contract PDF for a registration and
// emails it (both EN + FR pages, as one PDF) to the student via Resend.
// The contract route already returns the merged PDF bytes; here we just
// re-call it server-side, base64-encode the result, and attach.
//
// Body: { registrationId, to? }  — `to` overrides reg.email.
// Admin-only.

async function sendEmailViaResend(apiKey: string, payload: {
  from: string
  to: string[]
  subject: string
  html: string
  attachments: { filename: string; content: string }[]
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.error || 'Resend API error')
  return data
}

export async function POST(request: NextRequest) {
  if (request.cookies.get('auth-token')?.value !== 'valid') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { registrationId, to } = await request.json() as { registrationId?: string; to?: string }
    if (!registrationId) return NextResponse.json({ error: 'registrationId required' }, { status: 400 })

    const reg = await prisma.studentRegistration.findUnique({ where: { id: registrationId } })
    if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    if (reg.vehicleType !== 'truck') {
      return NextResponse.json({ error: 'Contract emails only apply to truck registrations' }, { status: 400 })
    }

    const recipient = to?.trim() || reg.email?.trim()
    if (!recipient) return NextResponse.json({ error: 'No email on file and none provided' }, { status: 400 })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })

    const invoiceSettings = await prisma.invoiceSettings.findUnique({ where: { id: 'default' } })
    const from = invoiceSettings?.senderEmail?.trim() || 'no-reply@qazidrivingschool.ca'

    // Re-issue the contract PDF via the existing route. Cookie auth is
    // forwarded so the contract route sees the same admin session.
    const origin = new URL(request.url).origin
    const contractUrl = `${origin}/api/register/contract?registrationId=${encodeURIComponent(registrationId)}&lang=both`
    const cookie = request.headers.get('cookie') || ''
    const pdfRes = await fetch(contractUrl, { headers: { cookie } })
    if (!pdfRes.ok) {
      const detail = await pdfRes.text()
      return NextResponse.json({ error: 'Contract PDF generation failed', details: detail }, { status: 500 })
    }
    const buffer = await pdfRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    const filename = `Service-Contract-${(reg.fullName || 'student').replace(/\s+/g, '_')}.pdf`
    const subject = `Your Qazi Driving School Class 1 Service Contract`
    const html = `
      <p>Hello ${reg.fullName || ''},</p>
      <p>Please find your <strong>Class 1 service contract</strong> attached to this email,
      including both English and French versions.</p>
      <p>Keep this document until you obtain your licence — it is required by the SAAQ.</p>
      <p>Thank you,<br>Qazi Driving School</p>
    `

    await sendEmailViaResend(apiKey, {
      from,
      to: [recipient],
      subject,
      html,
      attachments: [{ filename, content: base64 }],
    })

    await prisma.messageLog.create({
      data: {
        type: 'truck-contract',
        to: recipient,
        toName: reg.fullName || '',
        message: `Sent contract ${reg.contractNumber || registrationId}`,
        status: 'sent',
      },
    }).catch(() => {})

    return NextResponse.json({ ok: true, sentTo: recipient })
  } catch (err) {
    console.error('[email-contract] failed:', err)
    return NextResponse.json(
      { error: 'Failed to email contract', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }
}
