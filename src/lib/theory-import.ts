/**
 * Apply the approved Class 1 theory import for #001 and #002.
 * Creates TheorySession, TheoryAttendance, and internal TheoryCorrection rows.
 * Never writes Teamup events, reminder text, or ClassSignature images.
 */
import { prisma } from '@/lib/db'
import {
  COHORT_001_NAME,
  COHORT_002_NAME,
  CONFIRMED_BY,
  CONFIRMED_ON,
  EVIDENCE_ADMIN,
  EVIDENCE_ATTENDANCE,
  correctionEntryCount,
  plannedCorrections,
  plannedSessions,
  type PlannedSession,
} from '@/lib/theory-cohort-plan'
import { ensureTheoryProgram } from '@/lib/theory-seed'
import { torontoToday } from '@/lib/theory-hours'

const GROUP_NAMES: Record<'#001' | '#002', string> = {
  '#001': COHORT_001_NAME,
  '#002': COHORT_002_NAME,
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function lastTen(value: string): string {
  return value.replace(/\D/g, '').slice(-10)
}

export interface ImportCohortResult {
  cohort: '#001' | '#002'
  groupName: string
  groupId: string | null
  sessions: number
  netMinutes: number
  sessionsWritten: number
  attendanceWritten: number
  correctionsWritten: number
  plannedCorrections: number
  warnings: string[]
}

async function findGroup(name: string) {
  const groups = await prisma.group.findMany({ select: { id: true, name: true } })
  const wanted = normalizeName(name)
  return groups.find(group => normalizeName(group.name) === wanted) || null
}

async function correctionExists(entityType: string, entityId: string, kind: string, reason: string) {
  const existing = await prisma.theoryCorrection.findFirst({
    where: { entityType, entityId, kind, reason },
    select: { id: true },
  })
  return !!existing
}

async function writeCorrection(args: {
  entityType: string
  entityId: string
  kind: string
  reason: string
  beforeJson?: string | null
  afterJson?: string | null
}) {
  if (await correctionExists(args.entityType, args.entityId, args.kind, args.reason)) return false
  await prisma.theoryCorrection.create({
    data: {
      entityType: args.entityType,
      entityId: args.entityId,
      kind: args.kind,
      reason: args.reason,
      beforeJson: args.beforeJson ?? null,
      afterJson: args.afterJson ?? null,
      approvedBy: 'Ars (administration)',
      internalOnly: true,
    },
  })
  return true
}

export async function applyTheoryImport(cohorts: Array<'#001' | '#002'> = ['#001', '#002']): Promise<ImportCohortResult[]> {
  const seeded = await ensureTheoryProgram()
  const templateByVersion = new Map<number, string>([
    [1, seeded.templateV1.id],
    [2, seeded.templateV2.id],
  ])
  const today = torontoToday()
  const plan = plannedSessions().filter(session => cohorts.includes(session.cohort))
  const results: ImportCohortResult[] = []

  for (const cohort of cohorts) {
    const groupName = GROUP_NAMES[cohort]
    const sessions = plan.filter(session => session.cohort === cohort)
    const result: ImportCohortResult = {
      cohort,
      groupName,
      groupId: null,
      sessions: sessions.length,
      netMinutes: sessions.reduce((sum, session) => sum + session.netMinutes, 0),
      sessionsWritten: 0,
      attendanceWritten: 0,
      correctionsWritten: 0,
      plannedCorrections: sessions.reduce((sum, session) => sum + correctionEntryCount(session), 0),
      warnings: [],
    }
    const group = await findGroup(groupName)
    if (!group) {
      result.warnings.push(`Group "${groupName}" was not found. Nothing was written for this cohort.`)
      results.push(result)
      continue
    }
    result.groupId = group.id

    const eventIds = sessions.map(session => session.teamupEventId).filter((id): id is string => !!id)
    const signatures = await prisma.classSignature.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true, eventId: true, studentPhone: true, studentName: true },
    })
    const classOne = sessions.find(session => session.session === 1)
    const studentSource = cohort === '#002'
      ? signatures.filter(signature => signature.eventId === classOne?.teamupEventId)
      : signatures
    const phones = new Map<string, string>()
    for (const signature of studentSource) {
      const suffix = lastTen(signature.studentPhone)
      if (suffix.length >= 7 && !phones.has(suffix)) phones.set(suffix, signature.studentPhone)
    }
    if (phones.size === 0) {
      result.warnings.push('No ClassSignature rows were found, so attendance rows were not invented.')
    }

    for (const session of sessions) {
      const written = await writeSession(session, group.id, seeded, templateByVersion, today)
      if (written.created) result.sessionsWritten += 1
      result.correctionsWritten += written.corrections

      const eventSignatures = signatures.filter(signature => signature.eventId === session.teamupEventId)
      if (session.annotation) {
        if (eventSignatures.length === 0) {
          result.warnings.push(`Session ${session.session}: no signatures to annotate.`)
        }
        for (const signature of eventSignatures) {
          const added = await writeCorrection({
            entityType: 'ClassSignature',
            entityId: signature.id,
            kind: 'SIGNATURE_ANNOTATION',
            reason: session.annotation,
          })
          if (added) result.correctionsWritten += 1
        }
      }

      if (session.attendanceMode === 'none' || phones.size === 0) continue
      for (const phone of phones.values()) {
        const signature = eventSignatures.find(row => lastTen(row.studentPhone) === lastTen(phone)) || null
        if ((session.attendanceMode === 'signature_copy' || session.attendanceMode === 'signature_original') && !signature) {
          result.warnings.push(`Session ${session.session}: no signature for ${phone}; attendance row skipped.`)
          continue
        }
        const basis = session.attendanceMode === 'admin_confirmed' ? 'admin_confirmed' : 'signature'
        const existing = await prisma.theoryAttendance.findUnique({
          where: { sessionId_studentPhone: { sessionId: written.id, studentPhone: phone } },
          select: { id: true },
        })
        if (!existing) {
          await prisma.theoryAttendance.create({
            data: {
              sessionId: written.id,
              studentPhone: phone,
              status: 'present',
              basis,
              signatureId: basis === 'signature' ? signature?.id ?? null : null,
              confirmedBy: basis === 'admin_confirmed' ? CONFIRMED_BY : null,
              confirmedAt: basis === 'admin_confirmed' ? CONFIRMED_ON : null,
              evidenceRef: session.attendanceMode === 'signature_copy'
                ? EVIDENCE_ATTENDANCE
                : session.attendanceMode === 'admin_confirmed'
                  ? EVIDENCE_ADMIN
                  : null,
            },
          })
          result.attendanceWritten += 1
        }
      }
    }
    results.push(result)
  }
  return results
}

