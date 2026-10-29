import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { emailLogoAttachment } from '@/lib/brand-assets'
import { invoiceEmailHtml } from '@/lib/document-emails'

// Use Resend REST API directly to avoid SDK build-time instantiation issues
async function sendEmailViaResend(apiKey: string, payload: {
  from: string
  to: string[]
  subject: string
  html: string
  attachments: { filename: string; content: string; content_id?: string }[]
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message || data.error || 'Resend API error')
  }

  return data
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, studentName, invoiceNumber, pdfBase64 } = body

    if (!to || !pdfBase64 || !invoiceNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: to, pdfBase64, invoiceNumber' },
        { status: 400 }
      )
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY environment variable is not set' },
        { status: 500 }
      )
    }

    // Get sender email from settings
    const settings = await prisma.invoiceSettings.findUnique({
      where: { id: 'default' }
    })

    const senderEmail = settings?.senderEmail
    if (!senderEmail) {
      return NextResponse.json(
        { error: 'Sender email not configured. Go to Invoice Settings to set it up.' },
        { status: 400 }
      )
    }

    // Also get school name from certificate settings
    const schoolInfo = await prisma.certificateSettings.findUnique({
      where: { id: 'default' }
    })
    const schoolName = schoolInfo?.schoolName || 'École de Conduite Qazi'

    const data = await sendEmailViaResend(apiKey, {
      from: `${schoolName} <${senderEmail}>`,
      to: [to],
      subject: `Invoice ${invoiceNumber} - ${schoolName}`,
      html: invoiceEmailHtml({ studentName, invoiceNumber, schoolName }),
      attachments: [
        emailLogoAttachment(),
        {
          filename: `invoice-${invoiceNumber}.pdf`,
          content: pdfBase64,
        },
      ],
    })

    console.log(`[Invoice Email] Sent ${invoiceNumber} to ${to}, id: ${data?.id}`)

    return NextResponse.json({ success: true, emailId: data?.id })
  } catch (error) {
    console.error('[Invoice Email] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    )
  }
}
