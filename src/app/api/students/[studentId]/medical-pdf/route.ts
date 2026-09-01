import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStudentById } from '@/lib/external-db'
import { buildMedicalDeclarationPdf } from '@/lib/medical-pdf'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await params
  const id = Number.parseInt(studentId, 10)
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const dbStudent = await getStudentById(id)
  if (!dbStudent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = dbStudent.phone_number?.replace(/\D/g, '') || ''
  const phoneSearch = phone.length > 10 ? phone.slice(-10) : phone
  const registration = await prisma.studentRegistration.findFirst({
    where: {
      OR: [
        { externalId: id },
        ...(phoneSearch.length >= 7 ? [{ phoneNumber: { contains: phoneSearch } }] : []),
      ],
      status: { in: ['confirmed', 'submitted'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!registration?.medical) {
    return NextResponse.json({ error: 'No medical declaration found' }, { status: 404 })
  }

  const pdfBytes = await buildMedicalDeclarationPdf({
    fullName: dbStudent.full_name || registration.fullName || `Student ${id}`,
    dateOfBirth: dbStudent.dob || registration.dob,
    phone: dbStudent.phone_number || registration.phoneNumber,
    permitNumber: dbStudent.permit_number || registration.permitNumber,
    address: dbStudent.full_address || registration.fullAddress,
    city: dbStudent.city || registration.city,
    province: registration.province || 'QC',
    postalCode: dbStudent.postal_code || registration.postalCode,
    medical: registration.medical,
    signatureImage: registration.signatureImage,
  })

  const safeName = (dbStudent.full_name || `student-${id}`).replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="medical-${safeName}-${id}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
