import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MODULE_5_QUESTIONS } from '@/lib/exam-questions'

// GET /api/lms/admin/questions?vehicleType=car
export async function GET(request: NextRequest) {
  const vehicleType = request.nextUrl.searchParams.get('vehicleType') === 'truck' ? 'truck' : 'car'
  const questions = await prisma.lmsQuestion.findMany({ where: { vehicleType }, orderBy: { order: 'asc' } })
  return NextResponse.json({
    vehicleType,
    questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) as string[] })),
  })
}

// POST — create a question, or seed the car bank from the built-in 25.
// { action: "seed-car" }
// { vehicleType, question, options: string[], correctIndex, imageUrl? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))

  if (body?.action === 'seed-car') {
    const existing = await prisma.lmsQuestion.count({ where: { vehicleType: 'car' } })
    if (existing > 0) return NextResponse.json({ error: 'Car bank already has questions', count: existing }, { status: 409 })
    await prisma.$transaction(
      MODULE_5_QUESTIONS.map((q, i) =>
        prisma.lmsQuestion.create({
          data: {
            vehicleType: 'car',
            question: q.question,
            options: JSON.stringify(q.options),
            correctIndex: q.correctAnswer,
            imageUrl: q.image || null,
            order: i,
          },
        })
      )
    )
    return NextResponse.json({ success: true, seeded: MODULE_5_QUESTIONS.length })
  }

  const options = Array.isArray(body?.options) ? body.options.map((o: unknown) => String(o)) : []
  if (!body?.question || options.length < 2) {
    return NextResponse.json({ error: 'question and at least 2 options are required' }, { status: 400 })
  }
  const vehicleType = body.vehicleType === 'truck' ? 'truck' : 'car'
  const max = await prisma.lmsQuestion.aggregate({ where: { vehicleType }, _max: { order: true } })
  const correctIndex = Math.min(Math.max(0, Number(body.correctIndex) || 0), options.length - 1)
  const q = await prisma.lmsQuestion.create({
    data: {
      vehicleType,
      question: String(body.question).slice(0, 2000),
      options: JSON.stringify(options),
      correctIndex,
      imageUrl: body.imageUrl ? String(body.imageUrl) : null,
      order: (max._max.order ?? -1) + 1,
    },
  })
  return NextResponse.json({ question: { ...q, options } })
}

// PATCH — edit a question.
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const data: Record<string, unknown> = {}
  if (typeof body.question === 'string') data.question = body.question.slice(0, 2000)
  if (Array.isArray(body.options)) data.options = JSON.stringify(body.options.map((o: unknown) => String(o)))
  if (typeof body.correctIndex === 'number') data.correctIndex = body.correctIndex
  if ('imageUrl' in body) data.imageUrl = body.imageUrl ? String(body.imageUrl) : null
  await prisma.lmsQuestion.update({ where: { id }, data })
  return NextResponse.json({ success: true })
}

// DELETE — remove a question.
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.lmsQuestion.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ success: true })
}
