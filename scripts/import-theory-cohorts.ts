/**
 * Import Class 1 theory sessions for Qazi Truck #001 and #002.
 *
 * Dry-run is the default. It prints the per-session plan and does not open
 * the database. `--apply` writes TheorySession, TheoryAttendance, and
 * internal TheoryCorrection rows. It does not write Teamup events, reminder
 * text, or ClassSignature images.
 *
 *   npx tsx scripts/import-theory-cohorts.ts
 *   npx tsx scripts/import-theory-cohorts.ts --apply
 */
import { prisma } from '../src/lib/db'
import { cohortPlanCsv, cohortPlanSummaryText } from '../src/lib/theory-cohort-plan'
import { applyTheoryImport } from '../src/lib/theory-import'

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(cohortPlanSummaryText())
  console.log('')
  console.log(cohortPlanCsv())
  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to write #001 and #002. No Teamup writes.')
    return
  }
  const results = await applyTheoryImport()
  console.log(JSON.stringify(results, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
