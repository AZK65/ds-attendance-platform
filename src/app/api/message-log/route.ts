import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Log a sent message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, to, toName, message, status, error } = body

    if (!type || !to || !message) {
      return NextResponse.json({ error: 'type, to, and message are required' }, { status: 400 })
    }

    const log = await prisma.messageLog.create({
      data: {
        type,
        to,
        toName: toName || null,
        message: message.slice(0, 500),
        status: status || 'sent',
        error: error || null,
      },
    })

    return NextResponse.json({ success: true, id: log.id })
  } catch (error) {
    console.error('Failed to log message:', error)
    return NextResponse.json({ error: 'Failed to log message' }, { status: 500 })
  }
}

// Get message logs + scheduled queue for the notification panel
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') || 'sent' // "sent" or "queue"

    if (tab === 'queue') {
      // Get today's pending scheduled messages
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

      const pending = await prisma.scheduledMessage.findMany({
        where: {
          status: 'pending',
          scheduledAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true,
          message: true,
          scheduledAt: true,
          moduleNumber: true,
          classTime: true,
          isGroupMessage: true,
          groupId: true,
          status: true,
        },
      })

      return NextResponse.json({ messages: pending })
    }

    // Sent tab: recent message logs (last 50)
    const logs = await prisma.messageLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ messages: logs })
  } catch (error) {
    console.error('Failed to fetch message logs:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
