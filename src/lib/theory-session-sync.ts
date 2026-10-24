/**
 * Keep a TheorySession aligned when staff reschedule a class that already
 * has one. Does not change Teamup titles and does not touch reminders.
 * Cohorts with no TheorySession rows are left exactly as they are.
 */
import { prisma } from '@/lib/db'
import { netMinutes, parseBreaksJson } from '@/lib/theory-hours'

export async function recordTheorySessionTimeChange(args: {
  teamupEventId: string
  date: string
  startTime: string
  endTime: string
  reason: string
}): Promise<{ updated: boolean }> {
  const session = await prisma.theorySession.findUnique({
    where: { teamupEventId: args.teamupEventId },
  })
  if (!session) return { updated: false }
  if (session.date === args.date && session.startTime === args.startTime && session.endTime === args.endTime) {
    return { updated: false }
  }
  const breaks = parseBreaksJson(session.breaksJson)
  const nextNet = netMinutes(args.startTime, args.endTime, breaks)
  await prisma.theorySession.update({
    where: { id: session.id },
    data: {
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      netMinutes: nextNet,
    },
  })
  await prisma.theoryCorrection.create({
    data: {
      entityType: 'TheorySession',
      entityId: session.id,
      kind: 'TIME_CORRECTION',
      beforeJson: JSON.stringify({
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        netMinutes: session.netMinutes,
      }),
      afterJson: JSON.stringify({
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        netMinutes: nextNet,
      }),
      reason: args.reason,
      internalOnly: true,
    },
  })
  return { updated: true }
}
