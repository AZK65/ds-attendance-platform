import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { paperExamLast10 } from '@/lib/paper-exam'
import { MODULE_5_PAPER_EXAM, module5AnswerKeyJson, parsePaperExamAnswerMap } from '@/lib/paper-exam-answer-keys'
import { schedulePaperExamGrading } from '@/lib/paper-exam-grading'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function buildSessionPayload(groupId: string, requestedSessionId?: string | null) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true },
  })
  if (!group) return null

  let session = await prisma.paperExamSession.findFirst({
    where: requestedSessionId ? { id: requestedSessionId, groupId } : { groupId },
    include: {
      submissions: {
        include: { pages: { orderBy: { pageNumber: 'asc' } } },
        orderBy: { receivedAt: 'desc' },
      },
    },
    orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
  })

  if (session && (!session.answerKey || !session.totalQuestions || !session.passingScore)) {
    session = await prisma.paperExamSession.update({
      where: { id: session.id },
      data: {
        answerKey: module5AnswerKeyJson(),
        totalQuestions: MODULE_5_PAPER_EXAM.totalQuestions,
        passingScore: MODULE_5_PAPER_EXAM.passingScore,
      },
      include: {
        submissions: {
          include: { pages: { orderBy: { pageNumber: 'asc' } } },
          orderBy: { receivedAt: 'desc' },
        },
      },
    })
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId, isAdmin: false, isSuperAdmin: false },
    include: { contact: { select: { name: true, pushName: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const history = await prisma.paperExamSession.findMany({
    where: { groupId },
    select: {
      id: true,
      title: true,
      status: true,
      startedAt: true,
      closedAt: true,
      _count: { select: { submissions: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 25,
  })

  if (!session) {
    return {
      group,
      session: null,
      history,
      students: members.map(member => ({
        contactId: member.contactId,
        name: member.contact.name || member.contact.pushName || member.phone,
        phone: member.phone,
        submitted: false,
        submission: null,
      })),
      unmatched: [],
      stats: { total: members.length, submitted: 0, missing: members.length, pages: 0, graded: 0 },
    }
  }

  const submissionByContact = new Map(session.submissions.filter(item => item.contactId).map(item => [item.contactId!, item]))
  const submissionByPhone = new Map(
    session.submissions
      .map(item => [paperExamLast10(item.phone), item] as const)
      .filter(([phone]) => phone.length === 10)
  )
  const matchedSubmissionIds = new Set<string>()

  const students = members.map(member => {
    const submission = submissionByContact.get(member.contactId) || submissionByPhone.get(paperExamLast10(member.phone)) || null
    if (submission) matchedSubmissionIds.add(submission.id)
    return {
      contactId: member.contactId,
      name: member.contact.name || member.contact.pushName || member.phone,
      phone: member.phone,
      submitted: Boolean(submission),
      submission: submission ? serializeSubmission(submission) : null,
    }
  })
  const unmatched = session.submissions
    .filter(item => !matchedSubmissionIds.has(item.id))
    .map(serializeSubmission)
  const pages = session.submissions.reduce((sum, item) => sum + item.pages.length, 0)
  const submitted = students.filter(student => student.submitted).length

  return {
    group,
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      startedAt: session.startedAt,
      closedAt: session.closedAt,
      hasAnswerKey: Boolean(session.answerKey),
      answerKey: parsePaperExamAnswerMap(session.answerKey),
      examName: MODULE_5_PAPER_EXAM.title,
      testNumber: MODULE_5_PAPER_EXAM.testNumber,
      totalQuestions: session.totalQuestions,
      passingScore: session.passingScore,
    },
    history,
    students,
    unmatched,
    stats: {
      total: members.length,
      submitted,
      missing: Math.max(0, members.length - submitted),
      pages,
      graded: session.submissions.filter(item => item.status === 'graded').length,
      review: session.submissions.filter(item => item.status === 'review' || item.status === 'failed').length,
      processing: session.submissions.filter(item => item.status === 'processing' || item.status === 'received').length,
    },
  }
}

function serializeSubmission(submission: {
  id: string
  studentName: string
  phone: string
  senderJid: string
  status: string
  score: number | null
  totalQuestions: number | null
  passed: boolean | null
  confidence: number | null
  error: string | null
  extractedAnswers: string | null
  receivedAt: Date
  pages: Array<{ id: string; pageNumber: number; mimetype: string; filename: string | null; createdAt: Date }>
}) {
  let extraction: {
    answers?: Record<string, string | null>
    uncertain?: number[]
    wrong?: number[]
    notes?: string
  } | null = null
  if (submission.extractedAnswers) {
    try {
      extraction = JSON.parse(submission.extractedAnswers)
    } catch { /* keep malformed legacy data hidden */ }
  }
  return {
    id: submission.id,
    studentName: submission.studentName,
    phone: submission.phone,
    senderJid: submission.senderJid,
    status: submission.status,
    score: submission.score,
    totalQuestions: submission.totalQuestions,
    passed: submission.passed,
    confidence: submission.confidence,
    error: submission.error,
    answers: extraction?.answers || {},
    uncertain: extraction?.uncertain || [],
    wrong: extraction?.wrong || [],
    notes: extraction?.notes || '',
    receivedAt: submission.receivedAt,
    pages: submission.pages.map(page => ({
      id: page.id,
      pageNumber: page.pageNumber,
      mimetype: page.mimetype,
      filename: page.filename,
      createdAt: page.createdAt,
      url: `/api/paper-exams/pages/${encodeURIComponent(page.id)}`,
    })),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const payload = await buildSessionPayload(decodedGroupId, request.nextUrl.searchParams.get('sessionId'))
  if (!payload) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  return NextResponse.json(payload)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const decodedGroupId = decodeURIComponent(groupId)
    const body = await request.json().catch(() => ({})) as { action?: string; title?: string; sessionId?: string }
    const group = await prisma.group.findUnique({ where: { id: decodedGroupId }, select: { id: true, name: true } })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    if (body.action === 'close') {
      if (!body.sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
      await prisma.paperExamSession.updateMany({
        where: { id: body.sessionId, groupId: decodedGroupId, status: 'active' },
        data: { status: 'closed', closedAt: new Date() },
      })
      return NextResponse.json(await buildSessionPayload(decodedGroupId, body.sessionId))
    }

    if (body.action === 'grade-all') {
      if (!body.sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
      const submissions = await prisma.paperExamSubmission.findMany({
        where: {
          sessionId: body.sessionId,
          session: { groupId: decodedGroupId },
          status: { in: ['received', 'review', 'failed'] },
        },
        select: { id: true },
        orderBy: { receivedAt: 'asc' },
      })
      submissions.forEach((submission, index) => schedulePaperExamGrading(submission.id, 500 + index * 1_000))
      return NextResponse.json({ queued: submissions.length })
    }

    if (body.action !== 'start') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const existing = await prisma.paperExamSession.findFirst({
      where: { groupId: decodedGroupId, status: 'active' },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ ...(await buildSessionPayload(decodedGroupId, existing.id)), resumed: true })
    }

    const session = await prisma.paperExamSession.create({
      data: {
        groupId: decodedGroupId,
        groupName: group.name,
        title: body.title?.trim().slice(0, 100) || MODULE_5_PAPER_EXAM.title,
        answerKey: module5AnswerKeyJson(),
        totalQuestions: MODULE_5_PAPER_EXAM.totalQuestions,
        passingScore: MODULE_5_PAPER_EXAM.passingScore,
      },
    })
    return NextResponse.json(await buildSessionPayload(decodedGroupId, session.id), { status: 201 })
  } catch (error) {
    console.error('[PaperExam API] Failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Paper exam action failed' }, { status: 500 })
  }
}
