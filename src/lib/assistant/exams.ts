import { prisma } from '@/lib/db'
import { PASS_SCORE, TOTAL_QUESTIONS } from '@/lib/exam-questions'
import { paperExamResultIsVerified } from '@/lib/paper-exam-result'
import type { AssistantRange } from '@/lib/assistant/dates'
import { ASSISTANT_TIMEZONE } from '@/lib/assistant/dates'
import { maskPhone, scoreLabel } from '@/lib/assistant/mask'
import { phoneLast10, summarizeSession, type RosterMember, type RosterSubmission } from '@/lib/assistant/roster'

type PaperSubmissionRow = {
  id: string
  contactId: string | null
  phone: string
  studentName: string
  status: string
  score: number | null
  totalQuestions: number | null
  passed: boolean | null
  extractedAnswers: string | null
  receivedAt: Date
}

function inWindow(value: Date | null | undefined, range: AssistantRange): boolean {
  if (!value) return false
  const time = value.getTime()
  return time >= range.start.getTime() && time < range.end.getTime()
}

function serializeSubmission(submission: PaperSubmissionRow, onRoster: boolean) {
  const verified = paperExamResultIsVerified(submission.extractedAnswers)
  const total = submission.totalQuestions
  return {
    studentName: submission.studentName,
    score: submission.score,
    total,
    scoreLabel: scoreLabel(submission.score, total),
    passed: submission.passed,
    status: submission.status,
    verified,
    onRoster,
    receivedAt: submission.receivedAt.toISOString(),
  }
}

function rosterSubmission(submission: PaperSubmissionRow): RosterSubmission {
  return {
    id: submission.id,
    contactId: submission.contactId,
    phone: submission.phone,
    passed: submission.passed,
    status: submission.status,
    verified: paperExamResultIsVerified(submission.extractedAnswers),
  }
}

export async function loadExamReport(range: AssistantRange) {
  const { start, end } = range
  const [sessions, onlineExams] = await Promise.all([
    prisma.paperExamSession.findMany({
      where: {
        OR: [
          { startedAt: { gte: start, lt: end } },
          { submissions: { some: { receivedAt: { gte: start, lt: end } } } },
        ],
      },
      orderBy: { startedAt: 'asc' },
      include: {
        submissions: { orderBy: { receivedAt: 'asc' } },
      },
    }),
    prisma.exam.findMany({
      where: {
        OR: [
          { createdAt: { gte: start, lt: end } },
          {
            attempts: {
              some: {
                OR: [
                  { startedAt: { gte: start, lt: end } },
                  { submittedAt: { gte: start, lt: end } },
                ],
              },
            },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        attempts: {
          where: {
            OR: [
              { startedAt: { gte: start, lt: end } },
              { submittedAt: { gte: start, lt: end } },
            ],
          },
          orderBy: { startedAt: 'asc' },
          select: {
            id: true,
            studentName: true,
            score: true,
            passed: true,
            startedAt: true,
            submittedAt: true,
            timeExpired: true,
          },
        },
      },
    }),
  ])

  const groupIds = [...new Set(sessions.map(session => session.groupId))]
  const members = groupIds.length === 0
    ? []
    : await prisma.groupMember.findMany({
        where: { groupId: { in: groupIds }, isAdmin: false, isSuperAdmin: false },
        include: { contact: { select: { name: true, pushName: true } } },
        orderBy: { createdAt: 'asc' },
      })
  const membersByGroup = new Map<string, RosterMember[]>()
  for (const member of members) {
    const list = membersByGroup.get(member.groupId) || []
    list.push({
      contactId: member.contactId,
      phone: member.phone,
      name: member.contact.name || member.contact.pushName || maskPhone(member.phone) || 'Student',
    })
    membersByGroup.set(member.groupId, list)
  }

  const paperSessions = sessions.map(session => {
    const startedInRange = inWindow(session.startedAt, range)
    const visible = startedInRange
      ? session.submissions
      : session.submissions.filter(submission => inWindow(submission.receivedAt, range))
    const roster = membersByGroup.get(session.groupId) || []
    const summary = summarizeSession(roster, visible.map(rosterSubmission))
    return {
      id: session.id,
      groupName: session.groupName,
      title: session.title,
      status: session.status,
      totalQuestions: session.totalQuestions,
      passingScore: session.passingScore,
      startedAt: session.startedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      submissions: visible.map(submission => {
        const phone = phoneLast10(submission.phone)
        const onRoster = roster.some(member =>
          (submission.contactId && submission.contactId === member.contactId) ||
          (phone.length === 10 && phoneLast10(member.phone) === phone)
        )
        return serializeSubmission(submission, onRoster)
      }),
      summary: {
        roster: summary.roster,
        submitted: summary.submitted,
        passed: summary.passed,
        failed: summary.failed,
        needsReview: summary.needsReview,
        processing: summary.processing,
        missing: summary.missing,
        missingStudents: summary.missingNames,
      },
    }
  })

  const paperSummary = paperSessions.reduce(
    (totals, session) => {
      totals.sessions += 1
      totals.submitted += session.summary.submitted
      totals.passed += session.summary.passed
      totals.failed += session.summary.failed
      totals.needsReview += session.summary.needsReview
      totals.processing += session.summary.processing
      totals.missing += session.summary.missing
      return totals
    },
    { sessions: 0, submitted: 0, passed: 0, failed: 0, needsReview: 0, processing: 0, missing: 0 },
  )

  const online = onlineExams.map(exam => ({
    id: exam.id,
    code: exam.code,
    groupName: exam.groupName,
    active: exam.active,
    totalQuestions: TOTAL_QUESTIONS,
    passingScore: PASS_SCORE,
    createdAt: exam.createdAt.toISOString(),
    attempts: exam.attempts.map(attempt => ({
      studentName: attempt.studentName,
      score: attempt.score,
      total: attempt.submittedAt ? TOTAL_QUESTIONS : null,
      scoreLabel: attempt.submittedAt ? scoreLabel(attempt.score, TOTAL_QUESTIONS) : null,
      passed: attempt.passed,
      status: attempt.submittedAt ? 'submitted' : 'in_progress',
      timeExpired: attempt.timeExpired,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
    })),
  }))

  const onlineAttempts = online.flatMap(exam => exam.attempts)
  const onlineSummary = {
    exams: online.length,
    attempts: onlineAttempts.length,
    submitted: onlineAttempts.filter(attempt => attempt.status === 'submitted').length,
    passed: onlineAttempts.filter(attempt => attempt.passed === true).length,
    failed: onlineAttempts.filter(attempt => attempt.passed === false).length,
    inProgress: onlineAttempts.filter(attempt => attempt.status === 'in_progress').length,
  }

  return {
    timezone: ASSISTANT_TIMEZONE,
    date: range.from === range.to ? range.from : null,
    from: range.from,
    to: range.to,
    window: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    paperExams: {
      summary: paperSummary,
      sessions: paperSessions,
    },
    onlineExams: {
      summary: onlineSummary,
      exams: online,
    },
  }
}
