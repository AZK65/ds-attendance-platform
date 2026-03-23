import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createStudent } from '@/lib/external-db'

// POST /api/registrations/[id]/confirm — Admin confirms a submitted registration → writes to MySQL
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const registration = await prisma.studentRegistration.findUnique({ where: { id } })
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    if (registration.status !== 'submitted') {
      return NextResponse.json(
        { error: 'Can only confirm submitted registrations' },
        { status: 400 }
      )
    }

    // Admin may have edited fields — use provided overrides or fall back to stored values
    const studentData = {
      full_name: body.fullName || registration.fullName || '',
      phone_number: body.phoneNumber || registration.phoneNumber || '',
      permit_number: body.permitNumber || registration.permitNumber || '',
      full_address: body.fullAddress || registration.fullAddress || '',
      city: body.city || registration.city || '',
      postal_code: body.postalCode || registration.postalCode || '',
      dob: body.dob || registration.dob || '',
      email: body.email || registration.email || '',
    }

    // Write to external MySQL database
    const result = await createStudent(studentData)

    // Update local registration record
    await prisma.studentRegistration.update({
      where: { id },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
        externalId: result.insertId,
        // Persist any admin edits
        ...(body.fullName && { fullName: body.fullName }),
        ...(body.phoneNumber && { phoneNumber: body.phoneNumber }),
        ...(body.permitNumber && { permitNumber: body.permitNumber }),
        ...(body.fullAddress && { fullAddress: body.fullAddress }),
        ...(body.city && { city: body.city }),
        ...(body.postalCode && { postalCode: body.postalCode }),
        ...(body.dob && { dob: body.dob }),
        ...(body.email && { email: body.email }),
      },
    })

    // Save as WhatsApp contact so they show up in searches
    if (studentData.phone_number) {
      const phone = studentData.phone_number.replace(/\D/g, '')
      const jid = `${phone}@c.us`
      await prisma.contact.upsert({
        where: { id: jid },
        update: { name: studentData.full_name, phone, lastSynced: new Date() },
        create: { id: jid, phone, name: studentData.full_name },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, studentId: result.insertId })
  } catch (error) {
    console.error('[Registrations] Confirm error:', error)
    return NextResponse.json(
      { error: 'Failed to confirm registration', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
