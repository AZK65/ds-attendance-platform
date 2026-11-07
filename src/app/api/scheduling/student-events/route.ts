import { NextRequest, NextResponse } from 'next/server'
import { loadStudentCalendarHistory } from '@/lib/student-calendar-history'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const identity = {
    studentName: params.get('studentName') || '',
    phone: params.get('phone') || '',
    groupName: params.get('groupName') || '',
  }
  if (!identity.studentName && !identity.phone && !identity.groupName) {
    return NextResponse.json({ error: 'studentName, phone, or groupName is required' }, { status: 400 })
  }
  try {
    return NextResponse.json(await loadStudentCalendarHistory(identity))
  } catch (error) {
    console.error('Student calendar history failed:', error)
    return NextResponse.json({ error: 'Class history could not be loaded. Please retry; no attendance has been removed.' }, { status: 503 })
  }
}
