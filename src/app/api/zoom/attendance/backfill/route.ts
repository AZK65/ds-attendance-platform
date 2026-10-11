import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  getRecentMeetings,
  getMeetingParticipantsByUUID,
  matchZoomToWhatsApp,
  type LearnedMatch,
  type ZoomAttendanceResult,
} from '@/lib/zoom/client'

function parseModuleFromTopic(topic: string): number | null {
  const match = (topic || '').match(/\b(?:M(?:od(?:ule)?)?\s*)(\d{1,2})\b/i)
  if (!match) return null
  const value = parseInt(match[1], 10)
  return value >= 1 && value <= 12 ? value : null
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(-10)
}

function normalizeZoomName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function mergeSavedMatches(
  current: {
    matchedRecords: string
    absentRecords: string
    unmatchedZoom: string
  },
  refreshed: ZoomAttendanceResult,
) {
  const savedMatched = JSON.parse(current.matchedRecords) as ZoomAttendanceResult['matched']
  const savedPhones = new Set(savedMatched.map(item => normalizePhone(item.whatsappPhone)))
  const savedZoomNames = new Set(savedMatched.map(item => normalizeZoomName(item.zoomName)))

  const additions = refreshed.matched.filter(item => (
    !savedPhones.has(normalizePhone(item.whatsappPhone)) &&
    !savedZoomNames.has(normalizeZoomName(item.zoomName))
  ))
  const matched = [...savedMatched, ...additions]
  const matchedPhones = new Set(matched.map(item => normalizePhone(item.whatsappPhone)))
  const matchedZoomNames = new Set(matched.map(item => normalizeZoomName(item.zoomName)))

  // Use the freshly scored roster, while preserving manual/saved matches that
  // may no longer exist in today's cached WhatsApp membership.
  const absent = refreshed.absent.filter(item => !matchedPhones.has(normalizePhone(item.phone)))
  const unmatchedZoom = refreshed.unmatchedZoom.filter(
    item => !matchedZoomNames.has(normalizeZoomName(item.name)),
  )

  return { matched, absent, unmatchedZoom, additions: additions.length }
}

