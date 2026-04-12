import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MODULE_5_QUESTIONS, shuffleArray } from '@/lib/exam-questions'

// POST — Generate a new exam code for a group
export async function POST(request: NextRequest) {
  try {
    const { groupId, groupName } = await request.json()

    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 })
    }

    // Generate a short unique code
    const code = `EXAM-${Date.now().toString(36).toUpperCase().slice(-4)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`

    // Shuffle question order for this exam
    const questionOrder = shuffleArray(MODULE_5_QUESTIONS.map((_, i) => i))

    const exam = await prisma.exam.create({
      data: {
        code,
        groupId,
        groupName: groupName || 'Unknown Group',
        questionOrder: JSON.stringify(questionOrder),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 day expiry
      },
    })

    return NextResponse.json({ exam: { id: exam.id, code: exam.code } })
  } catch (error) {
    console.error('Error creating exam:', error)
    return NextResponse.json({ error: 'Failed to create exam' }, { status: 500 })
  }
}

// GET — List exams (admin)
export async function GET(request: NextRequest) {
  try {
    const groupId = request.nextUrl.searchParams.get('groupId')

    const where = groupId ? { groupId } : {}
    const exams = await prisma.exam.findMany({
      where,
      include: {
        _count: { select: { attempts: true } },
        attempts: {
          select: { id: true, studentName: true, score: true, passed: true, submittedAt: true, startedAt: true, timeExpired: true },
          orderBy: { startedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ exams })
  } catch (error) {
    console.error('Error fetching exams:', error)
    return NextResponse.json({ error: 'Failed to fetch exams' }, { status: 500 })
  }
}
