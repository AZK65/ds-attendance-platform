import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  getRecentMeetings,
  getMeetingParticipantsByUUID,
  matchZoomToWhatsApp,
  type LearnedMatch,
} from '@/lib/zoom/client'
import { getGroupParticipants, getWhatsAppState } from '@/lib/whatsapp/client'

function parseModuleFromTopic(topic: string): number | null {
  const m = (topic || '').match(/\b(?:M(?:od(?:ule)?)?\s*)(\d{1,2})\b/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 12 ? n : null
}

// POST /api/zoom/attendance/backfill?groupId=<id>
// (Optional) ?groupId — if provided, backfills only that group; otherwise
// iterates every group in the DB.
//
// For each (group, recent-meeting) pair where no ZoomAttendance row exists,
// fetches the meeting's Zoom participants, runs the matcher against the
// group's WhatsApp members, and persists the result if matches > 0.
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const onlyGroupId = url.searchParams.get('groupId')

  const state = getWhatsAppState()
  if (!state.isConnected) {
    return NextResponse.json(
      { error: 'WhatsApp is not connected — backfill requires a live connection to look up group members.' },
      { status: 503 },
    )
  }

  const summary = {
    meetingsScanned: 0,
    groupsScanned: 0,
    pairsChecked: 0,
    rowsCreated: 0,
    skippedExisting: 0,
    skippedNoMatch: 0,
    errors: [] as Array<{ where: string; message: string }>,
    perGroup: {} as Record<string, { created: number; skippedExisting: number; skippedNoMatch: number }>,
  }

  // Resolve target groups
  let groups: Array<{ id: string; moduleNumber: number | null }> = []
  try {
    if (onlyGroupId) {
      const g = await prisma.group.findUnique({
        where: { id: onlyGroupId },
        select: { id: true, moduleNumber: true },
      })
      if (g) groups = [g]
    } else {
      groups = await prisma.group.findMany({ select: { id: true, moduleNumber: true } })
    }
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to load groups', details: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
  summary.groupsScanned = groups.length

  // Learned matches (shared across groups)
  const learned = await prisma.zoomNameMatch.findMany()
  const learnedMatches: LearnedMatch[] = learned.map((lm) => ({
    zoomName: lm.zoomName,
    whatsappPhone: lm.whatsappPhone,
    whatsappName: lm.whatsappName,
  }))

  // Recent Zoom meetings (last 30 days)
  let meetings: Awaited<ReturnType<typeof getRecentMeetings>> = []
  try {
    meetings = await getRecentMeetings()
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to fetch recent Zoom meetings', details: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
  summary.meetingsScanned = meetings.length

  // Cache zoom participants per UUID across groups (avoids refetching the
  // same Zoom meeting once per group)
  const zoomParticipantsByUUID = new Map<string, Awaited<ReturnType<typeof getMeetingParticipantsByUUID>>>()

  for (const g of groups) {
    summary.perGroup[g.id] = { created: 0, skippedExisting: 0, skippedNoMatch: 0 }

    let groupMembers: Array<{ name: string | null; pushName: string | null; phone: string }> = []
    try {
      const participants = await getGroupParticipants(g.id)
      groupMembers = participants.map((p) => ({
        name: p.name ?? null,
        pushName: p.pushName ?? null,
        phone: p.phone,
      }))
    } catch (e) {
      summary.errors.push({
        where: `participants(group:${g.id})`,
        message: e instanceof Error ? e.message : String(e),
      })
      continue
    }

    for (const meeting of meetings) {
      summary.pairsChecked++

      // Skip if a row already exists for this (group, meeting)
      const existing = await prisma.zoomAttendance.findUnique({
        where: { groupId_meetingUUID: { groupId: g.id, meetingUUID: meeting.uuid } },
        select: { id: true },
      })
      if (existing) {
        summary.skippedExisting++
        summary.perGroup[g.id].skippedExisting++
        continue
      }

      let zoomParticipants = zoomParticipantsByUUID.get(meeting.uuid)
      if (!zoomParticipants) {
        try {
          zoomParticipants = await getMeetingParticipantsByUUID(meeting.uuid)
          zoomParticipantsByUUID.set(meeting.uuid, zoomParticipants)
        } catch (e) {
          summary.errors.push({
            where: `participants(meeting:${meeting.uuid})`,
            message: e instanceof Error ? e.message : String(e),
          })
          continue
        }
      }

      const result = matchZoomToWhatsApp(zoomParticipants, groupMembers, learnedMatches)
      if (result.matched.length === 0) {
        summary.skippedNoMatch++
        summary.perGroup[g.id].skippedNoMatch++
        continue
      }

      // Only trust the topic for module assignment. Group.moduleNumber is
      // the group's CURRENT module — using it as a fallback would wrongly tag
      // every past class with today's module. We'd rather leave it null and
      // let the user (or fix-modules) infer it chronologically.
      const moduleNumber = parseModuleFromTopic(meeting.topic || '')
      const meetingDate = new Date(meeting.start_time || Date.now())

      try {
        await prisma.zoomAttendance.create({
          data: {
            groupId: g.id,
            meetingUUID: meeting.uuid,
            meetingDate,
            moduleNumber,
            matchedRecords: JSON.stringify(result.matched),
            absentRecords: JSON.stringify(result.absent),
            unmatchedZoom: JSON.stringify(result.unmatchedZoom),
          },
        })
        summary.rowsCreated++
        summary.perGroup[g.id].created++
      } catch (e) {
        summary.errors.push({
          where: `save(${g.id}/${meeting.uuid})`,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  return NextResponse.json(summary)
}
