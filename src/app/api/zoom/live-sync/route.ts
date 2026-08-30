import { NextRequest, NextResponse } from 'next/server'
import { getLiveMeetingParticipants, getMeetingDetails } from '@/lib/zoom/client'
import {
  getCurrentState,
  hydrateFromApi,
  restorePersistedLiveState,
} from '@/lib/zoom/live-store'

export const dynamic = 'force-dynamic'

const FALLBACK_MEETING_ID = '4171672829'

export async function POST(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get('meetingId') || FALLBACK_MEETING_ID

  try {
    const restoredFromSaved = await restorePersistedLiveState()
    const details = await getMeetingDetails(meetingId)
    let restoredFromZoom = 0
    let dashboardAvailable = false

    if (details.status === 'started') {
      const participants = await getLiveMeetingParticipants(meetingId)
      dashboardAvailable = participants !== null
      if (participants) {
        restoredFromZoom = hydrateFromApi({
          meetingId: String(details.id),
          topic: details.topic,
          startTime: details.start_time,
          participants,
        })
      } else {
        // Keep the meeting itself live even when this Zoom plan cannot return
        // a live roster. New webhook joins will continue to populate it.
        hydrateFromApi({
          meetingId: String(details.id),
          topic: details.topic,
          startTime: details.start_time,
          participants: [],
        })
      }
    }

    const state = getCurrentState()
    const restored = restoredFromSaved + restoredFromZoom
    return NextResponse.json({
      ok: true,
      isLive: details.status === 'started',
      participantCount: state.participants.length,
      restored,
      restoredFromSaved,
      restoredFromZoom,
      dashboardAvailable,
      message: restored > 0
        ? `Restored ${restored} participant${restored === 1 ? '' : 's'}.`
        : dashboardAvailable
          ? 'Zoom is synchronized. No additional participants were found.'
          : 'Saved attendance was checked. This Zoom plan cannot retrieve a live roster, so students who joined while the server was offline must rejoin or be marked present manually.',
    })
  } catch (error) {
    console.error('[Live Sync] Error:', error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Force sync failed',
    }, { status: 500 })
  }
}
