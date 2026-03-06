import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/enroll/[token] — Public: check registration status for the enrollment form
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const registration = await prisma.studentRegistration.findUnique({
      where: { id: token },
    })

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    // Check expiry for pending_scan
    if (registration.status === 'pending_scan' && registration.expiresAt < new Date()) {
      await prisma.studentRegistration.update({
        where: { id: token },
        data: { status: 'expired' },
      })
      return NextResponse.json({ error: 'This registration link has expired' }, { status: 410 })
    }

    if (registration.status === 'expired') {
      return NextResponse.json({ error: 'This registration link has expired' }, { status: 410 })
    }

    // Return status — the frontend will show the form or a "submitted" message
    return NextResponse.json({
      status: registration.status,
      submittedAt: registration.submittedAt,
    })
  } catch (error) {
    console.error('[Enroll] GET error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}

// PUT /api/enroll/[token] — Public: student submits form data
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()

    const registration = await prisma.studentRegistration.findUnique({
      where: { id: token },
    })

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    if (registration.status !== 'pending_scan') {
      return NextResponse.json(
        { error: 'This form has already been submitted' },
        { status: 400 }
      )
    }

    if (registration.expiresAt < new Date()) {
      await prisma.studentRegistration.update({
        where: { id: token },
        data: { status: 'expired' },
      })
      return NextResponse.json({ error: 'This registration link has expired' }, { status: 410 })
    }

    // Validate required fields
    const required = ['fullName', 'phoneNumber', 'permitNumber', 'fullAddress', 'city', 'postalCode', 'dob', 'email'] as const
    for (const field of required) {
      if (!body[field]?.trim()) {
        const label = field.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
        return NextResponse.json(
          { error: `${label} is required` },
          { status: 400 }
        )
      }
    }

    // Update registration with submitted data
    await prisma.studentRegistration.update({
      where: { id: token },
      data: {
        status: 'submitted',
        fullName: body.fullName.trim(),
        phoneNumber: body.phoneNumber.trim(),
        permitNumber: body.permitNumber.trim(),
        fullAddress: body.fullAddress.trim(),
        city: body.city.trim(),
        postalCode: body.postalCode.trim(),
        dob: body.dob.trim(),
        email: body.email.trim(),
        submittedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Enroll] PUT error:', error)
    return NextResponse.json(
      { error: 'Failed to submit registration' },
      { status: 500 }
    )
  }
}
