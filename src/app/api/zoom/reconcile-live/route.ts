import { NextRequest, NextResponse } from 'next/server'
import { getMeetingDetails } from '@/lib/zoom/client'
import { getCurrentState, handleMeetingEnded, hydrateFromDb } from '@/lib/zoom/live-store'
import { reconcileEndedMeetingAttendance } from '@/lib/zoom/report-reconciliation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let requestedUUID = request.nextUrl.searchParams.get('meetingUUID') || ''
  let requestedTopic = request.nextUrl.searchParams.get('topic') || ''
  try {
    const body = await request.json()
    requestedUUID = String(body?.meetingUUID || requestedUUID)
    requestedTopic = String(body?.topic || requestedTopic)
  } catch {
    // Automated polling sends no body.
  }

  if (requestedUUID) {
    const result = await reconcileEndedMeetingAttendance({
      meetingUUID: requestedUUID,
      topic: requestedTopic,
    })
    return NextResponse.json({ ok: true, ...result })
  }

  await hydrateFromDb()
  const state = getCurrentState()
  if (!state.meetingId || !state.meetingUUID) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'No tracked meeting' })
  }

  try {
    const details = await getMeetingDetails(state.meetingId)
    if (details.status === 'started') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Meeting is still live' })
    }
  } catch {
    // A completed PMI can briefly disappear from the regular meeting-status
    // endpoint. The report request below is the authoritative final check.
  }

  if (state.isLive) {
    handleMeetingEnded({ object: { id: state.meetingId, uuid: state.meetingUUID } })
  }
  const result = await reconcileEndedMeetingAttendance({
    meetingUUID: state.meetingUUID,
    topic: state.topic,
  })
  return NextResponse.json({ ok: true, ...result })
}
