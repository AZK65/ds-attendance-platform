import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/register — Public student registration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      fullName, phoneNumber, email, dob,
      address, city, province, postalCode,
      permitNumber, permitImage, idImage,
      signatureImage, agreedToTerms,
    } = body

    if (!fullName?.trim() || !phoneNumber?.trim()) {
      return NextResponse.json({ error: 'Name and phone number are required' }, { status: 400 })
    }

    if (!agreedToTerms) {
      return NextResponse.json({ error: 'You must agree to the terms' }, { status: 400 })
    }

    // Check for duplicate phone number
    const phoneDigits = phoneNumber.replace(/\D/g, '')
    if (phoneDigits.length >= 7) {
      const existing = await prisma.studentRegistration.findFirst({
        where: {
          phoneNumber: { contains: phoneDigits.slice(-10) },
          status: { in: ['submitted', 'confirmed'] },
        },
      })
      if (existing) {
        return NextResponse.json({ error: 'A registration with this phone number already exists' }, { status: 409 })
      }
    }

    const registration = await prisma.studentRegistration.create({
      data: {
        status: 'submitted',
        fullName: fullName.trim(),
        phoneNumber: phoneDigits.length === 10 ? '1' + phoneDigits : phoneDigits,
        email: email?.trim() || null,
        dob: dob || null,
        fullAddress: address?.trim() || null,
        city: city?.trim() || null,
        province: province?.trim() || 'QC',
        postalCode: postalCode?.trim() || null,
        permitNumber: permitNumber?.trim() || null,
        permitImage: permitImage || null,
        idImage: idImage || null,
        signatureImage: signatureImage || null,
        source: 'online-registration',
        submittedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    })

    return NextResponse.json({ success: true, registrationId: registration.id })
  } catch (error) {
    console.error('[Register] Error:', error)
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    )
  }
}
