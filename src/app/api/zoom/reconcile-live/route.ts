import { NextResponse } from 'next/server'
import { getMeetingDetails } from '@/lib/zoom/client'
import { getCurrentState, handleMeetingEnded, hydrateFromDb } from '@/lib/zoom/live-store'
import { reconcileEndedMeetingAttendance } from '@/lib/zoom/report-reconciliation'

export const dynamic = 'force-dynamic'

export async function POST() {
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
