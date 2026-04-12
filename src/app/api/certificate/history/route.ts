import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAllStudents } from '@/lib/external-db'

// GET - list all certificates with student info (SQLite + MySQL)
export async function GET() {
  try {
    // Get SQLite certificates
    const sqliteCerts = await prisma.certificate.findMany({
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

    // Get MySQL students that have contract numbers (certificates from old system)
    let mysqlCerts: Array<{
      id: string
      studentId: string
      certificateType: string
      contractNumber: string | null
      attestationNumber: string | null
      generatedAt: string
      source: string
      student: { id: string; name: string; phone: string | null; licenceNumber: string | null; address: string | null; municipality: string | null; postalCode: string | null }
    }> = []

    try {
      const allStudents = await getAllStudents()
      // Find MySQL students with cert numbers that don't have a matching SQLite cert
      const sqlitePhones = new Set(sqliteCerts.map(c => c.student.phone?.slice(-10)).filter(Boolean))

      for (const s of allStudents) {
        if (!s.contract_number && !s.user_defined_contract_number) continue
        if (s.contract_number === 0 && !s.user_defined_contract_number) continue

        const ph = s.phone_number?.replace(/\D/g, '').slice(-10) || ''
        if (ph && sqlitePhones.has(ph)) continue // Already has SQLite cert

        mysqlCerts.push({
          id: `mysql-${s.student_id}`,
          studentId: String(s.student_id),
          certificateType: 'full',
          contractNumber: s.user_defined_contract_number ? String(s.user_defined_contract_number) : null,
          attestationNumber: s.contract_number ? String(s.contract_number) : null,
          generatedAt: '',
          source: 'mysql',
          student: {
            id: String(s.student_id),
            name: s.full_name,
            phone: s.phone_number,
            licenceNumber: s.permit_number || null,
            address: s.full_address || null,
            municipality: s.city || null,
            postalCode: s.postal_code || null,
          },
        })
      }
    } catch {
      // MySQL unavailable — just show SQLite certs
    }

    const allCerts = [
      ...sqliteCerts.map(c => ({ ...c, source: 'sqlite' as const })),
      ...mysqlCerts,
    ]

    return NextResponse.json({ certificates: allCerts })
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
