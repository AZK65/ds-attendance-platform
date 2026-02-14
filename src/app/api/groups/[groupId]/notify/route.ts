import { NextRequest } from 'next/server'
import { sendPrivateMessage, getGroupParticipants } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'
import { createTheoryEvent } from '@/lib/teamup'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)

  let body: { module: number; time: string; classDate?: string; classDateISO?: string; memberPhones: string[]; message?: string; scheduleGroupReminder?: boolean }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { module: moduleNum, time, classDate, classDateISO, memberPhones, message: customMessage, scheduleGroupReminder } = body

  if (!moduleNum || !time || !memberPhones || memberPhones.length === 0) {
    return new Response(JSON.stringify({ error: 'module, time, and memberPhones are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Build the message
  const dateStr = classDate ? `${classDate} from ` : ''
  const message = customMessage || `Hey! Your Module ${moduleNum} class is scheduled for ${dateStr}${time}. You'll receive another reminder on the day of the class. Please make sure to put your full name when joining Zoom. Invite Link: https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09 — Password: qazi`

  // Get participant names for the log
  let participantMap: Map<string, string> = new Map()
  try {
    const participants = await getGroupParticipants(decodedGroupId)
    for (const p of participants) {
      participantMap.set(p.phone, p.name || p.pushName || p.phone)
    }
  } catch {
    // If we can't get participants, just use phone numbers
  }

  // Stream results using SSE-style newline-delimited JSON
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0
      let failed = 0

      for (const phone of memberPhones) {
        const name = participantMap.get(phone) || phone
        try {
          await sendPrivateMessage(phone, message)
          sent++
          controller.enqueue(encoder.encode(
            JSON.stringify({ phone, name, status: 'sent' }) + '\n'
          ))

          // Log to MessageLog
          await prisma.messageLog.create({
            data: {
              type: 'group-notify',
              to: phone,
              toName: name !== phone ? name : null,
              message: message.slice(0, 500),
              status: 'sent',
            },
          }).catch(() => {})
        } catch (error) {
          failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          controller.enqueue(encoder.encode(
            JSON.stringify({ phone, name, status: 'failed', error: errorMsg }) + '\n'
          ))

          // Log failure
          await prisma.messageLog.create({
            data: {
              type: 'group-notify',
              to: phone,
              toName: name !== phone ? name : null,
              message: message.slice(0, 500),
              status: 'failed',
              error: errorMsg,
            },
          }).catch(() => {})
        }

        // Small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500))
      }

      // Schedule group reminder for 12pm on class date if requested
      let groupReminderScheduled = false
      if (scheduleGroupReminder && classDateISO) {
        try {
          const classDayMessage = `Reminder: Your Module ${moduleNum} class is TODAY at ${time}! Please make sure to put your full name when joining Zoom. Invite Link: https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09 — Password: qazi`

          // Create scheduled date at 12pm on the class day
          // classDateISO is in format "2025-02-10"
          const scheduledDate = new Date(classDateISO + 'T12:00:00')

          // Only schedule if the date is in the future
          if (scheduledDate > new Date()) {
            await prisma.scheduledMessage.create({
              data: {
                groupId: decodedGroupId,
                message: classDayMessage,
                scheduledAt: scheduledDate,
                memberPhones: '[]', // Empty for group messages
                moduleNumber: moduleNum,
                classDateISO: classDateISO,
                classTime: time,
                isGroupMessage: true,
                status: 'pending'
              }
            })
            groupReminderScheduled = true
          }
        } catch (error) {
          console.error('Failed to schedule group reminder:', error)
        }
      }

      // Create Teamup event on Fayyaz's calendar for theory class
      let calendarSynced = false
      if (classDateISO && moduleNum) {
        try {
          const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
          const result = await createTheoryEvent({
            classDate: classDateISO,
            classTime: time,
            moduleNumber: moduleNum,
            groupName: group?.name || 'Unknown Group',
          })
          calendarSynced = result.success
          if (!result.success) {
            console.error('Theory event sync failed:', result.error)
          }
        } catch (error) {
          console.error('Failed to sync theory event to calendar:', error)
        }
      }

      // Send summary
      controller.enqueue(encoder.encode(
        JSON.stringify({
          type: 'summary',
          sent,
          failed,
          total: memberPhones.length,
          groupReminderScheduled,
          groupReminderDate: scheduleGroupReminder && classDateISO ? classDateISO + ' at 12:00 PM' : null,
          calendarSynced,
        }) + '\n'
      ))
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache'
    }
  })
}
