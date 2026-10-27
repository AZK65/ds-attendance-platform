import { NextRequest, NextResponse } from 'next/server'
import { actorFrom, resolveClass1 } from '@/lib/rsep1/access'
import { rsep1Json } from '@/lib/rsep1/respond'
import { saveTheoryRows } from '@/lib/rsep1/store'

export const runtime = 'nodejs'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string; competency: string }> },
) {
  try {
    const { studentId, competency } = await params
    const ctx = await resolveClass1(studentId)
    const body = await request.json() as {
      gradePercent?: unknown
      evaluatedOn?: unknown
      evaluatorId?: string | null
      note?: string | null
      expectedUpdatedAt?: string | null
    }
    const view = await saveTheoryRows(ctx, [{
      competency,
      gradePercent: body.gradePercent,
      evaluatedOn: body.evaluatedOn,
      evaluatorId: body.evaluatorId,
      note: body.note,
      expectedUpdatedAt: body.expectedUpdatedAt,
    }], await actorFrom(request))
    const row = view.competencies.find(item => item.competency === competency.toUpperCase())
    return NextResponse.json({ ...row, summary: view.summary, summaryLine: view.summaryLine, locked: view.locked })
  } catch (error) {
    return rsep1Json(error)
  }
}
