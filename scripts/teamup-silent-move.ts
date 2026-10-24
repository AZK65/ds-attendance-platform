/**
 * Move one Teamup event without the automatic WhatsApp "Schedule update".
 *
 * Dry-run is the default. --apply writes a suppression row first, then
 * updates the event time. The 15 s poller sees the suppression and does
 * not post to the group or rewrite that event's reminder.
 *
 *   npx tsx scripts/teamup-silent-move.ts --event <teamupEventId> --start <ISO> --end <ISO> [--dry-run]
 *   npx tsx scripts/teamup-silent-move.ts --event <teamupEventId> --start <ISO> --end <ISO> --apply
 */
import { prisma } from '../src/lib/db'
import {
  createScheduleSuppression,
  releaseScheduleSuppression,
} from '../src/lib/schedule-notify-suppression'
import { updateTeamupEventTime } from '../src/lib/teamup'

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  return process.argv[index + 1]
}

/** Keep the wall-clock time the operator typed. Teamup stores local ISO. */
export function normalizeTeamupDateTime(value: string): string | null {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/)
  if (!match) return null
  return `${match[1]}T${match[2]}:${match[3] || '00'}`
}

async function main() {
  const apply = process.argv.includes('--apply')
  const eventId = flag('--event')
  const start = flag('--start')
  const end = flag('--end')
  if (!eventId || !start || !end) {
    console.error('Usage: npx tsx scripts/teamup-silent-move.ts --event <teamupEventId> --start <ISO> --end <ISO> [--dry-run | --apply]')
    process.exitCode = 1
    return
  }
  const startDt = normalizeTeamupDateTime(start)
  const endDt = normalizeTeamupDateTime(end)
  if (!startDt || !endDt) {
    console.error('start and end must be ISO datetimes, for example 2026-10-31T08:30:00')
    process.exitCode = 1
    return
  }
  if (endDt <= startDt) {
    console.error('end must be after start')
    process.exitCode = 1
    return
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    eventId,
    startDt,
    endDt,
  }, null, 2))

  if (!apply) {
    console.log('Dry-run only. No suppression written. No Teamup update. Re-run with --apply.')
    return
  }

  const suppression = await createScheduleSuppression(eventId)
  console.log(`Suppression ${suppression.id} written for event ${eventId} before the Teamup update.`)
  const result = await updateTeamupEventTime({ eventId, startDt, endDt })
  if (!result.success) {
    await releaseScheduleSuppression(suppression.id)
    console.error(result.error || 'Teamup update failed')
    console.log('Suppression released because Teamup was not updated.')
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify({
    suppressionId: suppression.id,
    teamupEventId: result.event?.id || eventId,
    startDt: result.event?.start_dt || startDt,
    endDt: result.event?.end_dt || endDt,
    title: result.event?.title || null,
  }, null, 2))
  console.log('Teamup time updated. The next poll records the theory time, skips the group post, and leaves the existing reminder.')
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
