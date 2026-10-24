/**
 * Rows that tell poll-changes to skip one theory time-change announcement.
 * The row is written before Teamup is updated, then consumed when that
 * change is applied silently.
 */
import { prisma } from '@/lib/db'
import { SCHEDULE_SUPPRESSION_TTL_MS } from '@/lib/schedule-notify-plan'

export async function createScheduleSuppression(teamupEventId: string, now = new Date()) {
  return prisma.scheduleNotifySuppression.create({
    data: {
      teamupEventId,
      expiresAt: new Date(now.getTime() + SCHEDULE_SUPPRESSION_TTL_MS),
    },
  })
}

export async function findActiveScheduleSuppression(teamupEventId: string, now = new Date()) {
  return prisma.scheduleNotifySuppression.findFirst({
    where: {
      teamupEventId,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/** Returns true only the first time this row is consumed. */
export async function consumeScheduleSuppression(id: string, now = new Date()): Promise<boolean> {
  const result = await prisma.scheduleNotifySuppression.updateMany({
    where: { id, consumedAt: null },
    data: { consumedAt: now },
  })
  if (result.count > 0) {
    const row = await prisma.scheduleNotifySuppression.findUnique({ where: { id } })
    console.log(`[schedule-notify] Consumed suppression ${id} for Teamup event ${row?.teamupEventId || 'unknown'}`)
  }
  return result.count > 0
}

/** Drop an unused row when the Teamup write did not happen. */
export async function releaseScheduleSuppression(id: string): Promise<void> {
  await prisma.scheduleNotifySuppression.deleteMany({
    where: { id, consumedAt: null },
  })
}
