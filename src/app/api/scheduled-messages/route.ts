import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Create a scheduled message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { groupId, message, scheduledAt, memberPhones, moduleNumber, classDateISO, classTime } = body

    if (!groupId || !message || !scheduledAt || !memberPhones || memberPhones.length === 0) {
      return NextResponse.json(
        { error: 'groupId, message, scheduledAt, and memberPhones are required' },
        { status: 400 }
      )
    }

    const scheduledDate = new Date(scheduledAt)
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      )
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        groupId,
        message,
        scheduledAt: scheduledDate,
        memberPhones: JSON.stringify(memberPhones),
        moduleNumber: moduleNumber || null,
        classDateISO: classDateISO || null,
        classTime: classTime || null,
        status: 'pending'
      }
    })

    return NextResponse.json({
      success: true,
      id: scheduled.id,
      scheduledAt: scheduled.scheduledAt
    })
  } catch (error) {
    console.error('Error scheduling message:', error)
    return NextResponse.json(
      { error: 'Failed to schedule message' },
      { status: 500 }
    )
  }
}

// Get scheduled messages (for viewing/managing)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get('groupId')
    const status = searchParams.get('status')

    const where: { groupId?: string; status?: string } = {}
    if (groupId) where.groupId = groupId
    if (status) where.status = status

    const scheduled = await prisma.scheduledMessage.findMany({
      where,
      orderBy: { scheduledAt: 'asc' }
    })

    return NextResponse.json({
      messages: scheduled.map(s => ({
        ...s,
        memberPhones: JSON.parse(s.memberPhones)
      }))
    })
  } catch (error) {
    console.error('Error fetching scheduled messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scheduled messages' },
      { status: 500 }
    )
  }
}
