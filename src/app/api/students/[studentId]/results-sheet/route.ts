import { NextRequest, NextResponse } from 'next/server'
import { actorFrom, resolveClass1 } from '@/lib/rsep1/access'
import { rsep1Json } from '@/lib/rsep1/respond'
import { getSheetView, saveManualSheet } from '@/lib/rsep1/store'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params
    const ctx = await resolveClass1(studentId)
    return NextResponse.json(await getSheetView(ctx))
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
    const body = await request.json()
    return NextResponse.json(await saveManualSheet(ctx, body, await actorFrom(request)))
  } catch (error) {
    return rsep1Json(error)
  }
}
