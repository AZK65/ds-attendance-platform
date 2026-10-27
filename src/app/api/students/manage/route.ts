import { NextRequest, NextResponse } from 'next/server'
import { createStudent, updateStudent, deleteStudent, type CreateStudentData } from '@/lib/external-db'
import { prisma } from '@/lib/db'
import { findInvoicesForStudent } from '@/lib/invoice-lookup'
import { findBestLocalStudent } from '@/lib/local-student-lookup'
import { phoneLast10 } from '@/lib/student-match'

// POST /api/students/manage — Create a new student in external MySQL DB
export async function POST(request: NextRequest) {
  try {
    const body: CreateStudentData = await request.json()

    // Validate required fields (only name and phone are strictly required)
    if (!body.full_name?.trim()) {
      return NextResponse.json({ error: 'full name is required' }, { status: 400 })
    }
    if (!body.phone_number?.trim()) {
      return NextResponse.json({ error: 'phone number is required' }, { status: 400 })
    }

    // Default optional fields to empty strings for MySQL
    body.permit_number = body.permit_number || ''
    body.dob = body.dob || ''
    body.email = body.email || ''

    // Before creating, check if this student already has data in SQLite
    // (from invoices or prior certificate generation) and merge missing fields
    const phoneDigits = body.phone_number.replace(/\D/g, '')

    try {
      // Check local Student table (populated by invoice saves). Phone last-10
      // or an exact full name — never a substring such as "Deep" inside "Sandeep".
      const localStudent = await findBestLocalStudent({
        phone: body.phone_number,
        name: body.full_name,
      })

      if (localStudent) {
        // Fill in missing fields from the local record
        body.full_address = body.full_address || localStudent.address || ''
        body.city = body.city || localStudent.municipality || ''
        body.postal_code = body.postal_code || localStudent.postalCode || ''
      }

      // Also check invoices for address data if still missing
      if (!body.full_address || !body.city) {
        const [invoice] = await findInvoicesForStudent({
          phone: body.phone_number,
          name: body.full_name,
        })
        if (invoice) {
          body.full_address = body.full_address || invoice.studentAddress || ''
          body.city = body.city || invoice.studentCity || ''
          body.postal_code = body.postal_code || invoice.studentPostalCode || ''
          body.email = body.email || invoice.studentEmail || ''
        }
      }
    } catch {
      // Non-critical — proceed with whatever data we have
    }

    body.full_address = body.full_address || ''
    body.city = body.city || ''
    body.postal_code = body.postal_code || ''

    const result = await createStudent(body)

    // Save/update WhatsApp contact and merge with local Student record
    if (body.phone_number) {
      const phone = phoneDigits
      const jid = `${phone}@c.us`
      await prisma.contact.upsert({
        where: { id: jid },
        update: { name: body.full_name, phone, lastSynced: new Date() },
        create: { id: jid, phone, name: body.full_name },
      }).catch(() => {})

      // Update local Student record with the MySQL data (so they're linked)
      try {
        const existing = await findBestLocalStudent({
          phone: body.phone_number,
          name: body.full_name,
        })
        if (existing) {
          await prisma.student.update({
            where: { id: existing.id },
            data: {
              name: body.full_name,
              phone: existing.phone || phone,
              address: existing.address || body.full_address || null,
              municipality: existing.municipality || body.city || null,
              postalCode: existing.postalCode || body.postal_code || null,
            },
          })
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, studentId: result.insertId })
  } catch (error) {
    console.error('[Students Manage] Create error:', error)
    return NextResponse.json(
      { error: 'Failed to create student', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PUT /api/students/manage — Update an existing student in external MySQL DB
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { student_id, old_phone, ...fields } = body

    if (!student_id) {
      return NextResponse.json(
        { error: 'student_id is required' },
        { status: 400 }
      )
    }

    // Phone changes belong to /api/phone-change. This form must not move
    // group membership off the old WhatsApp contact.
    const requestedPhone = typeof fields.phone_number === 'string' ? fields.phone_number : ''
    const previousPhone = typeof old_phone === 'string' ? old_phone : requestedPhone
    const phoneChangeRequested = Boolean(
      phoneLast10(requestedPhone)
      && phoneLast10(previousPhone)
      && phoneLast10(requestedPhone) !== phoneLast10(previousPhone),
    )
    if (phoneChangeRequested) delete fields.phone_number

    await updateStudent(student_id, fields)

    const contactPhone = phoneChangeRequested ? previousPhone : requestedPhone
    const contactDigits = contactPhone.replace(/\D/g, '')
    if (!phoneChangeRequested && contactDigits && fields.full_name) {
      const jid = `${contactDigits}@c.us`
      await prisma.contact.upsert({
        where: { id: jid },
        update: { name: fields.full_name, lastSynced: new Date() },
        create: { id: jid, phone: contactDigits, name: fields.full_name },
      }).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      ...(phoneChangeRequested ? {
        phoneChangeIgnored: true,
        message: 'Other details were saved. Use Change phone number to update the phone.',
      } : {}),
    })
  } catch (error) {
    console.error('[Students Manage] Update error:', error)
    return NextResponse.json(
      { error: 'Failed to update student', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE /api/students/manage — Delete a student from MySQL and clean up SQLite
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('student_id')
    const phone = searchParams.get('phone')

    if (!studentId) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
    }

    // Delete from MySQL
    await deleteStudent(Number(studentId))

    // Clean up SQLite Contact + GroupMember if phone provided
    if (phone) {
      const cleaned = phone.replace(/\D/g, '')
      const jid = `${cleaned}@c.us`
      await prisma.groupMember.deleteMany({ where: { contactId: jid } }).catch(() => {})
      await prisma.contact.delete({ where: { id: jid } }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Students Manage] Delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete student', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
