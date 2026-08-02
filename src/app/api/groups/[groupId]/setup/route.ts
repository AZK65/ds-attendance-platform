import { NextRequest, NextResponse } from 'next/server'
import { setGroupDescription, sendPrivateMessage, sendMessageToGroup, sendDocumentToGroup, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'
import { createTheoryEvent, createTruckTheoryEvent, generateSessionDates } from '@/lib/teamup'

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
      // Class 1 (truck) cohort scheduling. Truck theory is classroom-taught to
      // the whole intake on fixed weekdays (Tue + Thu evenings), so instead of
      // "one class a week for N weeks" we lay out `truckSessions` sessions
      // across `truckWeekdays`. Saturdays stay free for per-student in-cab hours.
      vehicleType,
      subcalendarId,
      truckSessions,
      truckWeekdays,
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
      vehicleType?: 'car' | 'truck'
      subcalendarId?: number | null
      truckSessions?: number
      truckWeekdays?: number[]
    }

    const isTruck = vehicleType === 'truck'

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

    // 3a. Class 1 (truck) cohort timetable.
    //     Lays `truckSessions` classroom sessions across the configured
    //     weekdays starting at classDateISO, each on the selected teacher's
    //     calendar, each with a 12 PM day-of group reminder.
    if (isTruck && scheduleClass && classDateISO && classTime) {
      const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
      const groupName = group?.name || 'Unknown Group'

      const weekdays = Array.isArray(truckWeekdays) && truckWeekdays.length > 0
        ? truckWeekdays
        : [2, 4] // Tue + Thu
      const totalSessions = Math.max(1, Math.min(60, truckSessions || 19))
      const dates = generateSessionDates(classDateISO, weekdays, totalSessions)

      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dayLabel = weekdays.map(d => DAY_NAMES[d]).join(' and ')

      let teamupCreated = 0
      let remindersScheduled = 0

      for (let i = 0; i < dates.length; i++) {
        const iso = dates[i]
        const sessionNumber = i + 1

        // First session only: the upfront "your schedule is set" message.
        // No Zoom link — Class 1 theory is taught in the classroom.
        if (i === 0 && state.isConnected) {
          const [fy, fm, fd] = iso.split('-').map(Number)
          const dateStr = new Date(fy, fm - 1, fd).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })
          const message = `Hey! Your Class 1 theory schedule is set. First session is ${dateStr} from ${classTime} at the school. Sessions run ${dayLabel} — ${dates.length} in total. You'll get a reminder on each class day. Your in-cab driving hours are booked separately.`
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

        // 12 PM day-of reminder.
        // moduleNumber is deliberately left null: /api/scheduled-messages/process
        // re-creates a CAR theory event (on Fayyaz's calendar) for any reminder
        // carrying classDateISO + moduleNumber + classTime. Truck sessions must
        // not trigger that.
        const reminderTime = new Date(`${iso}T12:00:00`)
        if (reminderTime > new Date()) {
          await prisma.scheduledMessage.updateMany({
            where: { status: 'pending', groupId: decodedGroupId, classDateISO: iso, isGroupMessage: true },
            data: { status: 'cancelled' },
          })
          await prisma.scheduledMessage.create({
            data: {
              groupId: decodedGroupId,
              message: `Reminder: Your Class 1 theory session (${sessionNumber} of ${dates.length}) is TODAY at ${classTime} at the school. See you there!`,
              scheduledAt: reminderTime,
              memberPhones: JSON.stringify([]),
              classDateISO: iso,
              classTime,
              isGroupMessage: true,
              status: 'pending',
            },
          })
          remindersScheduled++
        }

        try {
          const ev = await createTruckTheoryEvent({
            classDate: iso,
            classTime,
            sessionNumber,
            groupName,
            subcalendarId,
          })
          if (ev.success) teamupCreated++
          else if (i === 0) results.push({ action: 'Teamup', status: `Failed: ${ev.error}` })
        } catch (err) {
          if (i === 0) results.push({ action: 'Teamup', status: `Failed: ${err instanceof Error ? err.message : 'unknown'}` })
        }
      }

      results.push({ action: 'Theory sessions', status: `${teamupCreated} created on calendar` })
      results.push({ action: 'Day-of reminders', status: `${remindersScheduled} scheduled` })

      // Re-assert the truck tag so the group lands on the right /groups tab and
      // stops relying on phone-based inference elsewhere.
      await prisma.group.update({
        where: { id: decodedGroupId },
        data: { vehicleType: 'truck' },
      }).catch(() => {})
    }

    // 3. Schedule classes & send notifications.
    //    `totalWeeks` consecutive weekly classes starting at classDateISO.
    //    For each week: create Teamup event, send group notification, and
    //    schedule a 12 PM same-day reminder.
    if (!isTruck && scheduleClass && moduleNumber && classDateISO && classTime && memberPhones && memberPhones.length > 0) {
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
            subcalendarId,
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
