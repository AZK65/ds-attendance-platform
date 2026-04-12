import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - list all certificates with student info
export async function GET() {
  try {
    const certificates = await prisma.certificate.findMany({
      include: {
        student: {
          select: {
            id: true, name: true, phone: true, licenceNumber: true,
            address: true, municipality: true, postalCode: true,
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
    })

    return NextResponse.json({ certificates })
  } catch (error) {
    console.error('Error fetching certificate history:', error)
    return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
  }
}

// PUT - update a certificate's numbers
export async function PUT(request: NextRequest) {
  try {
    const { certificateId, contractNumber, attestationNumber } = await request.json()

    if (!certificateId) {
      return NextResponse.json({ error: 'certificateId is required' }, { status: 400 })
    }

    const updated = await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        ...(contractNumber !== undefined ? { contractNumber } : {}),
        ...(attestationNumber !== undefined ? { attestationNumber: attestationNumber?.replace(/\s+/g, '') || null } : {}),
      },
    })

    return NextResponse.json({ certificate: updated })
  } catch (error) {
    console.error('Error updating certificate:', error)
    return NextResponse.json({ error: 'Failed to update certificate' }, { status: 500 })
  }
}

// DELETE - delete a certificate record
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await prisma.certificate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting certificate:', error)
    return NextResponse.json({ error: 'Failed to delete certificate' }, { status: 500 })
  }
}
