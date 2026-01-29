import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET certificate settings
export async function GET() {
  try {
    let settings = await prisma.certificateSettings.findUnique({
      where: { id: 'default' }
    })

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.certificateSettings.create({
        data: { id: 'default' }
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching certificate settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

// PUT - update certificate settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    const settings = await prisma.certificateSettings.upsert({
      where: { id: 'default' },
      update: {
        nextContractNumber: body.nextContractNumber,
        nextAttestationNumber: body.nextAttestationNumber,
        attestationNumberEnd: body.attestationNumberEnd,
        schoolName: body.schoolName,
        schoolAddress: body.schoolAddress,
        schoolCity: body.schoolCity,
        schoolProvince: body.schoolProvince,
        schoolPostalCode: body.schoolPostalCode,
        schoolNumber: body.schoolNumber,
      },
      create: {
        id: 'default',
        nextContractNumber: body.nextContractNumber || 1,
        nextAttestationNumber: body.nextAttestationNumber || 1,
        attestationNumberEnd: body.attestationNumberEnd || 9999,
        schoolName: body.schoolName || 'École de Conduite Qazi',
        schoolAddress: body.schoolAddress || '786 rue Jean-Talon Ouest',
        schoolCity: body.schoolCity || 'Montréal',
        schoolProvince: body.schoolProvince || 'QC',
        schoolPostalCode: body.schoolPostalCode || 'H3N 1S2',
        schoolNumber: body.schoolNumber || 'L526',
      }
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating certificate settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
