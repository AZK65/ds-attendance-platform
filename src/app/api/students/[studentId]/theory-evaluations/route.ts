import { NextRequest, NextResponse } from 'next/server'
import { actorFrom, resolveClass1 } from '@/lib/rsep1/access'
import { rsep1Json } from '@/lib/rsep1/respond'
import { getSheetView, saveTheoryRows, type TheoryWrite } from '@/lib/rsep1/store'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params
    const ctx = await resolveClass1(studentId)
    const view = await getSheetView(ctx)
    return NextResponse.json({
      competencies: view.competencies,
      summary: view.summary,
      summaryLine: view.summaryLine,
      locked: view.locked,
      finalizedAt: view.finalizedAt,
      revisionNo: view.revisionNo,
      instructors: view.instructors,
      updatedAt: view.updatedAt,
      updatedByLabel: view.updatedByLabel,
    })
  } catch (error) {
    return rsep1Json(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params
    const ctx = await resolveClass1(studentId)
    const body = await request.json() as { rows?: TheoryWrite[] }
    const view = await saveTheoryRows(ctx, body.rows || [], await actorFrom(request))
    return NextResponse.json(view)
  } catch (error) {
    return rsep1Json(error)
  }
}
