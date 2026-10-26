import { searchStudents } from '@/lib/external-db'
import { nameSearchVariants, namesEqual, phoneLast10 } from '@/lib/student-match'

/** Positive MySQL driving_school_v2.student.student_id, or null. */
export function parseExternalStudentId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return parsed > 0 ? parsed : null
  }
  return null
}

/**
 * Resolve the MySQL student id to store on an invoice.
 * An id the caller already knows wins. Otherwise the phone last-10 must
 * match exactly. With no phone, the exact full name is used only when one
 * student has that name. Never creates a row and never picks among
 * several people who share a phone or a name.
 */
export async function resolveExternalStudentId(input: {
  externalStudentId?: unknown
  phone?: string | null
  name?: string | null
}): Promise<number | null> {
  const explicit = parseExternalStudentId(input.externalStudentId)
  if (explicit != null) return explicit

  try {
    const phoneKey = phoneLast10(input.phone)
    if (phoneKey) {
      const results = await searchStudents(phoneKey)
      const matches = results.filter((student) => phoneLast10(student.phone_number) === phoneKey)
      if (matches.length === 1) return matches[0].student_id
      if (matches.length > 1 && input.name) {
        const named = matches.filter((student) => namesEqual(student.full_name, input.name))
        if (named.length === 1) return named[0].student_id
      }
      return null
    }

    if (!namesEqual(input.name, input.name)) return null
    const seen = new Set<number>()
    const matches: number[] = []
    for (const variant of nameSearchVariants(input.name)) {
      const results = await searchStudents(variant)
      for (const student of results) {
        if (seen.has(student.student_id) || !namesEqual(student.full_name, input.name)) continue
        seen.add(student.student_id)
        matches.push(student.student_id)
      }
    }
    return matches.length === 1 ? matches[0] : null
  } catch (error) {
    console.error('[resolveExternalStudentId]', error)
    return null
  }
}
