// Auto-saves Zoom attendance when a meeting.ended webhook fires.
//
// The flow: read the live store's participant list, match against each
// group's cached WhatsApp members, save a ZoomAttendance row under the
// group with the most matches. No-op if no group matches at least one
// participant (avoids creating empty rows under unrelated groups).

import { prisma } from '@/lib/db'
import { getCurrentState } from '@/lib/zoom/live-store'
import { matchZoomToWhatsApp, type LearnedMatch } from '@/lib/zoom/client'

// Inline because the ZoomParticipant type in client.ts isn't exported and
// the only place it's needed outside that file is here.
type ZoomParticipantLite = {
  id: string
  name: string
  user_email?: string
  join_time: string
  leave_time: string
  duration: number
}

interface AutoSaveOptions {
  meetingId: string
  meetingUUID: string
  topic?: string
  // Used as the leave_time / duration anchor when the webhook fires after
  // the meeting ends. Defaults to now.
  endedAt?: Date
}

function parseModuleFromTopic(topic: string): number | null {
  const m = (topic || '').match(/\b(?:M(?:od(?:ule)?)?\s*)(\d{1,2})\b/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 12 ? n : null
}

export async function autoSaveAttendanceOnMeetingEnd(opts: AutoSaveOptions): Promise<{
  saved: boolean
  groupId?: string
  matchedCount?: number
  reason?: string
}> {
  const state = getCurrentState()
  const liveParts = state.participants
  if (liveParts.length === 0) {
    return { saved: false, reason: 'No participants in live store' }
  }

  // Convert live participants into the shape matchZoomToWhatsApp expects.
  // duration = endedAt - join_time, in seconds.
  const endedAt = opts.endedAt ?? new Date()
  const zoomParticipants: ZoomParticipantLite[] = liveParts.map(p => ({
    id: p.user_id,
    name: p.user_name,
    user_email: '',
    join_time: p.join_time,
    leave_time: endedAt.toISOString(),
    duration: Math.max(1, Math.floor((endedAt.getTime() - new Date(p.join_time).getTime()) / 1000)),
  }))

  // Pull every cached group + its members in one query. We use the
  // cached snapshot (GroupMember) rather than the live WhatsApp API
  // because this runs in a webhook context that may not have a
  // connected WhatsApp session.
  const groups = await prisma.group.findMany({
    select: {
      id: true,
      moduleNumber: true,
      members: { select: { phone: true, contact: { select: { name: true, pushName: true } } } },
    },
  })
  if (groups.length === 0) return { saved: false, reason: 'No groups in DB' }

  // Learned name → phone matches improve auto-matching for nicknames.
  const learnedRows = await prisma.zoomNameMatch.findMany()
  const learnedMatches: LearnedMatch[] = learnedRows.map(lm => ({
    zoomName: lm.zoomName,
    whatsappPhone: lm.whatsappPhone,
    whatsappName: lm.whatsappName,
  }))

  // Try each group; pick the one with the most matched students.
  let best: {
    groupId: string
    moduleNumber: number | null
    matched: ReturnType<typeof matchZoomToWhatsApp>['matched']
    absent: ReturnType<typeof matchZoomToWhatsApp>['absent']
    unmatchedZoom: ReturnType<typeof matchZoomToWhatsApp>['unmatchedZoom']
  } | null = null

  for (const g of groups) {
    if (g.members.length === 0) continue
    const members = g.members.map(m => ({
      name: m.contact.name,
      pushName: m.contact.pushName,
      phone: m.phone,
    }))
    const result = matchZoomToWhatsApp(zoomParticipants, members, learnedMatches)
    if (!best || result.matched.length > best.matched.length) {
      best = {
        groupId: g.id,
        moduleNumber: g.moduleNumber,
        matched: result.matched,
        absent: result.absent,
        unmatchedZoom: result.unmatchedZoom,
      }
    }
  }

  if (!best || best.matched.length === 0) {
    return { saved: false, reason: 'No matching group found' }
  }

  // Resolve a module number from the Zoom topic only. Do NOT fall back to
  // group.moduleNumber — that field is the cohort's *current* module, not
  // the module of the meeting we're recording. Using it stamps the wrong
  // number onto historical rows whenever the host's meeting topic is
  // generic ("Theory Class") instead of "Module N - ...". Leave it null
  // and let Teamup recovery or an admin fill it in.
  const moduleNumber = parseModuleFromTopic(opts.topic || '')

  // Upsert so a manual save afterwards still wins (admin can override).
  // The webhook fires once when the host clicks End — we don't expect
  // multiple meeting.ended for the same UUID.
  const existing = await prisma.zoomAttendance.findUnique({
    where: { groupId_meetingUUID: { groupId: best.groupId, meetingUUID: opts.meetingUUID } },
    select: { id: true },
  })
  if (existing) {
    return { saved: false, groupId: best.groupId, reason: 'Already saved (manual entry takes precedence)' }
  }

  await prisma.zoomAttendance.create({
    data: {
      groupId: best.groupId,
      meetingUUID: opts.meetingUUID,
      meetingDate: endedAt,
      moduleNumber,
      matchedRecords: JSON.stringify(best.matched),
      absentRecords: JSON.stringify(best.absent),
      unmatchedZoom: JSON.stringify(best.unmatchedZoom),
    },
  })

  console.log(
    `[auto-save] Saved attendance for meeting ${opts.meetingUUID} ` +
    `under group ${best.groupId} — ${best.matched.length} matched, ${best.absent.length} absent`,
  )
  return { saved: true, groupId: best.groupId, matchedCount: best.matched.length }
}
