import { prisma } from '@/lib/db'
import {
  getMeetingParticipantsByUUID,
  matchZoomToWhatsApp,
  type LearnedMatch,
} from '@/lib/zoom/client'

interface ReconcileOptions {
  meetingUUID: string
  topic?: string | null
  endedAt?: Date
}

function parseModuleFromTopic(topic: string): number | null {
  const match = (topic || '').match(/\b(?:M(?:od(?:ule)?)?\s*)(\d{1,2})\b/i)
  if (!match) return null
  const value = parseInt(match[1], 10)
  return value >= 1 && value <= 12 ? value : null
}

export async function reconcileEndedMeetingAttendance(options: ReconcileOptions): Promise<{
  reconciled: boolean
  groupId?: string
  matchedCount?: number
  absentCount?: number
  reason?: string
}> {
  if (!options.meetingUUID) return { reconciled: false, reason: 'Meeting UUID unavailable' }

  const reconciliationKey = `zoom:reconciled:${options.meetingUUID}`
  const alreadyDone = await prisma.appPreference.findUnique({ where: { key: reconciliationKey } })
  if (alreadyDone) return { reconciled: false, reason: 'Already reconciled' }

  let zoomParticipants
  try {
    zoomParticipants = await getMeetingParticipantsByUUID(options.meetingUUID)
  } catch (error) {
    return {
      reconciled: false,
      reason: error instanceof Error ? error.message : 'Zoom report is not ready',
    }
  }
  if (zoomParticipants.length === 0) {
    return { reconciled: false, reason: 'Zoom report has no participants yet' }
  }

  const hostEmails = new Set(
    (process.env.ZOOM_HOST_EMAILS || '')
      .split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
  )
  const studentParticipants = zoomParticipants.filter(participant => {
    const email = participant.user_email?.trim().toLowerCase()
    return !email || !hostEmails.has(email)
  })

  const [groups, learnedRows] = await Promise.all([
    prisma.group.findMany({
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
  const learnedMatches: LearnedMatch[] = learnedRows.map(match => ({
    zoomName: match.zoomName,
    whatsappPhone: match.whatsappPhone,
    whatsappName: match.whatsappName,
  }))

  const scored: Array<{
    groupId: string
    memberCount: number
    result: ReturnType<typeof matchZoomToWhatsApp>
  }> = []

  for (const group of groups) {
    if (group.members.length === 0) continue
    const members = group.members.filter(member => !member.isAdmin && !member.isSuperAdmin).map(member => ({
      name: member.contact.name,
      pushName: member.contact.pushName,
      phone: member.phone,
    }))
    const result = matchZoomToWhatsApp(studentParticipants, members, learnedMatches)
    scored.push({ groupId: group.id, memberCount: members.length, result })
  }

  scored.sort((a, b) => b.result.matched.length - a.result.matched.length)
  const best = scored[0]
  const bestCount = best?.result.matched.length ?? 0
  const secondBestCount = scored[1]?.result.matched.length ?? 0
  const possibleCount = Math.min(best?.memberCount ?? 0, Math.max(studentParticipants.length, 1))
  const coverage = possibleCount > 0 ? bestCount / possibleCount : 0

  if (!best || bestCount < 3 || coverage < 0.25 || bestCount - secondBestCount < 2) {
    return {
      reconciled: false,
      reason: 'Zoom report did not identify one group with enough confidence',
    }
  }

  const attendanceData = {
    meetingDate: options.endedAt ?? new Date(),
    moduleNumber: parseModuleFromTopic(options.topic || ''),
    matchedRecords: JSON.stringify(best.result.matched),
    absentRecords: JSON.stringify(best.result.absent),
    unmatchedZoom: JSON.stringify(best.result.unmatchedZoom),
  }
  await prisma.zoomAttendance.upsert({
    where: {
      groupId_meetingUUID: { groupId: best.groupId, meetingUUID: options.meetingUUID },
    },
    update: attendanceData,
    create: {
      groupId: best.groupId,
      meetingUUID: options.meetingUUID,
      ...attendanceData,
    },
  })
  await prisma.appPreference.create({
    data: { key: reconciliationKey, value: new Date().toISOString() },
  })

  console.log(
    `[Zoom reconciliation] ${options.meetingUUID}: ${best.result.matched.length} present, ` +
    `${best.result.absent.length} absent in ${best.groupId}`,
  )
  return {
    reconciled: true,
    groupId: best.groupId,
    matchedCount: best.result.matched.length,
    absentCount: best.result.absent.length,
  }
}
