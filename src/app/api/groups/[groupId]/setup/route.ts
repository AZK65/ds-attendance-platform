import { NextRequest, NextResponse } from 'next/server'
import { setGroupDescription, sendPrivateMessage, sendMessageToGroup, sendDocumentToGroup, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'
import { createTheoryEvent, createTruckTheoryEvent } from '@/lib/teamup'
import { syncGroupTheoryReminder } from '@/lib/group-theory-schedule'
import {
  buildTruckSessions, summarizeTruckSessions, describeTruckDay, formatTimeRange,
  DEFAULT_TRUCK_DAYS, TRUCK_THEORY_TARGET_HOURS, TRUCK_PRACTICAL_HOURS, type TruckDay,
} from '@/lib/truck-schedule'

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
      truckTheoryHours,
      truckDays,
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
      truckTheoryHours?: number
      truckDays?: Array<{ day: number; start: string; end: string }>
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
    // Truck carries per-day times in `truckDays`, so unlike car it needs no
    // single `classTime`.
    if (isTruck && scheduleClass && classDateISO) {
      const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
      const groupName = group?.name || 'Unknown Group'

      // Each class day carries its own hours — Tue/Thu evenings are 4 h,
      // Saturday is a 9 h day. All classroom, all in person at the school.
      // The 50 h of in-cab driving is booked per student, not here.
      const days: TruckDay[] =
        Array.isArray(truckDays) && truckDays.length > 0
          ? truckDays
              .filter(d => d && typeof d.day === 'number' && d.day >= 0 && d.day <= 6 && d.start && d.end)
              .map(d => ({
                day: d.day,
                start: String(d.start).slice(0, 5),
                end: String(d.end).slice(0, 5),
              }))
          : DEFAULT_TRUCK_DAYS

      const targetHours = Math.max(1, Math.min(200, truckTheoryHours || TRUCK_THEORY_TARGET_HOURS))
      const sessions = buildTruckSessions(classDateISO, days, targetHours)
      const summary = summarizeTruckSessions(sessions)
      const scheduleLines = days.map(d => `• ${describeTruckDay(d)}`).join('\n')

      let teamupCreated = 0
      let remindersScheduled = 0

      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i]
        const timeLabel = formatTimeRange(s.start, s.end)

        // First session only: the upfront "your schedule is set" message.
        // No Zoom link — every Class 1 session is in person at the school.
        if (i === 0 && state.isConnected) {
          const fmtLong = (iso: string) => {
            const [yy, mm, dd] = iso.split('-').map(Number)
            return new Date(yy, mm - 1, dd).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })
          }
          const dateStr = fmtLong(s.date)
          const lastDateStr = summary.lastDate ? fmtLong(summary.lastDate) : dateStr
          const message = `Hey! Your Class 1 theory schedule is set — all classes are IN PERSON at the school.\n\nFirst class: ${dateStr}, ${timeLabel}.\n\nYour weekly schedule:\n${scheduleLines}\n\n${sessions.length} classes covering the ${summary.totalHours} h of theory, finishing around ${lastDateStr}. You'll get a reminder on each class day.\n\nYour ${TRUCK_PRACTICAL_HOURS} h of driving are booked separately once theory is done.`
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

        try {
          const ev = await createTruckTheoryEvent({
            classDate: s.date,
            startTime: s.start,
            endTime: s.end,
            sessionNumber: s.sessionNumber,
            totalSessions: sessions.length,
            groupName,
            subcalendarId,
          })
          if (ev.success) {
            teamupCreated++
            const reminderEvent = ev.event || (ev.eventId ? {
              id: ev.eventId,
              title: `Class 1 Theory ${s.sessionNumber}/${sessions.length} - ${groupName}`,
              start_dt: `${s.date}T${s.start}:00`,
              end_dt: `${s.date}T${s.end}:00`,
              notes: `Theory class\nClass 1 (Truck)\nIn person at the school\nSession: ${s.sessionNumber} of ${sessions.length}\nGroup: ${groupName}`,
              subcalendar_ids: subcalendarId ? [subcalendarId] : [],
            } : null)
            if (reminderEvent) {
              const reminder = await syncGroupTheoryReminder(reminderEvent)
              if (reminder.scheduled) remindersScheduled++
            }
          }
          else if (i === 0) results.push({ action: 'Teamup', status: `Failed: ${ev.error}` })
        } catch (err) {
          if (i === 0) results.push({ action: 'Teamup', status: `Failed: ${err instanceof Error ? err.message : 'unknown'}` })
        }
      }

      results.push({
        action: 'Theory classes created',
        status: `${teamupCreated} on calendar — ${summary.totalHours} h over ~${summary.weeks} weeks`,
      })
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

        // Teamup event
        try {
          const ev = await createTheoryEvent({
            classDate: isoWeek,
            classTime,
            moduleNumber: weekModule,
            groupName,
            subcalendarId,
          })
          if (ev.success) {
            teamupCreated++
            const parsedTimes = classTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm).*?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
            const to24 = (hourText: string, minuteText: string | undefined, periodText: string) => {
              let hour = Number(hourText)
              if (periodText.toLowerCase() === 'pm' && hour !== 12) hour += 12
              if (periodText.toLowerCase() === 'am' && hour === 12) hour = 0
              return `${String(hour).padStart(2, '0')}:${minuteText || '00'}`
            }
            const fallbackStart = parsedTimes ? to24(parsedTimes[1], parsedTimes[2], parsedTimes[3]) : '17:00'
            const fallbackEnd = parsedTimes ? to24(parsedTimes[4], parsedTimes[5], parsedTimes[6]) : '19:00'
            const reminderEvent = ev.event || (ev.eventId ? {
              id: ev.eventId,
              title: `Module ${weekModule} - ${groupName}`,
              start_dt: `${isoWeek}T${fallbackStart}:00`,
              end_dt: `${isoWeek}T${fallbackEnd}:00`,
              notes: `Theory class\nModule: ${weekModule}\nGroup: ${groupName}`,
              subcalendar_ids: subcalendarId ? [subcalendarId] : [],
            } : null)
            if (reminderEvent) {
              const reminder = await syncGroupTheoryReminder(reminderEvent)
              if (reminder.scheduled) remindersScheduled++
            }
          } else {
            results.push({ action: `Teamup M${weekModule}`, status: `Failed: ${ev.error || 'unknown error'}` })
          }
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
