// Identity checks for local Student rows used by the certificate flow.
// Phone (last 10 digits) and the full name are the only soft keys.
// A shared phone is not identity: siblings and other family members can
// share a number. A shared first name, last name, or substring must not
// bind two people either. The exact full name can.

const DATE_FIELDS = [
  'registrationDate',
  'expiryDate',
  ...Array.from({ length: 12 }, (_, i) => `module${i + 1}Date`),
  ...Array.from({ length: 15 }, (_, i) => `sortie${i + 1}Date`),
] as const

export interface StudentMatchQuery {
  phone?: string | null
  phoneAlt?: string | null
  name?: string | null
}

export interface StudentMatchRecord {
  id?: string
  name: string
  phone?: string | null
  phoneAlt?: string | null
  licenceNumber?: string | null
  address?: string | null
  certificates?: { readonly length: number } | null
  updatedAt?: Date | string | null
}

export function phoneDigits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '')
}

/** Last 10 digits when the value has at least 7 digits; otherwise blank. */
export function phoneLast10(value: string | null | undefined): string {
  const digits = phoneDigits(value)
  if (digits.length < 7) return ''
  return digits.slice(-10)
}

export function givenPhoneKeys(phone?: string | null, phoneAlt?: string | null): string[] {
  return [...new Set([phoneLast10(phone), phoneLast10(phoneAlt)].filter((key) => key.length > 0))]
}

export function recordPhoneKeys(record: {
  phone?: string | null
  phoneAlt?: string | null
}): string[] {
  return [...new Set([phoneLast10(record.phone), phoneLast10(record.phoneAlt)].filter((key) => key.length > 0))]
}

/** True when neither phone nor phoneAlt contains any digit. */
export function recordHasNoPhone(record: {
  phone?: string | null
  phoneAlt?: string | null
}): boolean {
  return phoneDigits(record.phone).length === 0 && phoneDigits(record.phoneAlt).length === 0
}

export function recordMatchesPhones(
  record: { phone?: string | null; phoneAlt?: string | null },
  phone?: string | null,
  phoneAlt?: string | null,
): boolean {
  const given = givenPhoneKeys(phone, phoneAlt)
  if (given.length === 0) return false
  return recordPhoneKeys(record).some((key) => given.includes(key))
}

/**
 * The record has a phone and it is not the same last-10 as the one given.
 * A blank record phone is not a conflict (a nameless-phone row may still
 * belong to this student). A blank query phone is not a conflict either.
 */
export function phonesConflict(
  record: { phone?: string | null; phoneAlt?: string | null },
  phone?: string | null,
  phoneAlt?: string | null,
): boolean {
  const given = givenPhoneKeys(phone, phoneAlt)
  if (given.length === 0) return false
  if (recordHasNoPhone(record)) return false
  const keys = recordPhoneKeys(record)
  if (keys.length === 0) return true
  return !keys.some((key) => given.includes(key))
}

