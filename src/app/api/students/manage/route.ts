import { NextRequest, NextResponse } from 'next/server'
import { createStudent, updateStudent, deleteStudent, type CreateStudentData } from '@/lib/external-db'
import { prisma } from '@/lib/db'

// POST /api/students/manage — Create a new student in external MySQL DB
export async function POST(request: NextRequest) {
  try {
    const body: CreateStudentData = await request.json()

    // Validate required fields
    const required: (keyof CreateStudentData)[] = [
      'full_name', 'phone_number', 'full_address',
      'city', 'postal_code', 'dob', 'email',
    ]
    for (const field of required) {
      if (!body[field]?.trim()) {
        return NextResponse.json(
          { error: `${field.replace(/_/g, ' ')} is required` },
          { status: 400 }
        )
      }
    }

    const result = await createStudent(body)

    // Save as WhatsApp contact so they show up in searches
    if (body.phone_number) {
      const phone = body.phone_number.replace(/\D/g, '')
      const jid = `${phone}@c.us`
      await prisma.contact.upsert({
        where: { id: jid },
        update: { name: body.full_name, phone, lastSynced: new Date() },
        create: { id: jid, phone, name: body.full_name },
      }).catch(() => {})
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
