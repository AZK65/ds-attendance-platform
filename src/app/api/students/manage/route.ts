import { NextRequest, NextResponse } from 'next/server'
import { createStudent, updateStudent, deleteStudent, type CreateStudentData } from '@/lib/external-db'
import { prisma } from '@/lib/db'

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
    const phoneSearch = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits

    try {
      // Check local Student table (populated by invoice saves)
      let localStudent = null
      if (phoneSearch.length >= 7) {
        localStudent = await prisma.student.findFirst({
          where: { phone: { contains: phoneSearch } },
        })
      }
      if (!localStudent) {
        localStudent = await prisma.student.findFirst({
          where: { name: { contains: body.full_name } },
        })
      }

      if (localStudent) {
        // Fill in missing fields from the local record
        body.full_address = body.full_address || localStudent.address || ''
        body.city = body.city || localStudent.municipality || ''
        body.postal_code = body.postal_code || localStudent.postalCode || ''
      }

      // Also check invoices for address data if still missing
      if (!body.full_address || !body.city) {
        const invoice = await prisma.invoice.findFirst({
          where: phoneSearch.length >= 7
            ? { studentPhone: { contains: phoneSearch } }
            : { studentName: { contains: body.full_name } },
          orderBy: { createdAt: 'desc' },
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
        const existing = await prisma.student.findFirst({
          where: {
            OR: [
              ...(phoneSearch.length >= 7 ? [{ phone: { contains: phoneSearch } }] : []),
              { name: { contains: body.full_name } },
            ],
          },
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

    await updateStudent(student_id, fields)

    // If phone changed, update SQLite Contact + GroupMember across all groups
    const newPhone = fields.phone_number?.replace(/\D/g, '')
    const oldPhone = old_phone?.replace(/\D/g, '')
    if (newPhone && oldPhone && newPhone !== oldPhone) {
      const oldJid = `${oldPhone}@c.us`
      const newJid = `${newPhone}@c.us`

      // Create/update new contact
      await prisma.contact.upsert({
        where: { id: newJid },
        update: { phone: newPhone, name: fields.full_name || null, lastSynced: new Date() },
        create: { id: newJid, phone: newPhone, name: fields.full_name || null },
      })

      // Move all group memberships from old phone to new phone
      const oldMemberships = await prisma.groupMember.findMany({
        where: { contactId: oldJid },
      })
      for (const membership of oldMemberships) {
        await prisma.groupMember.upsert({
          where: { groupId_contactId: { groupId: membership.groupId, contactId: newJid } },
          update: { phone: newPhone },
          create: { groupId: membership.groupId, contactId: newJid, phone: newPhone },
        })
      }
      // Remove old memberships
      if (oldMemberships.length > 0) {
        await prisma.groupMember.deleteMany({ where: { contactId: oldJid } })
      }
    } else if (newPhone && fields.full_name) {
      // Just update the contact name
      const jid = `${newPhone}@c.us`
      await prisma.contact.upsert({
        where: { id: jid },
        update: { name: fields.full_name, lastSynced: new Date() },
        create: { id: jid, phone: newPhone, name: fields.full_name },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
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
