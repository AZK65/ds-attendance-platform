import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createStudent } from '@/lib/external-db'
import { sendEmailViaResend, getEmailSender } from '@/lib/email'

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

    // Mirror the registration's avatar onto the local Student row so it
    // shows up on every student profile page. Upserts by licenceNumber
    // first (most reliable) and falls back to phone — same matching rule
    // findLocalStudent uses on the read side.
    if (registration.avatarImage) {
      try {
        const licence = (body.permitNumber || registration.permitNumber || '').trim()
        const phoneDigits = (studentData.phone_number || '').replace(/\D/g, '')
        const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits

        let target = null as Awaited<ReturnType<typeof prisma.student.findFirst>>
        if (licence) target = await prisma.student.findFirst({ where: { licenceNumber: licence } })
        if (!target && phoneSuffix.length >= 7) {
          target = await prisma.student.findFirst({ where: { phone: { contains: phoneSuffix } } })
        }

        if (target) {
          await prisma.student.update({
            where: { id: target.id },
            data: { avatarImage: registration.avatarImage },
          })
        } else {
          await prisma.student.create({
            data: {
              name: studentData.full_name || 'Student',
              phone: studentData.phone_number || null,
              email: studentData.email || null,
              licenceNumber: licence || null,
              avatarImage: registration.avatarImage,
            },
          })
        }
      } catch (err) {
        console.error('[Registrations] Avatar mirror to local Student failed:', err)
      }
    }

    // Email the student that their registration is approved. Non-fatal — a
    // mail failure must never block the confirmation itself.
    if (studentData.email) {
      try {
        const sender = await getEmailSender()
        if (sender) {
          const firstName = (studentData.full_name || '').trim().split(/\s+/)[0] || ''
          const courseName = registration.vehicleType === 'truck' ? 'Class 1 (Truck)' : 'Class 5 (Car)'
          await sendEmailViaResend({
            from: sender.from,
            to: [studentData.email],
            subject: `Your registration is confirmed — ${sender.schoolName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color:#0B0B0F;">
                <h2 style="color:#0B0B0F;">You're registered! 🎉</h2>
                <p>Hi ${firstName || 'there'},</p>
                <p>Your registration for the <strong>${courseName}</strong> course at
                   <strong>${sender.schoolName}</strong> has been confirmed. Welcome aboard!</p>
                <p>Our team will be in touch with your class schedule and next steps. If you have any
                   questions in the meantime, just reply to this email.</p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
                <p style="color:#555;">Bonjour ${firstName || ''}, votre inscription au cours
                   <strong>${courseName}</strong> est confirmée. Bienvenue&nbsp;!</p>
                <br/>
                <p>Merci / Thank you,<br/><strong>${sender.schoolName}</strong></p>
              </div>
            `,
          })
          console.log(`[Registrations] Confirmation email sent to ${studentData.email}`)
        } else {
          console.warn('[Registrations] No sender email configured — skipping confirmation email')
        }
      } catch (err) {
        console.error('[Registrations] Confirmation email failed:', err)
      }
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
