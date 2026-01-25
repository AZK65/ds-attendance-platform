import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const groupId = searchParams.get('groupId')

  if (!groupId) {
    return NextResponse.json(
      { error: 'groupId is required' },
      { status: 400 }
    )
  }

  try {
    let sheet = await prisma.attendanceSheet.findUnique({
      where: { groupId },
      include: {
        records: {
          include: { contact: true },
          orderBy: { contact: { phone: 'asc' } }
        },
        group: true
      }
    })

    if (!sheet) {
      const group = await prisma.group.findUnique({ where: { id: groupId } })

      if (!group) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 })
      }

      sheet = await prisma.attendanceSheet.create({
        data: {
          groupId,
          name: group.name
        },
        include: {
          records: {
            include: { contact: true }
          },
          group: true
        }
      })
    }

    return NextResponse.json({ sheet })
  } catch (error) {
    console.error('Get attendance error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch attendance' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { recordId, status, notes } = body

    const record = await prisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes })
      },
      include: { contact: true }
    })

    return NextResponse.json({ record })
  } catch (error) {
    console.error('Update attendance error:', error)
    return NextResponse.json(
      { error: 'Failed to update attendance' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { groupId, contactId, status = 'absent', notes } = body

    let sheet = await prisma.attendanceSheet.findUnique({
      where: { groupId }
    })

    if (!sheet) {
      const group = await prisma.group.findUnique({ where: { id: groupId } })
      sheet = await prisma.attendanceSheet.create({
        data: {
          groupId,
          name: group?.name || 'Attendance Sheet'
        }
      })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const record = await prisma.attendanceRecord.upsert({
      where: {
        attendanceSheetId_contactId_date: {
          attendanceSheetId: sheet.id,
          contactId,
          date: today
        }
      },
      update: { status, notes },
      create: {
        attendanceSheetId: sheet.id,
        contactId,
        status,
        notes,
        date: today
      },
      include: { contact: true }
    })

    return NextResponse.json({ record })
  } catch (error) {
    console.error('Create attendance error:', error)
    return NextResponse.json(
      { error: 'Failed to create attendance record' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { recordId } = body

    await prisma.attendanceRecord.delete({
      where: { id: recordId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete attendance error:', error)
    return NextResponse.json(
      { error: 'Failed to delete attendance record' },
      { status: 500 }
    )
  }
}
