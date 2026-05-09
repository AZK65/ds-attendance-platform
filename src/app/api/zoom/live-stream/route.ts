import { NextRequest } from 'next/server'
import {
  getCurrentState,
  addListener,
  removeListener,
  getManualOverrides,
  hydrateFromApi,
} from '@/lib/zoom/live-store'
import { matchZoomToWhatsApp, getMeetingDetails, getLiveMeetingParticipants } from '@/lib/zoom/client'
import { getGroupMembers } from '@/lib/group-sync'
import { prisma } from '@/lib/db'

// Hardcoded — same fallback used by /api/zoom/live-meeting
const FALLBACK_MEETING_ID = '4171672829'

// Throttle Zoom API calls — every check on every keepalive would burn rate
// limit. The hydrate path only runs when the local store is empty.
let lastApiCheckAt = 0
const API_CHECK_INTERVAL_MS = 30_000

async function maybeHydrateFromApi(): Promise<{ checked: boolean; available: boolean }> {
  const now = Date.now()
  if (now - lastApiCheckAt < API_CHECK_INTERVAL_MS) {
    return { checked: false, available: false }
  }
  lastApiCheckAt = now
  try {
    const details = await getMeetingDetails(FALLBACK_MEETING_ID)
    if (details.status !== 'started') return { checked: true, available: false }
    const participants = await getLiveMeetingParticipants(FALLBACK_MEETING_ID)
    if (participants === null) {
      // Dashboard API not available on this plan — at least mark the
      // meeting as live in the store so the UI doesn't say "no active
      // meeting" while one's actually running.
      hydrateFromApi({
        meetingId: String(details.id),
        topic: details.topic,
        startTime: details.start_time,
        participants: [],
      })
      return { checked: true, available: false }
    }
    hydrateFromApi({
      meetingId: String(details.id),
      topic: details.topic,
      startTime: details.start_time,
      participants,
    })
    return { checked: true, available: true }
  } catch {
    return { checked: true, available: false }
  }
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const groupId = request.nextUrl.searchParams.get('groupId')

  // Load students from cached GroupMember table (instant) and learned matches
  let whatsappStudents: Array<{ name: string | null; pushName: string | null; phone: string }> = []
  let learnedMatches: Array<{ zoomName: string; whatsappPhone: string; whatsappName: string }> = []

  if (groupId) {
    try {
      // Both are fast DB queries — no WhatsApp API calls
      const [members, matches] = await Promise.all([
        getGroupMembers(groupId),
        prisma.zoomNameMatch.findMany(),
      ])

      whatsappStudents = members
        .filter(m => !m.isSuperAdmin)
        .map(m => ({ name: m.name, pushName: m.pushName, phone: m.phone }))
      learnedMatches = matches
    } catch (error) {
      console.error('[SSE] Error loading student data:', error)
    }
  }

  const encoder = new TextEncoder()

  async function buildMatchedState() {
    let currentState = getCurrentState()

    // If we don't think a meeting is live, OR the meeting is live but we
    // have no participants (webhook miss), poll Zoom directly to hydrate.
    // hydrateFromApi merges into the existing store, so webhook-driven
    // joins/leaves continue to flow normally afterwards.
    let webhookMissing = false
    if (whatsappStudents.length > 0) {
      const noMeeting = !currentState.isLive
      const noParticipants = currentState.isLive && currentState.participants.length === 0
      if (noMeeting || noParticipants) {
        const result = await maybeHydrateFromApi()
        if (result.checked) {
          currentState = getCurrentState()
          // Mark webhookMissing only when we tried but couldn't get
          // participants from the Dashboard API either.
          webhookMissing = currentState.isLive && currentState.participants.length === 0 && !result.available
        }
      }
    }

    const matchedData = computeMatchedData(
      currentState.participants,
      whatsappStudents,
      learnedMatches
    )

    // Get manual overrides for this group
    const overrides = groupId ? getManualOverrides(groupId) : []

    return {
      type: 'state',
      isLive: currentState.isLive,
      webhookMissing,
      meetingId: currentState.meetingId,
      topic: currentState.topic,
      startTime: currentState.startTime,
      participantCount: currentState.participants.length,
      ...matchedData,
      manualOverrides: overrides,
      timestamp: new Date().toISOString()
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const sendState = async () => {
        try {
          const data = await buildMatchedState()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Client may have disconnected
        }
      }

      // Send initial state immediately
      sendState()

      // Listen for state changes from the live store
      const onChange = () => {
        sendState().catch(() => {
          removeListener(onChange)
          clearInterval(keepalive)
        })
      }

      addListener(onChange)

      // Keepalive every 30s. Also re-send the full state so the UI picks
      // up changes even when no webhook events fire (e.g. Zoom API says
      // the meeting started but no participant_joined events came through).
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
          sendState().catch(() => {})
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
