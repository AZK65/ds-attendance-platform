import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface MatchedRecord {
  whatsappName: string
  whatsappPhone: string
  zoomName: string
  duration: number
}

interface AbsentRecord {
  name: string
  phone: string
}

interface UnmatchedZoom {
  name: string
  duration: number
}

// GET - Load saved attendance for a group/meeting
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const groupId = searchParams.get('groupId')
  const meetingUUID = searchParams.get('meetingUUID')

  if (!groupId || !meetingUUID) {
    return NextResponse.json(
      { error: 'groupId and meetingUUID are required' },
      { status: 400 }
    )
  }

  try {
    const attendance = await prisma.zoomAttendance.findUnique({
      where: {
        groupId_meetingUUID: {
          groupId,
          meetingUUID
        }
      }
    })

    if (!attendance) {
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({
      found: true,
      data: {
        id: attendance.id,
        groupId: attendance.groupId,
        meetingUUID: attendance.meetingUUID,
        meetingDate: attendance.meetingDate,
        moduleNumber: attendance.moduleNumber,
        matched: JSON.parse(attendance.matchedRecords) as MatchedRecord[],
        absent: JSON.parse(attendance.absentRecords) as AbsentRecord[],
        unmatchedZoom: JSON.parse(attendance.unmatchedZoom) as UnmatchedZoom[]
      }
    })
  } catch (error) {
    console.error('Load attendance error:', error)
    return NextResponse.json(
      { error: 'Failed to load attendance' },
      { status: 500 }
    )
  }
}

// POST - Save attendance for a group/meeting
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Save attendance request body:', JSON.stringify(body, null, 2))

    const {
      groupId,
      meetingUUID,
      meetingDate,
      moduleNumber,
      matched,
      absent,
      unmatchedZoom
    } = body as {
      groupId: string
      meetingUUID: string
      meetingDate: string
      moduleNumber?: number
      matched: MatchedRecord[]
      absent: AbsentRecord[]
      unmatchedZoom: UnmatchedZoom[]
    }

    if (!groupId || !meetingUUID || !matched || !absent || !unmatchedZoom) {
      console.error('Missing required fields:', { groupId, meetingUUID, hasMatched: !!matched, hasAbsent: !!absent, hasUnmatched: !!unmatchedZoom })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const attendance = await prisma.zoomAttendance.upsert({
      where: {
        groupId_meetingUUID: {
          groupId,
          meetingUUID
        }
      },
      update: {
        meetingDate: new Date(meetingDate),
        moduleNumber: moduleNumber || null,
        matchedRecords: JSON.stringify(matched),
        absentRecords: JSON.stringify(absent),
        unmatchedZoom: JSON.stringify(unmatchedZoom),
        updatedAt: new Date()
      },
      create: {
        groupId,
        meetingUUID,
        meetingDate: new Date(meetingDate),
        moduleNumber: moduleNumber || null,
        matchedRecords: JSON.stringify(matched),
        absentRecords: JSON.stringify(absent),
        unmatchedZoom: JSON.stringify(unmatchedZoom)
      }
    })

    return NextResponse.json({
      success: true,
      id: attendance.id
    })
  } catch (error) {
    console.error('Save attendance error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to save attendance', details: errorMessage },
      { status: 500 }
    )
  }
}
