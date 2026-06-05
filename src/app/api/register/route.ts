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
      signatureImage, agreedToTerms, medical,
      vehicleType: requestedVehicleType,
      // Truck-only contract fields (ignored when vehicleType="car")
      consentSaaqTransmission, consentFileTransfer, consentContactInfo,
      signedAtPlace, firstCourseDate,
      // Truck-only — rep counter-sign captured at the iPad
      repSignatureDataUrl, repName,
      // Truck-only — 'cash' or 'card'. Stored as a status flag on the row;
      // the actual Clover capture happens on the dedicated checkout route.
      truckPaymentMethod,
    } = body

    // Only logged-in admins can submit a truck registration. The public
    // /register Truck button is a contact card, not a form, so this only
    // matters if someone tries to forge the request.
    const isAdmin = request.cookies.get('auth-token')?.value === 'valid'
    const vehicleType =
      requestedVehicleType === 'truck' && isAdmin ? 'truck' : 'car'

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

    // Truck submissions require the 3 SAAQ consents + signed-at + first
    // course date. Compute the +18m maximum completion date server-side
    // so it can't be tampered with on the client.
    let computedMaxDate: string | null = null
    if (vehicleType === 'truck') {
      if (!consentSaaqTransmission || !consentFileTransfer || !consentContactInfo) {
        return NextResponse.json(
          { error: 'All three SAAQ consents are required for truck registration' },
          { status: 400 }
        )
      }
      if (!signedAtPlace?.trim()) {
        return NextResponse.json({ error: 'Signed-at place is required' }, { status: 400 })
      }
      if (!firstCourseDate?.trim()) {
        return NextResponse.json({ error: 'First course date is required' }, { status: 400 })
      }
      try {
        const [y, m, d] = firstCourseDate.split('-').map(Number)
        const max = new Date(y, m - 1, d)
        max.setMonth(max.getMonth() + 18)
        computedMaxDate = `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, '0')}-${String(max.getDate()).padStart(2, '0')}`
      } catch { /* leave null */ }
    }

    const registration = await prisma.studentRegistration.create({
      data: {
        status: 'submitted',
        vehicleType,
        consentSaaqTransmission: vehicleType === 'truck' ? !!consentSaaqTransmission : false,
        consentFileTransfer: vehicleType === 'truck' ? !!consentFileTransfer : false,
        consentContactInfo: vehicleType === 'truck' ? !!consentContactInfo : false,
        signedAtPlace: vehicleType === 'truck' ? (signedAtPlace?.trim() || null) : null,
        firstCourseDate: vehicleType === 'truck' ? (firstCourseDate?.trim() || null) : null,
        maxCompletionDate: vehicleType === 'truck' ? computedMaxDate : null,
        // Rep signature is captured at the iPad on the truck path. We store
        // it under the same field admin-side counter-signing uses so the
        // PDF generator already sees it without extra branching.
        repSignatureImage:
          vehicleType === 'truck' && typeof repSignatureDataUrl === 'string' && repSignatureDataUrl.startsWith('data:image/')
            ? repSignatureDataUrl
            : null,
        repSignerName:
          vehicleType === 'truck' && typeof repName === 'string' && repName.trim().length > 0
            ? repName.trim()
            : null,
        repSignedAt: vehicleType === 'truck' && typeof repSignatureDataUrl === 'string' ? new Date() : null,
        // Stash the cash/card decision into the existing paymentStatus
        // shape so the admin review dialog's PaymentStatusBlock surfaces
        // it without new wiring. "cash-pending" = student picked cash and
        // the cash hasn't been collected yet.
        ...(vehicleType === 'truck' && truckPaymentMethod === 'cash'
          ? { paymentStatus: 'cash-pending', paymentAmount: 25000 }
          : {}),
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
        medical: medical ? JSON.stringify(medical) : null,
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
