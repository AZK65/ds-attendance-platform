import { NextRequest } from 'next/server'
import { sendPrivateMessage, getGroupParticipants, getWhatsAppState } from '@/lib/whatsapp/client'
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
      const skipped: string[] = []

      // Gentler pacing than a fixed 1.5s — 2–3.2s with jitter looks less
      // bot-like and eases the Chromium/WhatsApp load that triggers the
      // frame errors during a big broadcast.
      const pace = () => new Promise(resolve => setTimeout(resolve, 2000 + Math.floor(Math.random() * 1200)))

      // Send one message + log it. Shared by the main pass and the retry pass.
      const sendOne = async (phone: string, name: string, isRetry: boolean) => {
        try {
          await sendPrivateMessage(phone, message)
          sent++
          controller.enqueue(encoder.encode(
            JSON.stringify({ phone, name, status: 'sent', retry: isRetry }) + '\n'
          ))
          await prisma.messageLog.create({
            data: { type: 'group-notify', to: phone, toName: name !== phone ? name : null, message: message.slice(0, 500), status: 'sent' },
          }).catch(() => {})
        } catch (error) {
          failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          controller.enqueue(encoder.encode(
            JSON.stringify({ phone, name, status: 'failed', error: errorMsg, retry: isRetry }) + '\n'
          ))
          await prisma.messageLog.create({
            data: { type: 'group-notify', to: phone, toName: name !== phone ? name : null, message: message.slice(0, 500), status: 'failed', error: errorMsg },
          }).catch(() => {})
        }
      }

      let aborted = false
      for (const phone of memberPhones) {
        const name = participantMap.get(phone) || phone

        // If a send tripped a Chromium frame error, sendPrivateMessage marks
        // WhatsApp disconnected and kicks off a reconnect. Stop here instead of
        // hammering the rest (which races the reconnect); collect them and
        // retry once WhatsApp is back.
        if (aborted || !getWhatsAppState().isConnected) {
          aborted = true
          skipped.push(phone)
          controller.enqueue(encoder.encode(
            JSON.stringify({ phone, name, status: 'skipped', error: 'WhatsApp reconnecting — will retry' }) + '\n'
          ))
          continue
        }

        await sendOne(phone, name, false)
        await pace()
      }

      // Auto-retry the skipped members once the client reconnects (up to ~60s).
      if (skipped.length > 0) {
        controller.enqueue(encoder.encode(
          JSON.stringify({ type: 'info', message: `Waiting for WhatsApp to reconnect to retry ${skipped.length} member(s)…` }) + '\n'
        ))
        let waited = 0
        while (!getWhatsAppState().isConnected && waited < 60000) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          waited += 3000
        }
        for (const phone of skipped) {
          const name = participantMap.get(phone) || phone
          if (!getWhatsAppState().isConnected) {
            failed++
            controller.enqueue(encoder.encode(
              JSON.stringify({ phone, name, status: 'failed', error: 'WhatsApp did not reconnect in time' }) + '\n'
            ))
            continue
          }
          await sendOne(phone, name, true)
          await pace()
        }
      }

      // Schedule group reminder for 12pm on class date if requested (with dedup)
      let groupReminderScheduled = false
      if (scheduleGroupReminder && classDateISO) {
        try {
          const classDayMessage = `Reminder: Your Module ${moduleNum} class is TODAY at ${time}! Please make sure to put your full name when joining Zoom. Invite Link: https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09 — Password: qazi`

          // Create scheduled date at 12pm on the class day
          // classDateISO is in format "2025-02-10"
          const scheduledDate = new Date(classDateISO + 'T12:00:00')

          // Only schedule if the date is in the future
          if (scheduledDate > new Date()) {
            // Cancel any existing pending group reminders for the same group + date to prevent duplicates
            const existingGroupReminders = await prisma.scheduledMessage.findMany({
              where: {
                status: 'pending',
                groupId: decodedGroupId,
                classDateISO: classDateISO,
                isGroupMessage: true,
              },
            })
            if (existingGroupReminders.length > 0) {
              await prisma.scheduledMessage.updateMany({
                where: { id: { in: existingGroupReminders.map(r => r.id) } },
                data: { status: 'cancelled' },
              })
              console.log(`[group-notify] Cancelled ${existingGroupReminders.length} existing group reminder(s) for ${decodedGroupId} on ${classDateISO}`)
            }

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
