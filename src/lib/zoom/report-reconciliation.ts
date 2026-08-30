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

  let best: {
    groupId: string
    result: ReturnType<typeof matchZoomToWhatsApp>
  } | null = null

  for (const group of groups) {
    if (group.members.length === 0) continue
    const members = group.members.filter(member => !member.isSuperAdmin).map(member => ({
      name: member.contact.name,
      pushName: member.contact.pushName,
      phone: member.phone,
    }))
    const result = matchZoomToWhatsApp(studentParticipants, members, learnedMatches)
    if (!best || result.matched.length > best.result.matched.length) {
      best = { groupId: group.id, result }
    }
  }

  if (!best || best.result.matched.length === 0) {
    return { reconciled: false, reason: 'Could not match the Zoom report to a group' }
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
