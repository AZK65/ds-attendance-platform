import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPrivateMessage, sendMessageToGroup, getWhatsAppState } from '@/lib/whatsapp/client'
import { createTheoryEvent } from '@/lib/teamup'

// Process pending scheduled messages that are due
// This endpoint should be called periodically (e.g., every minute via cron or setInterval)
export async function POST(request: NextRequest) {
  try {
    // Check WhatsApp connection first
    const waState = getWhatsAppState()
    if (!waState.isConnected) {
      console.log('[ScheduledProcessor] WhatsApp not connected, skipping processing')
      return NextResponse.json({ processed: 0, skipped: true, reason: 'WhatsApp not connected' })
    }

    // Recover any messages stuck in 'processing' for more than 5 minutes (server crashed mid-send)
    await prisma.scheduledMessage.updateMany({
      where: {
        status: 'processing',
        scheduledAt: { lte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      data: { status: 'pending' },
    })

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

    // Expire reminders that are more than 2 hours overdue — sending them now would be confusing
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const expired = pendingMessages.filter(m => m.scheduledAt < twoHoursAgo)
    const current = pendingMessages.filter(m => m.scheduledAt >= twoHoursAgo)

    if (expired.length > 0) {
      await prisma.scheduledMessage.updateMany({
        where: { id: { in: expired.map(m => m.id) } },
        data: { status: 'expired', error: 'Skipped — more than 2 hours overdue' },
      })
      console.log(`[ScheduledProcessor] Expired ${expired.length} overdue messages`)
    }

    if (current.length === 0) {
      return NextResponse.json({ processed: 0, expired: expired.length })
    }

    // Immediately mark as 'processing' to prevent duplicate sends from concurrent calls
    await prisma.scheduledMessage.updateMany({
      where: { id: { in: current.map(m => m.id) } },
      data: { status: 'processing' },
    })

    const pendingToProcess = current

    console.log(`[ScheduledProcessor] Processing ${pendingToProcess.length} pending messages`)

    const results: Array<{ id: string; sent: number; failed: number }> = []

    for (const scheduled of pendingToProcess) {
      let sent = 0
      let failed = 0
      const errors: string[] = []

      // Check if this is a group message or individual messages
      if (scheduled.isGroupMessage) {
        // Send to the group
        try {
          await sendMessageToGroup(scheduled.groupId, scheduled.message)
          sent = 1
          console.log(`[ScheduledProcessor] Group message sent to ${scheduled.groupId}`)

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
          const errMsg = error instanceof Error ? error.message : 'Unknown error'
          errors.push(`Group: ${errMsg}`)
          console.error(`[ScheduledProcessor] Group message failed for ${scheduled.groupId}:`, errMsg)

          // Log failure
          await prisma.messageLog.create({
            data: {
              type: 'group-reminder',
              to: scheduled.groupId,
              toName: `Group (Module ${scheduled.moduleNumber || '?'})`,
              message: scheduled.message.slice(0, 500),
              status: 'failed',
              error: errMsg,
            },
          }).catch(() => {})
        }
      } else {
        // Send to individual members
        let memberPhones: string[] = []
        try {
          memberPhones = JSON.parse(scheduled.memberPhones)
        } catch (parseError) {
          console.error(`[ScheduledProcessor] Failed to parse memberPhones for message ${scheduled.id}:`, scheduled.memberPhones)
          errors.push('Invalid memberPhones JSON')
          failed = 1
        }

        if (memberPhones.length === 0 && errors.length === 0) {
          console.warn(`[ScheduledProcessor] No member phones for message ${scheduled.id}, marking as sent (nothing to send)`)
          sent = 1 // Nothing to send, mark as done
        }

        for (const phone of memberPhones) {
          try {
            await sendPrivateMessage(phone, scheduled.message)
            sent++
            console.log(`[ScheduledProcessor] Private message sent to ${phone}`)

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
            const errMsg = error instanceof Error ? error.message : 'Unknown error'
            errors.push(`${phone}: ${errMsg}`)
            console.error(`[ScheduledProcessor] Private message failed for ${phone}:`, errMsg)

            // Log failure
            await prisma.messageLog.create({
              data: {
                type: 'group-reminder',
                to: phone,
                toName: null,
                message: scheduled.message.slice(0, 500),
                status: 'failed',
                error: errMsg,
              },
            }).catch(() => {})
          }

          // Small delay between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
      }

      // Update the scheduled message status
      // If failures were due to detached frame / dead session, reset to 'pending' for retry
      const hasDetachedError = errors.some(e =>
        e.includes('detached') || e.includes('Target closed') || e.includes('Execution context') || e.includes('Protocol error')
      )
      let messageStatus: string
      if (failed > 0 && sent === 0 && hasDetachedError) {
        messageStatus = 'pending' // Retry after WhatsApp reconnects
        console.log(`[ScheduledProcessor] Message ${scheduled.id} failed due to dead frame, resetting to pending for retry`)
      } else {
        messageStatus = failed > 0 && sent === 0 ? 'failed' : 'sent'
      }
      await prisma.scheduledMessage.update({
        where: { id: scheduled.id },
        data: {
          status: messageStatus,
          sentAt: messageStatus === 'pending' ? null : new Date(),
          error: errors.length > 0 ? errors.join('; ') : null
        }
      })
      console.log(`[ScheduledProcessor] Message ${scheduled.id} status: ${messageStatus} (sent: ${sent}, failed: ${failed})`)

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
      processed: pendingToProcess.length,
      expired: expired.length,
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
