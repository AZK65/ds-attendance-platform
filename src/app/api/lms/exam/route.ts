import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getLmsAccount, logLmsEvent } from '@/lib/lms'

const EXAM_SIZE = 24

// POST /api/lms/exam — start a mock exam. Serves a shuffled subset of the
// student's vehicle-type question bank (without the correct answers).
export async function POST(request: NextRequest) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const bank = await prisma.lmsQuestion.findMany({ where: { vehicleType: account.vehicleType } })
  if (bank.length === 0) return NextResponse.json({ error: 'No questions available yet' }, { status: 404 })

  // Shuffle and take up to EXAM_SIZE.
  const shuffled = [...bank].sort(() => Math.random() - 0.5).slice(0, Math.min(EXAM_SIZE, bank.length))
  const attempt = await prisma.lmsExamAttempt.create({
    data: {
      accountId: account.id,
      vehicleType: account.vehicleType,
      questions: JSON.stringify(shuffled.map(q => q.id)),
      total: shuffled.length,
    },
  })
  logLmsEvent(account.id, 'exam_start', `${shuffled.length} questions`)

  return NextResponse.json({
    attemptId: attempt.id,
    questions: shuffled.map(q => ({
      id: q.id,
      question: q.question,
      options: JSON.parse(q.options),
      imageUrl: q.imageUrl,
    })),
  })
}

// PUT /api/lms/exam — submit answers. Body: { attemptId, answers: {qid: index} }
// Grades server-side and returns score + which questions were wrong.
export async function PUT(request: NextRequest) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const attemptId = String(body?.attemptId || '')
  const answers = (body?.answers && typeof body.answers === 'object') ? body.answers as Record<string, number> : {}

  const attempt = await prisma.lmsExamAttempt.findUnique({ where: { id: attemptId } })
  if (!attempt || attempt.accountId !== account.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.submittedAt) return NextResponse.json({ error: 'Already submitted' }, { status: 409 })

  const qIds: string[] = JSON.parse(attempt.questions)
  const questions = await prisma.lmsQuestion.findMany({ where: { id: { in: qIds } } })
  const byId = new Map(questions.map(q => [q.id, q]))

  let score = 0
  const review = qIds.map(id => {
    const q = byId.get(id)
    if (!q) return null
    const selected = answers[id]
    const correct = selected === q.correctIndex
    if (correct) score++
    return {
      id,
      question: q.question,
      options: JSON.parse(q.options) as string[],
      selectedIndex: selected ?? null,
      correctIndex: q.correctIndex,
      correct,
    }
  }).filter(Boolean)

  await prisma.lmsExamAttempt.update({
    where: { id: attemptId },
    data: { answers: JSON.stringify(answers), score, submittedAt: new Date() },
  })
  const total = qIds.length
  logLmsEvent(account.id, 'exam_submit', `${score}/${total}`)

  return NextResponse.json({
    score,
    total,
    passed: total > 0 && score / total >= 0.75,
    review,
  })
}
