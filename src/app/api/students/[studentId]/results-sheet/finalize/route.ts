import { NextRequest, NextResponse } from 'next/server'
import { actorFrom, resolveClass1 } from '@/lib/rsep1/access'
import { rsep1Json } from '@/lib/rsep1/respond'
import { finalizeSheet } from '@/lib/rsep1/store'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params
    const ctx = await resolveClass1(studentId)
    const body = await request.json().catch(() => ({})) as { confirmIncomplete?: boolean }
    const view = await finalizeSheet(ctx, await actorFrom(request), !!body.confirmIncomplete)
    return NextResponse.json(view)
  } catch (error) {
    return rsep1Json(error)
  }
}
