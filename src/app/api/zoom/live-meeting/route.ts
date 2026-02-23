import { NextRequest, NextResponse } from 'next/server'
import { getMeetingDetails } from '@/lib/zoom/client'
import { getCurrentState } from '@/lib/zoom/live-store'

export async function GET(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get('meetingId') || '4171672829'

  try {
    // Check in-memory store first (populated by webhooks)
    const storeState = getCurrentState()
    if (storeState.isLive && storeState.meetingId === meetingId) {
      return NextResponse.json({
        isLive: true,
        meetingId: storeState.meetingId,
        topic: storeState.topic,
        startTime: storeState.startTime,
        participantCount: storeState.participants.length,
        source: 'webhook'
      })
    }

    // Fall back to Zoom API
    const details = await getMeetingDetails(meetingId)

    return NextResponse.json({
      isLive: details.status === 'started',
      meetingId: String(details.id),
      topic: details.topic,
      startTime: details.start_time || null,
      status: details.status,
      source: 'api'
    })
  } catch (error) {
    console.error('[Live Meeting] Error:', error)

    // If API fails but store has data, return store data
    const storeState = getCurrentState()
    if (storeState.isLive) {
      return NextResponse.json({
        isLive: true,
        meetingId: storeState.meetingId,
        topic: storeState.topic,
        startTime: storeState.startTime,
        participantCount: storeState.participants.length,
        source: 'webhook'
      })
    }

    return NextResponse.json({
      isLive: false,
      meetingId,
      error: error instanceof Error ? error.message : 'Failed to check meeting status'
    })
  }
}
