import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildSignatureAttendancePdf } from '@/lib/signature-attendance-pdf'

// GET /api/scheduling/signature/pdf?phone=...
// Produces a vehicle-aware attendance booklet. Class 5 keeps the SAAQ
// phase layout; Class 1 is split into its 75 h theory and 50 h practical
// blocks so truck students never receive a car curriculum document.
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone') || ''
  if (!phone) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 })
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits
  if (phoneSuffix.length < 7) {
    return NextResponse.json({ error: 'phone too short' }, { status: 400 })
  }

  const [signatures, truckRegistration, truckMembership] = await Promise.all([
    prisma.classSignature.findMany({
      where: { studentPhone: { contains: phoneSuffix } },
      orderBy: { signedAt: 'asc' },
    }),
    prisma.studentRegistration.findFirst({
      where: {
        phoneNumber: { contains: phoneSuffix },
        vehicleType: 'truck',
        status: { in: ['confirmed', 'submitted'] },
      },
      select: { id: true },
    }),
    prisma.groupMember.findFirst({
      where: {
        phone: { contains: phoneSuffix },
        group: { vehicleType: 'truck' },
      },
      select: { id: true },
    }),
  ])

  const isTruck = Boolean(
    truckRegistration ||
    truckMembership ||
    signatures.some(signature => /^Class 1|^Truck (?:Class|Exam)/i.test(signature.sessionLabel || ''))
  )
  const studentName = signatures[0]?.studentName || ''
  const pdfBuffer = await buildSignatureAttendancePdf({
    signatures,
    studentName,
    phone,
    isTruck,
  })

  const safeName = studentName.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-')
  const prefix = isTruck ? 'class-1-attendance' : 'attendance'
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${prefix}-${safeName}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
