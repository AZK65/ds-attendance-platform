import { NextRequest, NextResponse } from 'next/server'
import { actorFrom, resolveClass1 } from '@/lib/rsep1/access'
import { rsep1Json } from '@/lib/rsep1/respond'
import { reopenSheet } from '@/lib/rsep1/store'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params
    const ctx = await resolveClass1(studentId)
    const body = await request.json().catch(() => ({})) as { reason?: string }
    return NextResponse.json(await reopenSheet(ctx, await actorFrom(request), body.reason))
  } catch (error) {
    return rsep1Json(error)
  }
}
