import { NextRequest } from 'next/server'
import {
  getCurrentState,
  addListener,
  removeListener
} from '@/lib/zoom/live-store'
import { matchZoomToWhatsApp } from '@/lib/zoom/client'
import { getGroupParticipants, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const groupId = request.nextUrl.searchParams.get('groupId')

  // Load learned matches and WhatsApp members for this SSE connection
  // Use DB contacts first (fast), then upgrade to live WhatsApp data in background
  let whatsappStudents: Array<{ name: string | null; pushName: string | null; phone: string }> = []
  let learnedMatches: Array<{ zoomName: string; whatsappPhone: string; whatsappName: string }> = []

  if (groupId) {
    try {
      // Load learned matches (fast DB query)
      learnedMatches = await prisma.zoomNameMatch.findMany()

      // Try DB contacts first for instant load
      const dbRecords = await prisma.attendanceRecord.findMany({
        where: { attendanceSheet: { groupId } },
        select: {
          contact: { select: { phone: true, name: true, pushName: true } },
        },
        distinct: ['contactId'],
      })
      if (dbRecords.length > 0) {
        whatsappStudents = dbRecords.map(r => ({
          name: r.contact.name,
          pushName: r.contact.pushName,
          phone: r.contact.phone,
        }))
      }

      // Also try live WhatsApp data (may be faster/more current)
      const state = getWhatsAppState()
      if (state.isConnected) {
        try {
          const members = await getGroupParticipants(groupId)
          const liveStudents = members.filter(m => !m.isSuperAdmin)
          if (liveStudents.length > 0) {
            whatsappStudents = liveStudents
          }
        } catch {
          // Live WhatsApp failed, keep DB data
        }
      }
    } catch (error) {
      console.error('[SSE] Error loading student data:', error)
    }
  }

  const encoder = new TextEncoder()

  function buildMatchedState() {
    const currentState = getCurrentState()
    const matchedData = computeMatchedData(
      currentState.participants,
      whatsappStudents,
      learnedMatches
    )

    return {
      type: 'state',
      isLive: currentState.isLive,
      meetingId: currentState.meetingId,
      topic: currentState.topic,
      startTime: currentState.startTime,
      participantCount: currentState.participants.length,
      ...matchedData,
      timestamp: new Date().toISOString()
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state immediately
      try {
        const data = buildMatchedState()
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      } catch {
        // Client may have disconnected
        return
      }

      // Listen for state changes from the live store
      const onChange = () => {
        try {
          const data = buildMatchedState()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          removeListener(onChange)
          clearInterval(keepalive)
        }
      }

      addListener(onChange)

      // Keepalive ping every 30 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          clearInterval(keepalive)
          removeListener(onChange)
        }
      }, 30000)

      // Clean up on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(keepalive)
        removeListener(onChange)
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}

function computeMatchedData(
  participants: Array<{ user_name: string; user_id: string; join_time: string }>,
  whatsappStudents: Array<{ name: string | null; pushName: string | null; phone: string }>,
  learnedMatches: Array<{ zoomName: string; whatsappPhone: string; whatsappName: string }>
) {
  if (whatsappStudents.length === 0) {
    return {
      matched: [] as Array<{ whatsappName: string; whatsappPhone: string; zoomName: string; duration: number; joinTime: string }>,
      absent: [] as Array<{ name: string; phone: string }>,
      unmatchedZoom: participants.map(p => ({ name: p.user_name, duration: 0 }))
    }
  }

  if (participants.length === 0) {
    return {
      matched: [] as Array<{ whatsappName: string; whatsappPhone: string; zoomName: string; duration: number; joinTime: string }>,
      absent: whatsappStudents.map(s => ({
        name: s.name || s.pushName || s.phone,
        phone: s.phone
      })),
      unmatchedZoom: [] as Array<{ name: string; duration: number }>
    }
  }

  // Convert live participants to the format expected by matchZoomToWhatsApp
  const zoomParticipants = participants.map(p => ({
    id: p.user_id,
    name: p.user_name,
    join_time: p.join_time,
    leave_time: '',
    duration: Math.floor((Date.now() - new Date(p.join_time).getTime()) / 1000)
  }))

  const result = matchZoomToWhatsApp(zoomParticipants, whatsappStudents, learnedMatches)

  return {
    matched: result.matched,
    absent: result.absent,
    unmatchedZoom: result.unmatchedZoom
  }
}
