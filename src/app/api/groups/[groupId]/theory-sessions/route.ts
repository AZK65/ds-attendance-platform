import { NextRequest, NextResponse } from 'next/server'
import { listTheorySessions, getTheoryProgress } from '@/lib/theory-progress'

// GET /api/groups/[groupId]/theory-sessions?phone=
// Phone is optional. With it, the response is that student's progress.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params
  const decoded = decodeURIComponent(groupId)
  const phone = request.nextUrl.searchParams.get('phone') || ''
  try {
    if (phone) {
      const progress = await getTheoryProgress(decoded, phone)
      return NextResponse.json(progress)
    }
    const sessions = await listTheorySessions(decoded)
    return NextResponse.json(sessions)
  } catch (error) {
    console.error('[theory sessions]', error)
    return NextResponse.json({ error: 'Failed to load theory sessions' }, { status: 500 })
  }
}
