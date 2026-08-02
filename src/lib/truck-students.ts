import { prisma } from '@/lib/db'

/** Last 10 digits of a phone — the shape we compare on everywhere. */
export const last10 = (p: string | null | undefined) => (p || '').replace(/\D/g, '').slice(-10)

/**
 * Phones belonging to Class 1 (truck) students.
 *
 * A WhatsApp group's `vehicleType` can't answer "is this person a truck
 * student?" — most groups predate the tag, and a truck student can sit in an
 * untagged group. The authoritative signal is their truck REGISTRATION, so we
 * key off that (plus any group already tagged truck).
 *
 * Shared by the students/participants list and the pending-students picker so
 * both agree on who counts as truck.
 */
export async function getTruckPhones(): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    const regs = await prisma.studentRegistration.findMany({
      where: { vehicleType: 'truck' },
      select: { phoneNumber: true },
    })
    for (const r of regs) {
      const p = last10(r.phoneNumber)
      if (p.length >= 10) set.add(p)
    }

    const members = await prisma.groupMember.findMany({
      where: { group: { vehicleType: 'truck' } },
      select: { phone: true },
    })
    for (const m of members) {
      const p = last10(m.phone)
      if (p.length >= 10) set.add(p)
    }
  } catch (e) {
    console.error('[truck-students] getTruckPhones failed:', e)
  }
  return set
}
