import { prisma } from '@/lib/db'
import {
  filterLocalStudentMatches,
  givenPhoneKeys,
  namesEqual,
  selectLocalStudentMatch,
  type StudentMatchQuery,
} from '@/lib/student-match'

const studentWithCertificates = {
  certificates: { orderBy: { generatedAt: 'desc' as const } },
}

/** Phone last-10, or exact full name. Never a single shared word. */
export async function findBestLocalStudent(query: StudentMatchQuery) {
  const usablePhone = givenPhoneKeys(query.phone, query.phoneAlt).length > 0
  const usableName = namesEqual(query.name, query.name)
  if (!usablePhone && !usableName) return null

  // Phones are stored with spaces, dashes, and country codes, so a SQL
  // "contains" on the raw last-10 digits misses formatted numbers. Compare
  // the normalized keys in memory, then load only the rows that qualify.
  const light = await prisma.student.findMany({
    select: { id: true, name: true, phone: true, phoneAlt: true },
  })
  const matched = filterLocalStudentMatches(light, query)
  if (matched.length === 0) return null

  const full = await prisma.student.findMany({
    where: { id: { in: matched.map((row) => row.id) } },
    include: studentWithCertificates,
  })
  return selectLocalStudentMatch(full, query, (message) => console.log(message))
}
