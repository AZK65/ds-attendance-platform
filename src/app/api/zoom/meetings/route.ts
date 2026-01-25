import { NextRequest, NextResponse } from 'next/server'
import { getPastMeetingInstances } from '@/lib/zoom/client'

export async function POST(request: NextRequest) {
  try {
    const { meetingId } = await request.json()

    if (!meetingId) {
      return NextResponse.json(
        { error: 'Meeting ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Zoom] Fetching past instances for meeting ${meetingId}`)

    const instances = await getPastMeetingInstances(meetingId)

    // Sort by start time descending (most recent first)
    const sortedInstances = instances.sort((a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    )

    return NextResponse.json({
      meetings: sortedInstances.map(m => ({
        uuid: m.uuid,
        startTime: m.start_time,
        endTime: m.end_time,
        duration: m.duration,
        participantsCount: m.participants_count
      }))
    })
  } catch (error) {
    console.error('Zoom meetings error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch meetings' },
      { status: 500 }
    )
  }
}
