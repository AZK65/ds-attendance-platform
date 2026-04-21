import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const TEAMUP_BASE = 'https://api.teamup.com'

// Creates a road-class event in Teamup on the previously-used teacher's
// subcalendar, and logs the booking to MessageLog so the school sees it.
export async function POST(request: NextRequest) {
  try {
    const {
      studentId,
      studentName,
      phone,
      sortieNumber,
      teacherId,   // subcalendar id of the previous teacher
      slotStart,   // ISO string from availability endpoint
      slotEnd,     // ISO string from availability endpoint
      notes,
    } = await request.json()

    if (!studentId || !sortieNumber || !teacherId || !slotStart || !slotEnd) {
      return NextResponse.json(
        { error: 'studentId, sortieNumber, teacherId, slotStart and slotEnd are required' },
        { status: 400 }
      )
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const displayName = (studentName || student.name).replace(/\s*#\s*\d+\s*$/i, '').trim()
    const studentPhone = phone || student.phone || ''

    let teamupEventId: string | null = null
    let teamupError: string | null = null

    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
    if (apiKey && calendarKey) {
      const title = `Sortie ${sortieNumber} — ${displayName}`
      const body = [
        `Student: ${displayName}`,
        studentPhone ? `Phone: ${studentPhone}` : null,
        `Road Class: #${sortieNumber}`,
        'Booked online (student portal)',
        notes ? `Notes: ${notes}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      const res = await fetch(`${TEAMUP_BASE}/${calendarKey}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Teamup-Token': apiKey,
        },
        body: JSON.stringify({
          subcalendar_ids: [Number(teacherId)],
          start_dt: slotStart,
          end_dt: slotEnd,
          title,
          notes: body,
          all_day: false,
        }),
      })

      if (res.ok) {
        const data = await res.json().catch(() => null)
        teamupEventId = data?.event?.id || null
      } else {
        teamupError = await res.text().catch(() => 'Teamup error')
        console.error('[Book Request] Teamup create failed:', teamupError)
      }
    }

    const summary = [
      `Road class booking — Sortie #${sortieNumber}`,
      `Student: ${displayName}${studentPhone ? ` (${studentPhone})` : ''}`,
      `Slot: ${slotStart} → ${slotEnd}`,
      `Teacher subcalendar: ${teacherId}`,
      teamupEventId ? `Teamup event: ${teamupEventId}` : 'Teamup event NOT created',
      notes ? `Notes: ${notes}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    console.log('[Book Request]', summary)

    try {
      await prisma.messageLog.create({
        data: {
          type: teamupEventId ? 'booking-confirmed' : 'booking-request',
          to: studentPhone,
          toName: displayName,
          message: summary,
          status: teamupEventId ? 'sent' : 'pending',
          error: teamupError || undefined,
        },
      })
    } catch (logErr) {
      console.warn('[Book Request] MessageLog write failed:', logErr)
    }

    if (!teamupEventId) {
      return NextResponse.json(
        {
          success: false,
          error: 'We saved your request but could not automatically book the slot. The school will follow up.',
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      eventId: teamupEventId,
    })
  } catch (error) {
    console.error('[Book Request] Error:', error)
    return NextResponse.json(
      { error: 'Request failed. Please try again.' },
      { status: 500 }
    )
  }
}