/** Lowercase, strip #tags, commas, accents, and extra spaces. Word order kept. */
export function cleanedStudentName(name: string | null | undefined): string {
  return (name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*#\d+\s*/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Order-insensitive identity key. "Iqbal, Shaheer" and "Shaheer Iqbal" share one. */
export function normalizeStudentName(name: string | null | undefined): string {
  const cleaned = cleanedStudentName(name).toLowerCase()
  if (!cleaned) return ''
  return cleaned.split(' ').filter(Boolean).sort().join(' ')
}

export function namesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeStudentName(a)
  const right = normalizeStudentName(b)
  return left.length >= 2 && left === right
}

export function sameLicence(a?: string | null, b?: string | null): boolean {
  const left = (a || '').trim()
  const right = (b || '').trim()
  return left.length > 0 && left === right
}

/** Both licences are present and not the same value. A blank licence is not a disagreement. */
export function licencesDisagree(a?: string | null, b?: string | null): boolean {
  const left = (a || '').trim()
  const right = (b || '').trim()
  return left.length > 0 && right.length > 0 && left !== right
}

export interface StudentIdentity {
  name?: string | null
  phone?: string | null
  phoneAlt?: string | null
  licenceNumber?: string | null
}

/**
 * How strongly two records are the same student.
 * - licence: the same non-empty licence number
 * - phone: the same full name and a shared phone
 * - name: the same full name, and neither a conflicting phone nor two different licences
 * - different: not the same student (including siblings who only share a phone)
 */
export function studentIdentityKind(
  record: StudentIdentity,
  subject: StudentIdentity,
): 'licence' | 'phone' | 'name' | 'different' {
  if (sameLicence(record.licenceNumber, subject.licenceNumber)) return 'licence'
  if (!namesEqual(record.name, subject.name)) return 'different'
  if (phonesConflict(record, subject.phone, subject.phoneAlt)) return 'different'
  const shared = recordPhoneKeys(record).some((key) => givenPhoneKeys(subject.phone, subject.phoneAlt).includes(key))
  if (shared) return 'phone'
  // Same name, no shared phone. Two filled-in licences that differ are two people
  // (phone-less rows often still have a permit). A blank licence does not split them.
  if (licencesDisagree(record.licenceNumber, subject.licenceNumber)) return 'different'
  return 'name'
}

/** Search strings that can find a reversed "Last, First" row. Not a match by themselves. */
export function nameSearchVariants(name: string | null | undefined): string[] {
  const cleaned = cleanedStudentName(name)
  if (cleaned.length < 2) return []
  const words = cleaned.split(' ').filter(Boolean)
  const variants = new Set<string>([cleaned])
  if (words.length >= 2) {
    variants.add([...words].reverse().join(' '))
    variants.add([...words.slice(1), words[0]].join(' '))
    variants.add([words[words.length - 1], ...words.slice(0, -1)].join(' '))
  }
  return [...variants]
}

export function filledDateCount(record: object): number {
  const row = record as Record<string, unknown>
  return DATE_FIELDS.reduce((count, field) => count + (row[field] ? 1 : 0), 0)
}

export function studentMatchScore(record: StudentMatchRecord, query: StudentMatchQuery): number {
  const phoneMatched = recordMatchesPhones(record, query.phone, query.phoneAlt)
  return (phoneMatched ? 1_000_000 : 0)
    + ((record.certificates?.length ?? 0) > 0 ? 100_000 : 0)
    + (record.licenceNumber ? 10_000 : 0)
    + (record.address ? 1_000 : 0)
    + filledDateCount(record)
}

function updatedAtMs(record: StudentMatchRecord): number {
  if (!record.updatedAt) return 0
  const time = new Date(record.updatedAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * Phone (>=7 digits) matches only rows whose phone or phoneAlt last-10 is equal.
 * One phone match is kept even when the name differs, so a profile opened by
 * phone still resolves. Several people on that phone (siblings) are narrowed
 * to the exact full name; if none of them has that name, they are not returned.
 * If no phone row matches, a row with no phone at all may match on the exact
 * full name. With no phone, only the exact full name matches. Never a single
 * word or substring.
 */
export function filterLocalStudentMatches<T extends StudentMatchRecord>(
  candidates: readonly T[],
  query: StudentMatchQuery,
): T[] {
  const given = givenPhoneKeys(query.phone, query.phoneAlt)
  if (given.length > 0) {
    const byPhone = candidates.filter((candidate) => recordMatchesPhones(candidate, query.phone, query.phoneAlt))
    if (byPhone.length === 1 || (byPhone.length > 1 && !namesEqual(query.name, query.name))) return byPhone
    if (byPhone.length > 1) {
      const named = byPhone.filter((candidate) => namesEqual(candidate.name, query.name))
      if (named.length > 0) return named
      // The shared number belongs to other people. A phone-less row with this
      // exact name can still be the student being saved.
    }
    return candidates.filter((candidate) => recordHasNoPhone(candidate) && namesEqual(candidate.name, query.name))
  }
  return candidates.filter((candidate) => namesEqual(candidate.name, query.name))
}

export function selectLocalStudentMatch<T extends StudentMatchRecord>(
  candidates: readonly T[],
  query: StudentMatchQuery,
  log?: (message: string) => void,
): T | null {
  const pool = filterLocalStudentMatches(candidates, query)
  if (pool.length === 0) return null
  if (pool.length > 1) {
    const summary = pool
      .map((candidate) => `${candidate.name}${candidate.id ? ` [${candidate.id}]` : ''}`)
      .join('; ')
    log?.(
      `[student-match] ${pool.length} records matched phone=${query.phone || ''} phoneAlt=${query.phoneAlt || ''} name=${query.name || ''}: ${summary}`,
    )
  }
  return pool.reduce((best, candidate) => {
    const bestScore = studentMatchScore(best, query)
    const candidateScore = studentMatchScore(candidate, query)
    if (candidateScore !== bestScore) return candidateScore > bestScore ? candidate : best
    return updatedAtMs(candidate) > updatedAtMs(best) ? candidate : best
  })
}

/**
 * A resolved row may be updated only when its phone does not belong to
 * someone else. The same licence number is the same person and may be saved
 * even if the typed phone differs.
 */
export function canOverwriteStudent(
  record: { phone?: string | null; phoneAlt?: string | null; licenceNumber?: string | null },
  input: { phone?: string | null; phoneAlt?: string | null; licenceNumber?: string | null },
): boolean {
  if (!phonesConflict(record, input.phone, input.phoneAlt)) return true
  const recordLicence = (record.licenceNumber || '').trim()
  const inputLicence = (input.licenceNumber || '').trim()
  return recordLicence.length > 0 && recordLicence === inputLicence
}

/**
 * Whether the certificate screen may copy this local row (id, dates, numbers).
 * An explicit student id or the same licence stays authoritative. Any other
 * row with a different non-empty phone is a different student.
 */
export function shouldAdoptLocalStudent(
  local: { id?: string; name?: string | null; phone?: string | null; phoneAlt?: string | null; licenceNumber?: string | null } | null | undefined,
  form: { name?: string | null; phone?: string | null; phoneAlt?: string | null; licenceNumber?: string | null },
  explicitStudentId?: string | null,
): boolean {
  if (!local) return false
  // History edit passes the record id explicitly. Callers that omit the name
  // keep the previous phone-only behaviour.
  if (explicitStudentId && local.id && local.id === explicitStudentId) return true
  if (sameLicence(local.licenceNumber, form.licenceNumber)) return true
  if (phonesConflict(local, form.phone, form.phoneAlt)) return false
  // A shared phone is not enough once the form names the student. Siblings
  // must not inherit each other's local row, dates, or certificate numbers.
  if (form.name && !namesEqual(local.name, form.name)) return false
  const shared = recordPhoneKeys(local).some((key) => givenPhoneKeys(form.phone, form.phoneAlt).includes(key))
  if (!shared && form.name && licencesDisagree(local.licenceNumber, form.licenceNumber)) return false
  return true
}

export interface PhoneDedupePlan<T> {
  phoneSuffix: string
  members: T[]
}

/**
 * Rows that share a phone may be merged only when they are the same student
 * (the same full name, word order ignored). Siblings who share a number stay
 * in skippedDifferentNames and must not be deleted or have certificates moved.
 */
export function planPhoneDedupes<T extends { name?: string | null; phone?: string | null }>(
  students: readonly T[],
): { merges: PhoneDedupePlan<T>[]; skippedDifferentNames: PhoneDedupePlan<T>[] } {
  const buckets = new Map<string, T[]>()
  for (const student of students) {
    const key = phoneLast10(student.phone)
    if (!key) continue
    const list = buckets.get(key)
    if (list) list.push(student)
    else buckets.set(key, [student])
  }

  const merges: PhoneDedupePlan<T>[] = []
  const skippedDifferentNames: PhoneDedupePlan<T>[] = []
  for (const [phoneSuffix, group] of buckets) {
    if (group.length < 2) continue
    const clusters = new Map<string, T[]>()
    const skipped: T[] = []
    for (const student of group) {
      const nameKey = normalizeStudentName(student.name)
      if (nameKey.length < 2) {
        skipped.push(student)
        continue
      }
      const list = clusters.get(nameKey)
      if (list) list.push(student)
      else clusters.set(nameKey, [student])
    }
    for (const members of clusters.values()) {
      if (members.length >= 2) merges.push({ phoneSuffix, members })
      else skipped.push(members[0])
    }
    if (skipped.length > 0) skippedDifferentNames.push({ phoneSuffix, members: skipped })
  }
  return { merges, skippedDifferentNames }
}
