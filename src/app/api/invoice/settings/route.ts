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

    return NextResponse.json({
      ...settings,
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

    const settings = await prisma.invoiceSettings.upsert({
      where: { id: 'default' },
      update: {
        nextInvoiceNumber: body.nextInvoiceNumber,
        invoicePrefix: body.invoicePrefix,
        defaultGstRate: body.defaultGstRate,
        defaultQstRate: body.defaultQstRate,
        taxesEnabled: body.taxesEnabled,
        notes: body.notes,
      },
      create: {
        id: 'default',
        nextInvoiceNumber: body.nextInvoiceNumber || 1,
        invoicePrefix: body.invoicePrefix || 'INV',
        defaultGstRate: body.defaultGstRate ?? 5.0,
        defaultQstRate: body.defaultQstRate ?? 9.975,
        taxesEnabled: body.taxesEnabled ?? true,
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