// POST /api/zoom/attendance/backfill?groupId=<id>
//
// Rebuilds recent completed-meeting attendance from Zoom's final reports.
// Cached GroupMember rows are deliberately used instead of the live WhatsApp
// client so a disconnected/restarting WhatsApp session cannot block recovery.
// Each meeting is scored against every cohort once and only the clear winner
// is written; the previous implementation paired every meeting with every
// group, which created false duplicate attendance rows.
export async function POST(request: NextRequest) {
  const onlyGroupId = request.nextUrl.searchParams.get('groupId')
  const summary = {
    meetingsScanned: 0,
    groupsScanned: 0,
    rowsCreated: 0,
    rowsRepaired: 0,
    matchesAdded: 0,
    weakDuplicatesRemoved: 0,
    skippedAmbiguous: 0,
    skippedNoImprovement: 0,
    errors: [] as Array<{ where: string; message: string }>,
  }

  const [groups, learnedRows] = await Promise.all([
    prisma.group.findMany({
      where: onlyGroupId ? { id: onlyGroupId } : undefined,
      select: {
        id: true,
        members: {
          select: {
            phone: true,
            isAdmin: true,
            isSuperAdmin: true,
            contact: { select: { name: true, pushName: true } },
          },
        },
      },
    }),
    prisma.zoomNameMatch.findMany(),
  ])
  summary.groupsScanned = groups.length

  const learnedMatches: LearnedMatch[] = learnedRows.map(match => ({
    zoomName: match.zoomName,
    whatsappPhone: match.whatsappPhone,
    whatsappName: match.whatsappName,
  }))

  let meetings: Awaited<ReturnType<typeof getRecentMeetings>>
  try {
    meetings = await getRecentMeetings()
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch recent Zoom meetings',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
  summary.meetingsScanned = meetings.length

  const hostEmails = new Set(
    (process.env.ZOOM_HOST_EMAILS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  )

  for (const meeting of meetings) {
    let zoomParticipants: Awaited<ReturnType<typeof getMeetingParticipantsByUUID>>
    try {
      zoomParticipants = (await getMeetingParticipantsByUUID(meeting.uuid)).filter(participant => {
        const email = participant.user_email?.trim().toLowerCase()
        return !email || !hostEmails.has(email)
      })
    } catch (error) {
      summary.errors.push({
        where: `participants(meeting:${meeting.uuid})`,
        message: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    const scored = groups
      .map(group => {
        const members = group.members
          .filter(member => !member.isAdmin && !member.isSuperAdmin)
          .map(member => ({
            name: member.contact.name,
            pushName: member.contact.pushName,
            phone: member.phone,
          }))
        return {
          groupId: group.id,
          memberCount: members.length,
          result: matchZoomToWhatsApp(zoomParticipants, members, learnedMatches),
        }
      })
      .filter(score => score.memberCount > 0)
      .sort((a, b) => b.result.matched.length - a.result.matched.length)

    const best = scored[0]
    const secondBestCount = scored[1]?.result.matched.length ?? 0
    const bestCount = best?.result.matched.length ?? 0
    const possibleCount = Math.min(best?.memberCount ?? 0, Math.max(zoomParticipants.length, 1))
    const coverage = possibleCount > 0 ? bestCount / possibleCount : 0

    // A single loose name match is not enough to assign a whole class. The
    // winning cohort must have multiple students, useful roster coverage,
    // and a clear lead over the next cohort.
    const confident = Boolean(
      best &&
      bestCount >= 3 &&
      coverage >= 0.25 &&
      (onlyGroupId || bestCount - secondBestCount >= 2),
    )
    if (!confident || !best) {
      summary.skippedAmbiguous++
      continue
    }

    const existingRows = await prisma.zoomAttendance.findMany({
      where: { meetingUUID: meeting.uuid },
    })
    const target = existingRows.find(row => row.groupId === best.groupId)
    const meetingDate = new Date(meeting.start_time || Date.now())
    const moduleNumber = parseModuleFromTopic(meeting.topic || '')
    let relocatedRowId: string | null = null

    if (target) {
      const merged = mergeSavedMatches(target, best.result)
      if (merged.additions > 0) {
        await prisma.zoomAttendance.update({
          where: { id: target.id },
          data: {
            matchedRecords: JSON.stringify(merged.matched),
            absentRecords: JSON.stringify(merged.absent),
            unmatchedZoom: JSON.stringify(merged.unmatchedZoom),
          },
        })
        summary.rowsRepaired++
        summary.matchesAdded += merged.additions
      } else {
        summary.skippedNoImprovement++
      }
    } else {
      // If the meeting was previously attached to a clearly wrong cohort,
      // move that weak row instead of creating another duplicate.
      const weakRow = existingRows.find(row => {
        try {
          return (JSON.parse(row.matchedRecords) as unknown[]).length <= 1
        } catch {
          return true
        }
      })
      const data = {
        groupId: best.groupId,
        meetingDate,
        moduleNumber,
        matchedRecords: JSON.stringify(best.result.matched),
        absentRecords: JSON.stringify(best.result.absent),
        unmatchedZoom: JSON.stringify(best.result.unmatchedZoom),
      }

      if (weakRow && bestCount >= 5) {
        await prisma.zoomAttendance.update({ where: { id: weakRow.id }, data })
        relocatedRowId = weakRow.id
        summary.rowsRepaired++
        summary.matchesAdded += bestCount
      } else {
        await prisma.zoomAttendance.create({
          data: { meetingUUID: meeting.uuid, ...data },
        })
        summary.rowsCreated++
        summary.matchesAdded += bestCount
      }
    }

    // Remove only unmistakable duplicates: same Zoom instance, wrong group,
    // zero/one match, while the winning row has at least five matches.
    if (bestCount >= 5) {
      const weakDuplicateIds = existingRows
        .filter(row => row.groupId !== best.groupId && row.id !== relocatedRowId)
        .filter(row => {
          try {
            return (JSON.parse(row.matchedRecords) as unknown[]).length <= 1
          } catch {
            return true
          }
        })
        .map(row => row.id)

      if (weakDuplicateIds.length > 0) {
        const removed = await prisma.zoomAttendance.deleteMany({
          where: { id: { in: weakDuplicateIds } },
        })
        summary.weakDuplicatesRemoved += removed.count
      }
    }
  }

  return NextResponse.json(summary)
}
