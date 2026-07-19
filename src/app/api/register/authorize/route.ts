import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createAuthorization } from '@/lib/clover'
import { getDepositCents } from '@/lib/pricing'

/**
 * POST /api/register/authorize
 *
 * Called by the marketing-site payment step. Body: { registrationId, sourceToken }.
 *
 * Creates an UNCAPTURED Clover charge for the class's configured deposit
 * (Settings → Pricing; defaults to $250). Funds are reserved on the student's
 * card; the admin reviews the registration and decides to capture (charge) or
 * void (release).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { registrationId, sourceToken } = body as { registrationId?: string; sourceToken?: string }

    if (!registrationId || !sourceToken) {
      return NextResponse.json({ error: 'registrationId and sourceToken are required' }, { status: 400 })
    }

    const registration = await prisma.studentRegistration.findUnique({ where: { id: registrationId } })
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    // Idempotency — if an auth already succeeded, don't double-charge.
    if (registration.paymentStatus === 'authorized' || registration.paymentStatus === 'captured') {
      return NextResponse.json({ success: true, alreadyAuthorized: true, status: registration.paymentStatus })
    }

    // Configured deposit for this class (Class 1 truck vs Class 5 car).
    const amountCents = await getDepositCents(registration.vehicleType)
    const classLabel = registration.vehicleType === 'truck' ? 'Class 1' : 'Class 5'

    const auth = await createAuthorization({
      sourceToken,
      amountCents,
      description: `${classLabel} first payment — ${registration.fullName || registration.id}`,
      email: registration.email || undefined,
      metadata: { registrationId },
    })

    if (!auth.ok) {
      await prisma.studentRegistration.update({
        where: { id: registrationId },
        data: { paymentStatus: 'failed', paymentError: auth.error.slice(0, 500) },
      })
      return NextResponse.json({ error: auth.error }, { status: 402 })
    }

    await prisma.studentRegistration.update({
      where: { id: registrationId },
      data: {
        paymentChargeId: auth.chargeId,
        paymentStatus: 'authorized',
        paymentLast4: auth.last4,
        paymentBrand: auth.brand,
        paymentAmount: amountCents,
        paymentAuthorizedAt: new Date(),
        paymentError: null,
      },
    })

    return NextResponse.json({ success: true, status: 'authorized' })
  } catch (error) {
    console.error('[Register Authorize] Error:', error)
    return NextResponse.json(
      { error: 'Authorization failed. Please try again.' },
      { status: 500 },
    )
  }
}
