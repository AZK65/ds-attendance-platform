import { NextRequest, NextResponse } from 'next/server'
import { getTheoryProgress } from '@/lib/theory-progress'

// GET /api/theory/progress?groupId=&phone=
// Class 1 theory progress from TheorySession. Practical hours are not included.
export async function GET(request: NextRequest) {
  const groupId = request.nextUrl.searchParams.get('groupId') || ''
  const phone = request.nextUrl.searchParams.get('phone') || ''
  if (!groupId || !phone) {
    return NextResponse.json({ error: 'groupId and phone are required' }, { status: 400 })
  }
  try {
    const progress = await getTheoryProgress(groupId, phone)
    return NextResponse.json(progress)
  } catch (error) {
    console.error('[theory progress]', error)
    return NextResponse.json({ error: 'Failed to load theory progress' }, { status: 500 })
  }
}
