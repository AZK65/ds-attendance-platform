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
      // NEW: when set, schedules `weeksToSchedule` consecutive weekly classes
      // starting from classDateISO. Modules increment from `moduleNumber`.
      weeksToSchedule,
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
      weeksToSchedule?: number
    }

    const results: Array<{ action: string; status: string }> = []
    const totalWeeks = Math.max(1, Math.min(12, weeksToSchedule || 1))

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

    // 3. Schedule classes & send notifications.
    //    `totalWeeks` consecutive weekly classes starting at classDateISO.
    //    For each week: create Teamup event, send group notification, and
    //    schedule a 12 PM same-day reminder.
    if (scheduleClass && moduleNumber && classDateISO && classTime && memberPhones && memberPhones.length > 0) {
      const zoomLink = 'https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09'
      const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
      const groupName = group?.name || 'Unknown Group'

      // Parse the start date as a local date (avoid TZ shifts)
      const [sy, sm, sd] = classDateISO.split('-').map(Number)
      const startDate = new Date(sy, sm - 1, sd)

      let lastModuleScheduled = moduleNumber
      let teamupCreated = 0
      let remindersScheduled = 0

      for (let i = 0; i < totalWeeks; i++) {
        const weekDate = new Date(startDate)
        weekDate.setDate(startDate.getDate() + i * 7)
        const isoWeek = `${weekDate.getFullYear()}-${String(weekDate.getMonth() + 1).padStart(2, '0')}-${String(weekDate.getDate()).padStart(2, '0')}`
        const formattedWeek = weekDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        const weekModule = moduleNumber + i
        if (weekModule > 12) break // don't overflow past full course
        lastModuleScheduled = weekModule

        // First class only: send the upfront "your class is scheduled" message
        if (i === 0 && state.isConnected) {
          const dateStr = classDate || isoWeek
          const message = totalWeeks > 1
            ? `Hey! Your phase 1 theory classes are scheduled. First class (Module ${weekModule}) is ${dateStr} from ${classTime}. The next ${totalWeeks - 1} weeks follow on the same day. You'll receive a reminder on each class day. Please make sure to put your full name when joining Zoom. Invite Link: ${zoomLink} — Password: qazi`
            : `Hey! Your Module ${weekModule} class is scheduled for ${dateStr} from ${classTime}. You'll receive another reminder on the day of the class. Please make sure to put your full name when joining Zoom. Invite Link: ${zoomLink} — Password: qazi`
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

        // 12 PM same-day reminder
        const groupReminderTime = new Date(`${isoWeek}T12:00:00`)
        if (groupReminderTime > new Date()) {
          await prisma.scheduledMessage.updateMany({
            where: { status: 'pending', groupId: decodedGroupId, classDateISO: isoWeek, isGroupMessage: true },
            data: { status: 'cancelled' },
          })
          const groupMessage = `Reminder: Your Module ${weekModule} class is TODAY at ${classTime}! Please make sure to put your full name when joining Zoom. Invite Link: ${zoomLink} — Password: qazi`
          await prisma.scheduledMessage.create({
            data: {
              groupId: decodedGroupId,
              message: groupMessage,
              scheduledAt: groupReminderTime,
              memberPhones: JSON.stringify([]),
              moduleNumber: weekModule,
              classDateISO: isoWeek,
              classTime,
              isGroupMessage: true,
              status: 'pending',
            },
          })
          remindersScheduled++
        }

        // Teamup event
        try {
          await createTheoryEvent({
            classDate: isoWeek,
            classTime,
            moduleNumber: weekModule,
            groupName,
          })
          teamupCreated++
        } catch (err) {
          results.push({ action: `Teamup M${weekModule}`, status: `Failed: ${err instanceof Error ? err.message : 'unknown'}` })
        }
      }

      results.push({ action: 'Teamup events', status: `${teamupCreated} created` })
      results.push({ action: 'Day-of reminders', status: `${remindersScheduled} scheduled` })

      // Update group module number to the FIRST class's module so the
      // group page reflects what's coming up first.
      await prisma.group.update({
        where: { id: decodedGroupId },
        data: { moduleNumber },
      }).catch(() => {})
      void lastModuleScheduled
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
