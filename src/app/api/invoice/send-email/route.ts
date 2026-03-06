import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')

    // Dynamic import to avoid build-time instantiation error
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send({
      from: `${schoolName} <${senderEmail}>`,
      to: [to],
      subject: `Invoice ${invoiceNumber} - ${schoolName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Invoice ${invoiceNumber}</h2>
          <p>Bonjour ${studentName || ''},</p>
          <p>Please find your invoice <strong>${invoiceNumber}</strong> attached to this email.</p>
          <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
          <br />
          <p>Merci / Thank you,</p>
          <p><strong>${schoolName}</strong></p>
        </div>
      `,
      attachments: [
        {
          filename: `invoice-${invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    })

    if (error) {
      console.error('[Invoice Email] Resend error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to send email' },
        { status: 500 }
      )
    }

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
