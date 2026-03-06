import { NextRequest, NextResponse } from 'next/server'
import { sendDocumentToContact } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, studentName, invoiceNumber, pdfBase64 } = body

    if (!phone || !pdfBase64 || !invoiceNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: phone, pdfBase64, invoiceNumber' },
        { status: 400 }
      )
    }

    // Clean the phone number
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    if (!cleanPhone || cleanPhone.length < 10) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      )
    }

    // Get school name
    const schoolInfo = await prisma.certificateSettings.findUnique({
      where: { id: 'default' }
    })
    const schoolName = schoolInfo?.schoolName || 'École de Conduite Qazi'

    const caption = `📄 Invoice ${invoiceNumber}\n${studentName ? `For: ${studentName}\n` : ''}From: ${schoolName}`

    // Send PDF via WhatsApp
    await sendDocumentToContact(
      cleanPhone,
      pdfBase64,
      `invoice-${invoiceNumber}.pdf`,
      'application/pdf',
      caption
    )

    // Log the message
    await prisma.messageLog.create({
      data: {
        type: 'invoice',
        to: cleanPhone,
        toName: studentName || null,
        message: `Invoice ${invoiceNumber} PDF sent`,
        status: 'sent',
      }
    })

    console.log(`[Invoice WhatsApp] Sent ${invoiceNumber} to ${cleanPhone}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Invoice WhatsApp] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send via WhatsApp' },
      { status: 500 }
    )
  }
}
