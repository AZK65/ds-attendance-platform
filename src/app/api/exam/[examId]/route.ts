import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MODULE_5_QUESTIONS, PASS_SCORE } from '@/lib/exam-questions'

// GET — Get exam info (public - for students entering the code)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params
  const isCode = request.nextUrl.searchParams.get('byCode') === 'true'

  try {
    const exam = isCode
      ? await prisma.exam.findUnique({ where: { code: examId } })
      : await prisma.exam.findUnique({ where: { id: examId } })

    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    if (!exam.active) {
      return NextResponse.json({ error: 'This exam is no longer active' }, { status: 410 })
    }

    if (exam.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This exam code has expired' }, { status: 410 })
    }

    // For public access, only return basic info (no answers)
    const questionOrder: number[] = JSON.parse(exam.questionOrder)
    const questions = questionOrder.map(idx => {
      const q = MODULE_5_QUESTIONS[idx]
      return {
        id: q.id,
        question: q.question,
        image: q.image || null,
        options: q.options,
        // Don't send correctAnswer to the client!
      }
    })

    return NextResponse.json({
      exam: {
        id: exam.id,
        code: exam.code,
        groupName: exam.groupName,
      },
      questions,
      totalQuestions: questions.length,
      passingScore: PASS_SCORE,
      durationMinutes: 60,
    })
  } catch (error) {
    console.error('Error fetching exam:', error)
    return NextResponse.json({ error: 'Failed to fetch exam' }, { status: 500 })
  }
}

// POST — Start or submit exam attempt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params
  const body = await request.json()
  const { action } = body

  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    if (!exam || !exam.active) {
      return NextResponse.json({ error: 'Exam not found or inactive' }, { status: 404 })
    }

    // START — register student for the exam
    if (action === 'start') {
      const { studentName, studentPhone } = body

      if (!studentName?.trim()) {
        return NextResponse.json({ error: 'Student name is required' }, { status: 400 })
      }

      // Check if student already has an attempt
      const existing = await prisma.examAttempt.findUnique({
        where: { examId_studentName: { examId, studentName: studentName.trim() } },
      })

      if (existing?.submittedAt) {
        return NextResponse.json({ error: 'You have already completed this exam' }, { status: 409 })
      }

      if (existing) {
        // Resume existing attempt
        return NextResponse.json({ attemptId: existing.id, startedAt: existing.startedAt, answers: JSON.parse(existing.answers) })
      }

      // Create new attempt
      const attempt = await prisma.examAttempt.create({
        data: {
          examId,
          studentName: studentName.trim(),
          studentPhone: studentPhone?.replace(/\D/g, '') || null,
          answers: '{}',
        },
      })

      return NextResponse.json({ attemptId: attempt.id, startedAt: attempt.startedAt, answers: {} })
    }

    // SAVE — save progress (auto-save)
    if (action === 'save') {
      const { attemptId, answers } = body

      if (!attemptId) {
        return NextResponse.json({ error: 'attemptId required' }, { status: 400 })
      }

      const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } })
      if (!attempt || attempt.submittedAt) {
        return NextResponse.json({ error: 'Attempt not found or already submitted' }, { status: 400 })
      }

      await prisma.examAttempt.update({
        where: { id: attemptId },
        data: { answers: JSON.stringify(answers) },
      })

      return NextResponse.json({ success: true })
    }

    // SUBMIT — final submission (manual or timer expired)
    if (action === 'submit') {
      const { attemptId, answers, timeExpired } = body

      if (!attemptId) {
        return NextResponse.json({ error: 'attemptId required' }, { status: 400 })
      }

      const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } })
      if (!attempt) {
        return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
      }
      if (attempt.submittedAt) {
        return NextResponse.json({ error: 'Already submitted' }, { status: 409 })
      }

      // Grade the exam
      const questionOrder: number[] = JSON.parse(exam.questionOrder)
      const studentAnswers: Record<string, number> = answers || JSON.parse(attempt.answers)
      let score = 0

      for (let i = 0; i < questionOrder.length; i++) {
        const questionIdx = questionOrder[i]
        const correct = MODULE_5_QUESTIONS[questionIdx].correctAnswer
        if (studentAnswers[String(i)] === correct) {
          score++
        }
      }

      const passed = score >= PASS_SCORE

      await prisma.examAttempt.update({
        where: { id: attemptId },
        data: {
          answers: JSON.stringify(studentAnswers),
          score,
          passed,
          submittedAt: new Date(),
          timeExpired: !!timeExpired,
        },
      })

      return NextResponse.json({
        score,
        totalQuestions: MODULE_5_QUESTIONS.length,
        passed,
        passingScore: PASS_SCORE,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error processing exam:', error)
    return NextResponse.json({ error: 'Failed to process exam' }, { status: 500 })
  }
}