async function writeSession(
  session: PlannedSession,
  groupId: string,
  seeded: Awaited<ReturnType<typeof ensureTheoryProgram>>,
  templateByVersion: Map<number, string>,
  today: string,
): Promise<{ id: string; created: boolean; corrections: number }> {
  const data = {
    groupId,
    programId: seeded.program.id,
    templateVersionId: templateByVersion.get(session.templateVersion) ?? null,
    sessionNumber: session.session,
    teamupEventId: session.teamupEventId,
    date: session.date,
    startTime: session.recordedStart,
    endTime: session.recordedEnd,
    breaksJson: JSON.stringify(session.breaks),
    netMinutes: session.netMinutes,
    status: session.date < today ? 'held' : 'scheduled',
    source: session.teamupEventId ? 'imported' : 'manual',
    instructorId: seeded.instructor.id,
  }
  const existing = await prisma.theorySession.findUnique({
    where: { groupId_sessionNumber: { groupId, sessionNumber: session.session } },
  })
  const row = existing
    ? await prisma.theorySession.update({ where: { id: existing.id }, data })
    : await prisma.theorySession.create({ data })

  let corrections = 0
  for (const planned of plannedCorrections(session)) {
    if (planned.kind === 'SIGNATURE_ANNOTATION') continue
    const added = await writeCorrection({
      entityType: 'TheorySession',
      entityId: row.id,
      kind: planned.kind,
      reason: planned.reason,
      beforeJson: planned.kind === 'TIME_CORRECTION'
        ? JSON.stringify({ time: session.teamupTime, source: 'teamup' })
        : planned.kind === 'NET_DURATION'
          ? JSON.stringify({ grossHours: session.grossHours, teamupTime: session.teamupTime })
          : null,
      afterJson: JSON.stringify({
        time: `${session.recordedStart}-${session.recordedEnd}`,
        netMinutes: session.netMinutes,
      }),
    })
    if (added) corrections += 1
  }
  return { id: row.id, created: !existing, corrections }
}
