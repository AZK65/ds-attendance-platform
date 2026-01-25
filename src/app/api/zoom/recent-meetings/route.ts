import { NextResponse } from 'next/server'
import { getRecentMeetings } from '@/lib/zoom/client'

export async function GET() {
  try {
    const meetings = await getRecentMeetings()

    return NextResponse.json({
      meetings: meetings.map(m => ({
        id: m.id,
        uuid: m.uuid,
        topic: m.topic,
        startTime: m.start_time,
        endTime: m.end_time,
        duration: m.duration,
        participantsCount: m.participants_count
      }))
    })
  } catch (error) {
    console.error('Recent meetings error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch recent meetings' },
      { status: 500 }
    )
  }
}
