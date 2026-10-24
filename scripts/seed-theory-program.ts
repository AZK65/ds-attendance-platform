/**
 * Idempotent seed for the Class 1 theory program, templates v1 and v2,
 * and instructor Abdul Rahman Ahmed Qazi (display "Ahmed").
 * The SAAQ instructor number is left empty. This script does not write
 * Teamup events, reminders, or signatures.
 *
 *   npx tsx scripts/seed-theory-program.ts
 */
import { prisma } from '../src/lib/db'
import { ensureTheoryProgram } from '../src/lib/theory-seed'

async function main() {
  const seeded = await ensureTheoryProgram()
  console.log(JSON.stringify({
    program: seeded.program.code,
    requiredNetMinutes: seeded.program.requiredNetMinutes,
    requiredSessions: seeded.program.requiredSessions,
    templateV1: seeded.templateV1.version,
    templateV2: seeded.templateV2.version,
    instructor: seeded.instructor.legalName,
    displayName: seeded.instructor.displayName,
    saaqInstructorNo: seeded.instructor.saaqInstructorNo,
    teamupSubcalendarId: seeded.instructor.teamupSubcalendarId,
  }, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
