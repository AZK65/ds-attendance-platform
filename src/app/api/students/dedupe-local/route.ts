import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/students/dedupe-local?dryRun=1
// Finds local Student rows that share the same last-10-digit phone and
// merges them. Certificates from the duplicates are re-pointed at the
// surviving row, then the duplicates are deleted.
//
// Survivor selection: the row with the most recent updatedAt wins, with a
// tiebreaker on most certificates linked.
//
// dryRun=1 returns the merge plan without writing.
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'

  const students = await prisma.student.findMany({
    select: { id: true, name: true, phone: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })

  // Bucket by last-10 phone digits
  const buckets = new Map<string, typeof students>()
  for (const s of students) {
    const digits = (s.phone || '').replace(/\D/g, '')
    if (digits.length < 7) continue
    const key = digits.length >= 10 ? digits.slice(-10) : digits
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(s)
  }

  const plans: Array<{
    phoneSuffix: string
    survivor: { id: string; name: string; certCount: number }
    duplicates: Array<{ id: string; name: string; certCount: number }>
    certsMoved: number
  }> = []

  for (const [phoneSuffix, group] of buckets) {
    if (group.length < 2) continue

    // Count certificates per row to pick the best survivor (favour the row
    // already linked to certs)
    const withCounts = await Promise.all(
      group.map(async (s) => ({
        ...s,
        certCount: await prisma.certificate.count({ where: { studentId: s.id } }),
      })),
    )
    withCounts.sort((a, b) => {
      // Most certs first, then most recently updated
      if (b.certCount !== a.certCount) return b.certCount - a.certCount
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

    const [survivor, ...duplicates] = withCounts
    const movedCertCount = duplicates.reduce((sum, d) => sum + d.certCount, 0)

    plans.push({
      phoneSuffix,
      survivor: { id: survivor.id, name: survivor.name, certCount: survivor.certCount },
      duplicates: duplicates.map(d => ({ id: d.id, name: d.name, certCount: d.certCount })),
      certsMoved: movedCertCount,
    })

    if (!dryRun) {
      // Re-point certificates at the survivor, then delete duplicates.
      for (const dup of duplicates) {
        if (dup.certCount > 0) {
          await prisma.certificate.updateMany({
            where: { studentId: dup.id },
            data: { studentId: survivor.id },
          })
        }
        // Cascade-delete is set on Certificate so safe to drop the Student row
        // once its certs are moved.
        await prisma.student.delete({ where: { id: dup.id } })
      }
    }
  }

  return NextResponse.json({
    dryRun,
    duplicatesFound: plans.length,
    rowsRemoved: dryRun ? 0 : plans.reduce((sum, p) => sum + p.duplicates.length, 0),
    certsMoved: plans.reduce((sum, p) => sum + p.certsMoved, 0),
    plans,
  })
}
