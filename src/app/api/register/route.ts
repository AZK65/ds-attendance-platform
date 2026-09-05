import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createRegistrationInvoice } from '@/lib/registration-invoice'
import { getDepositCents } from '@/lib/pricing'
import { sendEmailViaResend, getEmailSender } from '@/lib/email'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'
import { verifyHuman, rejectBot } from '@/lib/bot-guard'
import { makeRegistrationTermsSnapshot, REGISTRATION_TERMS_VERSION } from '@/lib/registration-terms'

// POST /api/register — Public student registration
export async function POST(request: NextRequest) {
  const ip = clientIp(request)

  // This route sends a Resend email to a caller-supplied address and can
  // auto-create an invoice, so it stays tightly capped per IP.
  const limit = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)
  if (!limit.ok) return tooManyRequests(limit.retryAfter)

  try {
    const body = await request.json()

    // Admin-submitted registrations (the iPad/kiosk truck flow) come from a
    // logged-in session and never carry a captcha token — skip the bot layers
    // for them, but keep them for anything from the public form.
    const isAdmin = request.cookies.get('auth-token')?.value === 'valid'
    if (!isAdmin) {
      const verdict = await verifyHuman(
        {
          honeypot: body.company,
          formStartedAt: body.formStartedAt,
          turnstileToken: body.turnstileToken,
        },
        ip,
      )
      if (!verdict.ok) return rejectBot(verdict.reason)
    }

    const {
      fullName, phoneNumber, email, dob,
      address, city, province, postalCode,
      permitNumber, permitExpiry, permitImage, idImage, avatarImage,
      signatureImage, agreedToTerms, termsLanguage, medical,
      idType, // car single-ID type (licence/passport/health/pr/other)
      vehicleType: requestedVehicleType,
      // Truck-only contract fields (ignored when vehicleType="car")
      consentSaaqTransmission, consentFileTransfer, consentContactInfo,
      signedAtPlace, firstCourseDate,
      // Truck-only — rep counter-sign captured at the iPad
      repSignatureDataUrl, repName,
      // Truck-only — 'cash' or 'card'. Stored as a status flag on the row;
      // the actual Clover capture happens on the dedicated checkout route.
      truckPaymentMethod,
      // Truck-only, card only — 'online' (Clover) or 'in-person' (school
      // terminal). In-person is collected like cash but recorded as card.
      cardLocation,
    } = body

    // Only logged-in admins can submit a truck registration. The public
    // /register Truck button is a contact card, not a form, so this only
    // matters if someone tries to forge the request. (`isAdmin` is resolved
    // above, where it also decides whether the bot checks apply.)
    const vehicleType =
      requestedVehicleType === 'truck' && isAdmin ? 'truck' : 'car'

    // Fee collected in person → no Clover, auto-create an unpaid invoice.
    // Cash (car or truck) and truck card-on-terminal are collected in person;
    // only the recorded method differs. Car card = online Clover checkout.
    const inPersonMethod: 'cash' | 'card' | null =
      truckPaymentMethod === 'cash'
        ? 'cash'
        : vehicleType === 'truck' && truckPaymentMethod === 'card' && cardLocation === 'in-person'
          ? 'card'
          : null

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

    // Deposit charged/invoiced today for this class (Settings → Pricing).
    // Was hardcoded to $250, so pricing changes never reached the in-person
    // (cash / card-on-terminal) invoice — the truck path in particular.
    const depositCents = await getDepositCents(vehicleType)

    const acceptedAt = new Date()
    const termsSnapshot = makeRegistrationTermsSnapshot({
      language: termsLanguage,
      vehicleType,
      acceptedAt,
      consentSaaqTransmission,
      consentFileTransfer,
      consentContactInfo,
    })

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
        // Stash the in-person collection decision into the existing
        // paymentStatus shape so the admin review dialog's PaymentStatusBlock
        // surfaces it without new wiring. "cash-pending" / "card-pending" =
        // fee picked but not yet collected at the school.
        ...(inPersonMethod === 'cash'
          ? { paymentStatus: 'cash-pending', paymentAmount: depositCents }
          : inPersonMethod === 'card'
            ? { paymentStatus: 'card-pending', paymentAmount: depositCents }
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
        permitExpiry: permitExpiry?.trim() || null,
        permitImage: permitImage || null,
        idImage: idImage || null,
        avatarImage: avatarImage || null,
        signatureImage: signatureImage || null,
        idType: vehicleType === 'car' ? (idType || null) : null,
        medical: medical ? JSON.stringify(medical) : null,
        termsAcceptedAt: acceptedAt,
        termsVersion: REGISTRATION_TERMS_VERSION,
        termsLanguage: termsSnapshot.language,
        termsSnapshot: JSON.stringify(termsSnapshot),
        source: 'online-registration',
        submittedAt: acceptedAt,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    })

    // They finished, so any "didn't finish" lead we captured mid-form for this
    // number is stale — drop it so nobody calls a student who already signed up.
    // The completed row above carries all the same data.
    await prisma.studentRegistration.deleteMany({
      where: {
        status: 'draft',
        phoneNumber: { contains: phoneDigits.slice(-10) },
      },
    }).catch(() => {})

    // In-person collection → auto-create an unpaid invoice so it shows up in
    // the admin invoice list immediately. Admin marks paid once the fee is
    // physically collected (cash, or card on the school terminal). Card-online
    // uses Clover Hosted Checkout and gets its invoice on capture
    // (see /api/registrations/[id]/capture).
    if (inPersonMethod) {
      try {
        await createRegistrationInvoice({
          registration,
          paymentMethod: inPersonMethod,
          paymentStatus: 'unpaid',
        })
      } catch (err) {
        console.error('[register] in-person auto-invoice failed:', err)
      }
    }

    // Pending-approval email: fires the moment the student submits, so they
    // have a paper trail of what they signed up for while our team reviews.
    // The separate "registration confirmed" email fires later from
    // /api/registrations/[id]/confirm once admin approves. Non-fatal — a
    // mail failure must never block the registration itself.
    if (registration.email) {
      try {
        const sender = await getEmailSender()
        if (sender) {
          const firstName = (registration.fullName || '').trim().split(/\s+/)[0] || ''
          const courseNameEn = vehicleType === 'truck' ? 'Class 1 (Truck)' : 'Class 5 (Car)'
          const courseNameFr = vehicleType === 'truck' ? 'Classe 1 (Camion)' : 'Classe 5 (Auto)'
          const depositDollars = (depositCents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const submittedEn = new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
          const submittedFr = new Date().toLocaleDateString('fr-CA', { month: 'long', day: 'numeric', year: 'numeric' })

          await sendEmailViaResend({
            from: sender.from,
            to: [registration.email],
            subject: `We received your registration — ${sender.schoolName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color:#0B0B0F;">
                <h2 style="color:#0B0B0F;margin-bottom:6px;">Registration received</h2>
                <p style="color:#555;margin-top:0;">Pending approval — usually within 72 hours.</p>

                <p>Hi ${firstName || 'there'},</p>
                <p>Thanks for registering with <strong>${sender.schoolName}</strong>. Our team is reviewing your file and will confirm once your spot is secured. You'll get a second email the moment your registration is approved.</p>

                <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                  <tr><td style="padding:6px 0;color:#777;width:140px;">Program</td><td style="padding:6px 0;"><strong>${courseNameEn}</strong></td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Name</td><td style="padding:6px 0;">${registration.fullName || ''}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Submitted</td><td style="padding:6px 0;">${submittedEn}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Deposit on file</td><td style="padding:6px 0;">$${depositDollars} CAD <span style="color:#777;">(authorized only — no charge until approved)</span></td></tr>
                </table>

                <p style="color:#555;">Questions in the meantime? Just reply to this email, or call us at <strong>(514) 274-6948</strong>.</p>

                <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />

                <h3 style="color:#0B0B0F;margin-bottom:6px;">Inscription reçue</h3>
                <p style="color:#555;margin-top:0;">En attente d'approbation — habituellement dans les 72 heures.</p>

                <p>Bonjour ${firstName || ''},</p>
                <p>Merci pour votre inscription à <strong>${sender.schoolName}</strong>. Notre équipe examine votre dossier et confirmera votre place dès que possible. Vous recevrez un deuxième courriel dès l'approbation.</p>

                <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                  <tr><td style="padding:6px 0;color:#777;width:140px;">Programme</td><td style="padding:6px 0;"><strong>${courseNameFr}</strong></td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Nom</td><td style="padding:6px 0;">${registration.fullName || ''}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Soumis le</td><td style="padding:6px 0;">${submittedFr}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;">Dépôt au dossier</td><td style="padding:6px 0;">${depositDollars} $ CAD <span style="color:#777;">(autorisation seulement — aucun débit avant l'approbation)</span></td></tr>
                </table>

                <p style="color:#555;">Des questions ? Répondez simplement à ce courriel, ou appelez-nous au <strong>(514) 274-6948</strong>.</p>

                <br/>
                <p>Merci / Thank you,<br/><strong>${sender.schoolName}</strong></p>
              </div>
            `,
          })
          console.log(`[register] Pending-approval email sent to ${registration.email}`)
        } else {
          console.warn('[register] No sender email configured — skipping pending-approval email')
        }
      } catch (err) {
        console.error('[register] Pending-approval email failed:', err)
      }
    }

    return NextResponse.json({ success: true, registrationId: registration.id })
  } catch (error) {
    console.error('[Register] Error:', error)
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    )
  }
}
