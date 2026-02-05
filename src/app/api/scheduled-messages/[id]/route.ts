import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Get a specific scheduled message
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const scheduled = await prisma.scheduledMessage.findUnique({
      where: { id }
    })

    if (!scheduled) {
      return NextResponse.json(
        { error: 'Scheduled message not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...scheduled,
      memberPhones: JSON.parse(scheduled.memberPhones)
    })
  } catch (error) {
    console.error('Error fetching scheduled message:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scheduled message' },
      { status: 500 }
    )
  }
}

// Cancel a scheduled message
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const scheduled = await prisma.scheduledMessage.findUnique({
      where: { id }
    })

    if (!scheduled) {
      return NextResponse.json(
        { error: 'Scheduled message not found' },
        { status: 404 }
      )
    }

    if (scheduled.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only cancel pending messages' },
        { status: 400 }
      )
    }

    await prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'cancelled' }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error cancelling scheduled message:', error)
    return NextResponse.json(
      { error: 'Failed to cancel scheduled message' },
      { status: 500 }
    )
  }
}
