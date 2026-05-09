import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/zoom/attendance/fix-modules?groupId=<id>&phase=phase1|all&dryRun=1
// Re-numbers ZoomAttendance.moduleNumber for a group based on the chronological
// order of meetings. The Nth oldest meeting becomes Module N.
//
// Defaults:
//   phase=phase1 — clamps to 1..5 and skips meetings beyond the 5th
//   phase=all    — numbers every meeting in order (1, 2, 3, ...)
//   dryRun=1     — preview without writing
//
// Used to fix past classes that were tagged with the wrong moduleNumber
// (typically because the original save fell back to group.moduleNumber, which
// is the GROUP's current module rather than the meeting's actual module).
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const groupId = url.searchParams.get('groupId')
  const phase = (url.searchParams.get('phase') || 'phase1') as 'phase1' | 'all'
  const dryRun = url.searchParams.get('dryRun') === '1'

  if (!groupId) {
    return NextResponse.json({ error: 'groupId is required' }, { status: 400 })
  }

  const records = await prisma.zoomAttendance.findMany({
    where: { groupId },
    orderBy: { meetingDate: 'asc' },
    select: { id: true, meetingDate: true, moduleNumber: true, meetingUUID: true },
  })

  const max = phase === 'phase1' ? 5 : 12
  const updates: Array<{ id: string; meetingDate: Date; meetingUUID: string; from: number | null; to: number | null }> = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const nth = i + 1
    const newModule = nth <= max ? nth : null
    if (r.moduleNumber !== newModule) {
      updates.push({
        id: r.id,
        meetingDate: r.meetingDate,
        meetingUUID: r.meetingUUID,
        from: r.moduleNumber,
        to: newModule,
      })
    }
  }

  if (!dryRun) {
    for (const u of updates) {
      await prisma.zoomAttendance.update({
        where: { id: u.id },
        data: { moduleNumber: u.to },
      })
    }
  }

  return NextResponse.json({
    groupId,
    phase,
    dryRun,
    totalRecords: records.length,
    changes: updates.length,
    updates: updates.map(u => ({
      meetingDate: u.meetingDate.toISOString(),
      meetingUUID: u.meetingUUID,
      from: u.from,
      to: u.to,
    })),
  })
}
