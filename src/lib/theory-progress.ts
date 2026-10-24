/**
 * Read model for Class 1 theory. Screens and the bot use this instead of
 * Teamup titles and gross durations. Correction-log rows and evidenceRef
 * are internal and are not returned.
 */
import { prisma } from '@/lib/db'
import {
  CLASS1_THEORY_PROGRAM,
  CLASS1_THEORY_REQUIRED_NET_MINUTES,
  CLASS1_THEORY_REQUIRED_SESSIONS,
  formatBreaksLabel,
  formatHoraireRows,
  formatInstructorLine,
  formatNet,
  formatReportHoursLine,
  parseBreaksJson,
  theoryAttendanceDisplay,
  theoryClassLabel,
  torontoToday,
  type TheoryBreak,
} from '@/lib/theory-hours'

function lastTen(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '').slice(-10)
}

export interface TheoryProgressSession {
  id: string
  sessionNumber: number
  date: string
  startTime: string
  endTime: string
  netMinutes: number
  netLabel: string
  label: string
  breaks: TheoryBreak[]
  breaksLabel: string
  approximateBreaks: boolean
  status: string
  teamupEventId: string | null
  source: string
  attendance: {
    status: string
    basis: string
    signatureId: string | null
    signedAt: string | null
    displayEn: string
    displayFr: string
    staffNote: string | null
  } | null
}

export interface TheoryProgress {
  groupId: string
  phone: string
  program: { code: string; requiredNetMinutes: number; requiredSessions: number }
  instructor: {
    legalName: string
    displayName: string
    saaqInstructorNo: string | null
    pending: boolean
  } | null
  sessions: TheoryProgressSession[]
  attendedNetMinutes: number
  attendedCount: number
  requiredNetMinutes: number
  requiredSessions: number
  scheduledNetMinutes: number
  hoursLineEn: string
  hoursLineFr: string
  instructorLineEn: string
  instructorLineFr: string
  horaireEn: string[]
  horaireFr: string[]
}

