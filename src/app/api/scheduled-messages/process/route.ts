import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPrivateMessage, sendMessageToGroup } from '@/lib/whatsapp/client'
import { createTheoryEvent } from '@/lib/teamup'

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
      let sent = 0
      let failed = 0
      const errors: string[] = []

      // Check if this is a group message or individual messages
      if (scheduled.isGroupMessage) {
        // Send to the group
        try {
          await sendMessageToGroup(scheduled.groupId, scheduled.message)
          sent = 1

          // Log to MessageLog
          await prisma.messageLog.create({
            data: {
              type: 'group-reminder',
              to: scheduled.groupId,
              toName: `Group (Module ${scheduled.moduleNumber || '?'})`,
              message: scheduled.message.slice(0, 500),
              status: 'sent',
            },
          }).catch(() => {})
        } catch (error) {
          failed = 1
          errors.push(`Group: ${error instanceof Error ? error.message : 'Unknown error'}`)

          // Log failure
          await prisma.messageLog.create({
            data: {
              type: 'group-reminder',
              to: scheduled.groupId,
              toName: `Group (Module ${scheduled.moduleNumber || '?'})`,
              message: scheduled.message.slice(0, 500),
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          }).catch(() => {})
        }
      } else {
        // Send to individual members
        const memberPhones: string[] = JSON.parse(scheduled.memberPhones)

        for (const phone of memberPhones) {
          try {
            await sendPrivateMessage(phone, scheduled.message)
            sent++

            // Log to MessageLog
            await prisma.messageLog.create({
              data: {
                type: 'group-reminder',
                to: phone,
                toName: null,
                message: scheduled.message.slice(0, 500),
                status: 'sent',
              },
            }).catch(() => {})
          } catch (error) {
            failed++
            errors.push(`${phone}: ${error instanceof Error ? error.message : 'Unknown error'}`)

            // Log failure
            await prisma.messageLog.create({
              data: {
                type: 'group-reminder',
                to: phone,
                toName: null,
                message: scheduled.message.slice(0, 500),
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            }).catch(() => {})
          }

          // Small delay between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
      }

      // Update the scheduled message status
      const messageStatus = failed > 0 && sent === 0 ? 'failed' : 'sent'
      await prisma.scheduledMessage.update({
        where: { id: scheduled.id },
        data: {
          status: messageStatus,
          sentAt: new Date(),
          error: errors.length > 0 ? errors.join('; ') : null
        }
      })

      // Sync theory event to Fayyaz's Teamup calendar if message was sent successfully
      if (messageStatus === 'sent' && scheduled.classDateISO && scheduled.moduleNumber && scheduled.classTime) {
        try {
          const group = await prisma.group.findUnique({ where: { id: scheduled.groupId } })
          await createTheoryEvent({
            classDate: scheduled.classDateISO,
            classTime: scheduled.classTime,
            moduleNumber: scheduled.moduleNumber,
            groupName: group?.name || 'Unknown Group',
          })
        } catch (error) {
          console.error('Failed to sync theory event to calendar:', error)
        }
      }

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
