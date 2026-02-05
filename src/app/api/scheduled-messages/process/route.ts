import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPrivateMessage } from '@/lib/whatsapp/client'

// Process pending scheduled messages that are due
// This endpoint should be called periodically (e.g., every minute via cron or setInterval)
export async function POST(request: NextRequest) {
  try {
    // Find all pending messages that are due (scheduledAt <= now)
    const pendingMessages = await prisma.scheduledMessage.findMany({
      where: {
        status: 'pending',
        scheduledAt: {
          lte: new Date()
        }
      }
    })

    if (pendingMessages.length === 0) {
      return NextResponse.json({ processed: 0 })
    }

    const results: Array<{ id: string; sent: number; failed: number }> = []

    for (const scheduled of pendingMessages) {
      const memberPhones: string[] = JSON.parse(scheduled.memberPhones)
      let sent = 0
      let failed = 0
      const errors: string[] = []

      for (const phone of memberPhones) {
        try {
          await sendPrivateMessage(phone, scheduled.message)
          sent++
        } catch (error) {
          failed++
          errors.push(`${phone}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }

        // Small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500))
      }

      // Update the scheduled message status
      await prisma.scheduledMessage.update({
        where: { id: scheduled.id },
        data: {
          status: failed === memberPhones.length ? 'failed' : 'sent',
          sentAt: new Date(),
          error: errors.length > 0 ? errors.join('; ') : null
        }
      })

      results.push({ id: scheduled.id, sent, failed })
    }

    return NextResponse.json({
      processed: pendingMessages.length,
      results
    })
  } catch (error) {
    console.error('Error processing scheduled messages:', error)
    return NextResponse.json(
      { error: 'Failed to process scheduled messages' },
      { status: 500 }
    )
  }
}

// GET to check status of pending messages
export async function GET() {
  try {
    const pending = await prisma.scheduledMessage.count({
      where: { status: 'pending' }
    })

    const nextUp = await prisma.scheduledMessage.findFirst({
      where: { status: 'pending' },
      orderBy: { scheduledAt: 'asc' }
    })

    return NextResponse.json({
      pendingCount: pending,
      nextScheduled: nextUp ? {
        id: nextUp.id,
        scheduledAt: nextUp.scheduledAt,
        moduleNumber: nextUp.moduleNumber
      } : null
    })
  } catch (error) {
    console.error('Error checking scheduled messages:', error)
    return NextResponse.json(
      { error: 'Failed to check scheduled messages' },
      { status: 500 }
    )
  }
}