export async function getTheoryProgress(groupId: string, phone: string): Promise<TheoryProgress> {
  const suffix = lastTen(phone)
  const [program, sessions] = await Promise.all([
    prisma.theoryProgram.findUnique({ where: { code: CLASS1_THEORY_PROGRAM.code } }),
    prisma.theorySession.findMany({
      where: { groupId },
      orderBy: { sessionNumber: 'asc' },
    }),
  ])
  const instructorId = sessions.find(session => session.instructorId)?.instructorId || null
  const instructor = instructorId
    ? await prisma.instructor.findUnique({ where: { id: instructorId } })
    : null

  const requiredNetMinutes = program?.requiredNetMinutes ?? CLASS1_THEORY_REQUIRED_NET_MINUTES
  const requiredSessions = program?.requiredSessions ?? CLASS1_THEORY_REQUIRED_SESSIONS
  const templateIds = [...new Set(sessions.map(session => session.templateVersionId).filter((id): id is string => !!id))]
  const templates = templateIds.length
    ? await prisma.theoryTemplateVersion.findMany({ where: { id: { in: templateIds } } })
    : []
  const approximateById = new Map(templates.map(template => [template.id, template.approximateBreakTimes]))

  const attendance = suffix.length >= 7 && sessions.length
    ? await prisma.theoryAttendance.findMany({
      where: { sessionId: { in: sessions.map(session => session.id) } },
    })
    : []
  const mine = attendance.filter(row => lastTen(row.studentPhone) === suffix)
  const bySession = new Map(mine.map(row => [row.sessionId, row]))
  const signatureIds = mine.map(row => row.signatureId).filter((id): id is string => !!id)
  const signatures = signatureIds.length
    ? await prisma.classSignature.findMany({
      where: { id: { in: signatureIds } },
      select: { id: true, signedAt: true },
    })
    : []
  const signedAtById = new Map(signatures.map(signature => [signature.id, signature.signedAt.toISOString()]))

  const today = torontoToday()
  const view: TheoryProgressSession[] = sessions.map(session => {
    const row = bySession.get(session.id)
    const recorded = row
      ? theoryAttendanceDisplay({
        status: row.status,
        basis: row.basis,
        confirmedBy: row.confirmedBy,
        confirmedAt: row.confirmedAt,
      })
      : theoryAttendanceDisplay({ status: session.date > today ? null : null })
    const breaks = parseBreaksJson(session.breaksJson)
    const approximate = session.templateVersionId ? approximateById.get(session.templateVersionId) === true : breaks.some(entry => entry.approximate)
    return {
      id: session.id,
      sessionNumber: session.sessionNumber,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      netMinutes: session.netMinutes,
      netLabel: formatNet(session.netMinutes),
      label: theoryClassLabel(session.sessionNumber, requiredSessions),
      breaks,
      breaksLabel: formatBreaksLabel(breaks, approximate),
      approximateBreaks: approximate,
      status: session.status,
      teamupEventId: session.teamupEventId,
      source: session.source,
      attendance: {
        status: row?.status || (session.date > today ? 'scheduled' : 'scheduled'),
        basis: row?.basis || '',
        signatureId: row?.basis === 'signature' ? row.signatureId : null,
        signedAt: row?.signatureId ? signedAtById.get(row.signatureId) || null : null,
        displayEn: recorded.en,
        displayFr: recorded.fr,
        staffNote: recorded.staffNote,
      },
    }
  })

  const attended = view.filter(session => session.attendance?.status === 'present')
  const attendedNetMinutes = attended.reduce((sum, session) => sum + session.netMinutes, 0)
  const attendedCount = attended.length
  const instructorView = instructor
    ? {
      legalName: instructor.legalName,
      displayName: instructor.displayName,
      saaqInstructorNo: instructor.saaqInstructorNo,
      pending: !instructor.saaqInstructorNo,
    }
    : null

  const hoursArgs = {
    attendedNetMinutes,
    attendedCount,
    requiredNetMinutes,
    requiredSessions,
  }
  const horaire = formatHoraireRows(view, requiredSessions)
  return {
    groupId,
    phone: suffix,
    program: {
      code: program?.code ?? CLASS1_THEORY_PROGRAM.code,
      requiredNetMinutes,
      requiredSessions,
    },
    instructor: instructorView,
    sessions: view,
    attendedNetMinutes,
    attendedCount,
    requiredNetMinutes,
    requiredSessions,
    scheduledNetMinutes: view.reduce((sum, session) => sum + session.netMinutes, 0),
    hoursLineEn: formatReportHoursLine({ ...hoursArgs, lang: 'en' }),
    hoursLineFr: formatReportHoursLine({ ...hoursArgs, lang: 'fr' }),
    instructorLineEn: instructorView ? formatInstructorLine(instructorView, 'en') : '',
    instructorLineFr: instructorView ? formatInstructorLine(instructorView, 'fr') : '',
    horaireEn: horaire.map(row => row.lineEn),
    horaireFr: horaire.map(row => row.lineFr),
  }
}

export async function listTheorySessions(groupId: string) {
  const [program, sessions] = await Promise.all([
    prisma.theoryProgram.findUnique({ where: { code: CLASS1_THEORY_PROGRAM.code } }),
    prisma.theorySession.findMany({ where: { groupId }, orderBy: { sessionNumber: 'asc' } }),
  ])
  const requiredSessions = program?.requiredSessions ?? CLASS1_THEORY_REQUIRED_SESSIONS
  const requiredNetMinutes = program?.requiredNetMinutes ?? CLASS1_THEORY_REQUIRED_NET_MINUTES
  const instructorId = sessions.find(session => session.instructorId)?.instructorId || null
  const instructor = instructorId
    ? await prisma.instructor.findUnique({ where: { id: instructorId } })
    : null
  const instructorView = instructor
    ? { legalName: instructor.legalName, saaqInstructorNo: instructor.saaqInstructorNo }
    : null
  const scheduledNetMinutes = sessions.reduce((sum, session) => sum + session.netMinutes, 0)
  return {
    requiredSessions,
    requiredNetMinutes,
    scheduledNetMinutes,
    scheduledNetLabel: formatNet(scheduledNetMinutes),
    instructorLineEn: instructorView ? formatInstructorLine(instructorView, 'en') : '',
    instructorLineFr: instructorView ? formatInstructorLine(instructorView, 'fr') : '',
    sessions: sessions.map(session => ({
      id: session.id,
      sessionNumber: session.sessionNumber,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      netMinutes: session.netMinutes,
      netLabel: formatNet(session.netMinutes),
      label: theoryClassLabel(session.sessionNumber, requiredSessions),
      breaksLabel: formatBreaksLabel(parseBreaksJson(session.breaksJson)),
      status: session.status,
      teamupEventId: session.teamupEventId,
      source: session.source,
    })),
  }
}
