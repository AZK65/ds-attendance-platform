import { NextRequest, NextResponse } from 'next/server'
import { loadStudentCarClasses } from '@/lib/car-class-gap-enforce'

// Read-only list of a student's calendar classes, used by the scheduling
// dialog to show the modules 1–3 gap before the booking is submitted.
// Creating and rescheduling still re-check on the server.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone') || ''
  const studentName = searchParams.get('studentName') || ''
  if (!phone && !studentName) {
    return NextResponse.json({ classes: [] })
  }

  try {
    const classes = await loadStudentCarClasses({ phone, name: studentName })
    return NextResponse.json({
      classes: classes.map(item => ({
        id: item.id,
        title: item.title || '',
        notes: item.notes || '',
        startDate: item.startDate,
      })),
    })
  } catch (error) {
    console.error('[student-car-classes] lookup failed:', error)
    return NextResponse.json(
      { error: 'Could not verify the 7-day gap between car classes. Try again.', classes: [] },
      { status: 503 },
    )
  }
}
