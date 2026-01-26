import { NextRequest, NextResponse } from 'next/server'
import {
  getZoomMeetingParticipants,
  getPastMeetingInstances,
  getMeetingParticipantsByUUID,
  matchZoomToWhatsApp
} from '@/lib/zoom/client'
import { getGroupParticipants, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { meetingId, groupId } = await request.json()

    if (!meetingId) {
      return NextResponse.json(
        { error: 'Meeting ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Zoom] Fetching participants for meeting ${meetingId}`)

    // Check if this is a UUID (contains = or / or +) or a regular meeting ID
    const isUUID = meetingId.includes('=') || meetingId.includes('/') || meetingId.includes('+')

    let zoomParticipants
    if (isUUID) {
      // Direct UUID - use getMeetingParticipantsByUUID
      console.log(`[Zoom] Detected UUID format, fetching directly`)
      zoomParticipants = await getMeetingParticipantsByUUID(meetingId)
    } else {
      // Regular meeting ID - try direct fetch first, then fall back to instances
      try {
        zoomParticipants = await getZoomMeetingParticipants(meetingId)
      } catch (error) {
        console.log('[Zoom] Direct fetch failed, trying to get past instances...')

        // If direct fetch fails, try getting past meeting instances
        try {
          const instances = await getPastMeetingInstances(meetingId)
          console.log(`[Zoom] Found ${instances.length} past instances`)

          if (instances.length > 0) {
            // Get the most recent instance
            const mostRecent = instances[0]
            console.log(`[Zoom] Using most recent instance: ${mostRecent.uuid}`)
            zoomParticipants = await getMeetingParticipantsByUUID(mostRecent.uuid)
          } else {
            throw new Error('No past meeting instances found')
          }
        } catch (instanceError) {
          console.error('[Zoom] Failed to get instances:', instanceError)
          throw error // Throw original error
        }
      }
    }

    console.log(`[Zoom] Found ${zoomParticipants.length} Zoom participants`)

    // Filter out the Zoom host/licensed account (has user_email set)
    // The host (e.g., "Qazi Driving School") is a licensed Zoom user, not a student
    const hostParticipants = zoomParticipants.filter(p => p.user_email)
    const studentZoomParticipants = zoomParticipants.filter(p => !p.user_email)
    if (hostParticipants.length > 0) {
      console.log(`[Zoom] Filtered out ${hostParticipants.length} host/licensed user(s): ${hostParticipants.map(p => p.name).join(', ')}`)
    }
    console.log(`[Zoom] ${studentZoomParticipants.length} student participants after filtering`)

    // If groupId provided, match with WhatsApp members
    if (groupId) {
      const state = getWhatsAppState()
      if (!state.isConnected) {
        // Return just Zoom data without matching
        return NextResponse.json({
          zoomParticipants: studentZoomParticipants,
          matched: [],
          absent: [],
          unmatchedZoom: studentZoomParticipants.map(p => ({
            name: p.name,
            duration: p.duration
          })),
          whatsappNotConnected: true
        })
      }

      const whatsappMembers = await getGroupParticipants(groupId)
      console.log(`[Zoom] WhatsApp group has ${whatsappMembers.length} total members`)

      // Filter out super admin (owner)
      const students = whatsappMembers.filter(m => !m.isSuperAdmin)
      console.log(`[Zoom] After filtering owner: ${students.length} students`)
      console.log(`[Zoom] Student names:`, students.map(s => s.name || s.pushName || s.phone))

      // Load learned matches from database
      const learnedMatches = await prisma.zoomNameMatch.findMany()
      console.log(`[Zoom] Loaded ${learnedMatches.length} learned matches from database`)

      const result = matchZoomToWhatsApp(studentZoomParticipants, students, learnedMatches)
      console.log(`[Zoom] Match results - matched: ${result.matched.length}, absent: ${result.absent.length}, unmatched: ${result.unmatchedZoom.length}`)

      return NextResponse.json(result)
    }

    // Return just Zoom participants if no groupId
    return NextResponse.json({
      zoomParticipants: studentZoomParticipants,
      matched: [],
      absent: [],
      unmatchedZoom: studentZoomParticipants.map(p => ({
        name: p.name,
        duration: p.duration
      }))
    })
  } catch (error) {
    console.error('Zoom participants error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Zoom participants' },
      { status: 500 }
    )
  }
}
