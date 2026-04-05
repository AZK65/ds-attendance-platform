import { NextRequest, NextResponse } from 'next/server'
import { setGroupDescription, sendPrivateMessage, sendMessageToGroup, sendDocumentToGroup, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'
import { createTheoryEvent } from '@/lib/teamup'

// POST /api/groups/[groupId]/setup — Post-creation group setup
// Handles: set description with Zoom links, send book PDF, schedule first class
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const state = getWhatsAppState()

  try {
    const body = await request.json()
    const {
      setDescription,
      description,
      sendPdf,
      pdfBase64,
      pdfFilename,
      memberPhones,
      scheduleClass,
      moduleNumber,
      classDate,
      classDateISO,
      classTime,
    } = body as {
      setDescription?: boolean
      description?: string
      sendPdf?: boolean
      pdfBase64?: string
      pdfFilename?: string
      memberPhones?: string[]
      scheduleClass?: boolean
      moduleNumber?: number
      classDate?: string
      classDateISO?: string
      classTime?: string
    }

    const results: Array<{ action: string; status: string }> = []

    // 1. Set group description (Zoom links etc.)
    if (setDescription && description && state.isConnected) {
      const descResult = await setGroupDescription(decodedGroupId, description)
      results.push({
        action: 'Set group description',
        status: descResult.success ? 'Done' : `Failed: ${descResult.error}`,
      })
    }

    // 2. Send book PDF to the group (once, not to each member individually)
    if (sendPdf && pdfBase64 && state.isConnected) {
      const filename = pdfFilename || 'driving-book.pdf'
      try {
        await sendDocumentToGroup(decodedGroupId, pdfBase64, filename, 'application/pdf', 'Here is your driving course book!')
        results.push({ action: 'Send PDF to group', status: 'Sent' })

        await prisma.messageLog.create({
          data: { type: 'book-pdf', to: decodedGroupId, toName: 'Group', message: `Sent ${filename}`, status: 'sent' },
        }).catch(() => {})
      } catch (err) {
        results.push({ action: 'Send PDF to group', status: `Failed: ${err instanceof Error ? err.message : 'unknown'}` })
      }
    }

    // 3. Schedule first class & send notification
    if (scheduleClass && moduleNumber && classDateISO && classTime && memberPhones && memberPhones.length > 0) {
      const dateStr = classDate || classDateISO
      const zoomLink = 'https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09'
      const message = `Hey! Your Module ${moduleNumber} class is scheduled for ${dateStr} from ${classTime}. You'll receive another reminder on the day of the class. Please make sure to put your full name when joining Zoom. Invite Link: ${zoomLink} — Password: qazi`

      if (state.isConnected) {
        // Send class notification to the group (not individually)
        try {
          await sendMessageToGroup(decodedGroupId, message)
          results.push({ action: 'Class notification', status: 'Sent to group' })

          await prisma.messageLog.create({
            data: { type: 'class-notify', to: decodedGroupId, toName: 'Group', message: message.slice(0, 500), status: 'sent' },
          }).catch(() => {})
        } catch (err) {
          results.push({ action: 'Class notification', status: `Failed: ${err instanceof Error ? err.message : 'unknown'}` })
        }
      }

      // Schedule a reminder 3 hours before class
      const parseTime = classTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
      if (parseTime && classDateISO) {
        let hour = parseInt(parseTime[1])
        const minute = parseTime[2] ? parseInt(parseTime[2]) : 0
        const period = parseTime[3].toLowerCase()
        if (period === 'pm' && hour !== 12) hour += 12
        if (period === 'am' && hour === 12) hour = 0
        const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

        const classDateTime = new Date(`${classDateISO}T${startTime}:00`)
        const reminderTime = new Date(classDateTime.getTime() - 3 * 60 * 60 * 1000)

        if (reminderTime > new Date()) {
          // Cancel existing reminders for same group + date to prevent duplicates
          await prisma.scheduledMessage.updateMany({
            where: {
              status: 'pending',
              groupId: decodedGroupId,
              classDateISO,
              isGroupMessage: false,
            },
            data: { status: 'cancelled' },
          })

          const reminderMessage = `Reminder: Your Module ${moduleNumber} class is TODAY at ${classTime}! Please make sure to put your full name when joining Zoom. Invite Link: ${zoomLink} — Password: qazi`

          await prisma.scheduledMessage.create({
            data: {
              groupId: decodedGroupId,
              message: reminderMessage,
              scheduledAt: reminderTime,
              memberPhones: JSON.stringify(memberPhones),
              moduleNumber,
              classDateISO,
              classTime,
              status: 'pending',
            },
          })
          results.push({ action: 'Schedule reminder', status: `Set for ${reminderTime.toLocaleString()}` })
        }
      }

      // Also schedule a group reminder at 12 PM on class day
      if (classDateISO) {
        const groupReminderTime = new Date(`${classDateISO}T12:00:00`)
        if (groupReminderTime > new Date()) {
          // Cancel existing group reminders for same group + date
          await prisma.scheduledMessage.updateMany({
            where: {
              status: 'pending',
              groupId: decodedGroupId,
              classDateISO,
              isGroupMessage: true,
            },
            data: { status: 'cancelled' },
          })

          const groupMessage = `Reminder: Your Module ${moduleNumber} class is TODAY at ${classTime}! Please make sure to put your full name when joining Zoom. Invite Link: https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09 — Password: qazi`

          await prisma.scheduledMessage.create({
            data: {
              groupId: decodedGroupId,
              message: groupMessage,
              scheduledAt: groupReminderTime,
              memberPhones: JSON.stringify([]),
              moduleNumber,
              classDateISO,
              classTime,
              isGroupMessage: true,
              status: 'pending',
            },
          })
          results.push({ action: 'Schedule group reminder', status: `Set for 12 PM on ${classDateISO}` })
        }
      }

      // Sync to Teamup calendar
      if (moduleNumber && classDateISO && classTime) {
        try {
          const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
          await createTheoryEvent({
            classDate: classDateISO,
            classTime,
            moduleNumber,
            groupName: group?.name || 'Unknown Group',
          })
          results.push({ action: 'Sync to Teamup', status: 'Done' })
        } catch (err) {
          results.push({ action: 'Sync to Teamup', status: `Failed: ${err instanceof Error ? err.message : 'unknown'}` })
        }
      }

      // Update group module number
      await prisma.group.update({
        where: { id: decodedGroupId },
        data: { moduleNumber },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('[Group Setup] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to setup group' },
      { status: 500 }
    )
  }
}
