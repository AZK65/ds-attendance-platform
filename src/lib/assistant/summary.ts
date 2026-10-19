import { prisma } from '@/lib/db'
import type { AssistantRange } from '@/lib/assistant/dates'
import { ASSISTANT_TIMEZONE } from '@/lib/assistant/dates'
import { loadExamReport } from '@/lib/assistant/exams'

const STUDY_PASS_RATIO = 0.75

function arrayLength(value: string): number {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

export async function loadDailySummary(range: AssistantRange) {
  const { start, end } = range
  const window = { gte: start, lt: end }

  const [
    exams,
    attendance,
    zoomMeetings,
    signatures,
    invoices,
    leads,
    registrationsSubmitted,
    registrationDrafts,
    messages,
    scheduledSent,
    studyAttempts,
    studentsAdded,
  ] = await Promise.all([
    loadExamReport(range),
    prisma.attendanceRecord.findMany({
      where: { date: window },
      select: { status: true },
    }),
    prisma.zoomAttendance.findMany({
      where: { meetingDate: window },
      select: { matchedRecords: true, absentRecords: true },
    }),
    prisma.classSignature.count({ where: { signedAt: window } }),
    prisma.invoice.findMany({
      where: {
        OR: [
          { createdAt: window },
          { invoiceDate: { gte: range.from, lte: range.to } },
        ],
      },
      select: { paymentStatus: true, total: true },
    }),
    prisma.lead.count({ where: { isTest: false, createdAt: window } }),
    prisma.studentRegistration.count({ where: { submittedAt: window } }),
    prisma.studentRegistration.count({ where: { status: 'draft', createdAt: window } }),
    prisma.messageLog.groupBy({
      by: ['status'],
      where: { createdAt: window },
      _count: { _all: true },
    }),
    prisma.scheduledMessage.count({ where: { sentAt: window } }),
    prisma.lmsExamAttempt.findMany({
      where: { OR: [{ startedAt: window }, { submittedAt: window }] },
      select: { score: true, total: true, submittedAt: true },
    }),
    prisma.student.count({ where: { createdAt: window } }),
  ])

  const attendanceCounts = { total: attendance.length, present: 0, absent: 0, excused: 0, other: 0 }
  for (const record of attendance) {
    if (record.status === 'present') attendanceCounts.present += 1
    else if (record.status === 'absent') attendanceCounts.absent += 1
    else if (record.status === 'excused') attendanceCounts.excused += 1
    else attendanceCounts.other += 1
  }

  let zoomPresent = 0
  let zoomAbsent = 0
  for (const meeting of zoomMeetings) {
    zoomPresent += arrayLength(meeting.matchedRecords)
    zoomAbsent += arrayLength(meeting.absentRecords)
  }

  const messagesSent = messages
    .filter(row => row.status === 'sent')
    .reduce((sum, row) => sum + row._count._all, 0)

  const studySubmitted = studyAttempts.filter(attempt => attempt.submittedAt)
  const studyPassed = studySubmitted.filter(attempt =>
    attempt.score != null && attempt.total != null && attempt.total > 0 && attempt.score / attempt.total >= STUDY_PASS_RATIO
  ).length

  const invoiceTotal = Math.round(invoices.reduce((sum, invoice) => sum + invoice.total, 0) * 100) / 100

  return {
    timezone: ASSISTANT_TIMEZONE,
    date: range.from === range.to ? range.from : null,
    from: range.from,
    to: range.to,
    window: exams.window,
    exams: {
      paper: exams.paperExams.summary,
      online: exams.onlineExams.summary,
      study: {
        attempts: studyAttempts.length,
        submitted: studySubmitted.length,
        passed: studyPassed,
      },
    },
    attendance: {
      sheets: attendanceCounts,
      zoomMeetings: zoomMeetings.length,
      zoomPresent,
      zoomAbsent,
      inCarSignatures: signatures,
    },
    office: {
      studentsAdded,
      invoices: {
        count: invoices.length,
        unpaid: invoices.filter(invoice => invoice.paymentStatus !== 'paid').length,
        total: invoiceTotal,
      },
      leads,
      registrationsSubmitted,
      registrationDrafts,
      messagesSent,
      scheduledMessagesSent: scheduledSent,
    },
  }
}
