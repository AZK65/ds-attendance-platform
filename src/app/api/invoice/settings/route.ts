import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET invoice settings (merged with school info from CertificateSettings)
export async function GET() {
  try {
    let settings = await prisma.invoiceSettings.findUnique({
      where: { id: 'default' }
    })

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.invoiceSettings.create({
        data: { id: 'default' }
      })
    }

    // Also fetch school info from CertificateSettings (shared source)
    let schoolInfo = await prisma.certificateSettings.findUnique({
      where: { id: 'default' }
    })

    if (!schoolInfo) {
      schoolInfo = await prisma.certificateSettings.create({
        data: { id: 'default' }
      })
    }

    // Mask sensitive tokens for the frontend — only show last 4 chars
    const maskedToken = settings.cloverApiToken
      ? '•'.repeat(Math.max(0, settings.cloverApiToken.length - 4)) + settings.cloverApiToken.slice(-4)
      : ''

    return NextResponse.json({
      ...settings,
      cloverApiToken: maskedToken,
      // Tell frontend whether Clover is actually configured (token exists in DB)
      cloverConfigured: !!(settings.cloverMerchantId && settings.cloverApiToken),
      schoolName: schoolInfo.schoolName,
      schoolAddress: schoolInfo.schoolAddress,
      schoolCity: schoolInfo.schoolCity,
      schoolProvince: schoolInfo.schoolProvince,
      schoolPostalCode: schoolInfo.schoolPostalCode,
      schoolNumber: schoolInfo.schoolNumber,
    })
  } catch (error) {
    console.error('Error fetching invoice settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

// PUT - update invoice settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    // Don't overwrite cloverApiToken with masked value (contains •)
    const isMaskedToken = body.cloverApiToken && body.cloverApiToken.includes('•')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      nextInvoiceNumber: body.nextInvoiceNumber,
      invoicePrefix: body.invoicePrefix,
      defaultGstRate: body.defaultGstRate,
      defaultQstRate: body.defaultQstRate,
      gstNumber: body.gstNumber,
      qstNumber: body.qstNumber,
      taxesEnabled: body.taxesEnabled,
      senderEmail: body.senderEmail,
      cloverMerchantId: body.cloverMerchantId,
      notes: body.notes,
    }
    // Only update token if it's a real new value (not the masked placeholder)
    if (!isMaskedToken && body.cloverApiToken !== undefined) {
      updateData.cloverApiToken = body.cloverApiToken
    }

    const settings = await prisma.invoiceSettings.upsert({
      where: { id: 'default' },
      update: updateData,
      create: {
        id: 'default',
        nextInvoiceNumber: body.nextInvoiceNumber || 1,
        invoicePrefix: body.invoicePrefix || 'INV',
        defaultGstRate: body.defaultGstRate ?? 5.0,
        defaultQstRate: body.defaultQstRate ?? 9.975,
        gstNumber: body.gstNumber || '',
        qstNumber: body.qstNumber || '',
        taxesEnabled: body.taxesEnabled ?? true,
        senderEmail: body.senderEmail || '',
        cloverMerchantId: body.cloverMerchantId || '',
        cloverApiToken: isMaskedToken ? '' : (body.cloverApiToken || ''),
        notes: body.notes || 'Merci pour votre confiance! / Thank you for your business!',
      }
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating invoice settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
