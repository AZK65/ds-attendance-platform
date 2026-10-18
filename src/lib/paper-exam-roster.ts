// Roster matching for Paper Exam Mode.
// Kept free of Prisma/filesystem imports so the missing-student count and the
// download summary use the same rules.

export const SCHOOL_EXAM_PHONE_LAST10 = '5142746948'

export interface PaperExamRosterMember {
  contactId: string
  phone: string
  isAdmin: boolean
  isSuperAdmin: boolean
  contact: { name: string | null; pushName: string | null }
}

export interface PaperExamRosterSubmission {
  id: string
  contactId: string | null
  senderJid: string
  phone: string
  studentName: string
  receivedAt?: Date
}

export interface PaperExamRosterMatch<S> {
  contactId: string
  name: string
  phone: string
  submission: S | null
}

export function paperExamLast10Digits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '').slice(-10)
}

export function paperExamDisplayName(member: PaperExamRosterMember): string {
  return member.contact.name || member.contact.pushName || member.phone || 'Unknown student'
}

export function isPaperExamRosterStudent(member: PaperExamRosterMember): boolean {
  if (member.isAdmin || member.isSuperAdmin) return false
  if (paperExamLast10Digits(member.phone) === SCHOOL_EXAM_PHONE_LAST10) return false
  const label = `${member.contact.name || ''} ${member.contact.pushName || ''}`.toLowerCase()
  if (label.includes('qazi driving')) return false
  return true
}

export function normalizePaperExamName(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isMatchableName(value: string): boolean {
  const letters = value.replace(/[^a-z]/g, '')
  return letters.length >= 3
}

function indexBy<S>(items: S[], keyOf: (item: S) => string | null): Map<string, S[]> {
  const map = new Map<string, S[]>()
  for (const item of items) {
    const key = keyOf(item)
    if (!key) continue
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

/**
 * Match saved exams to current non-admin students.
 * Order: stored contact, sender WhatsApp id, phone, then a unique full name.
 * The school number and group admins are left out of the missing count.
 */
export function matchPaperExamRoster<S extends PaperExamRosterSubmission>(
  members: PaperExamRosterMember[],
  submissions: S[],
): { students: PaperExamRosterMatch<S>[]; unmatched: S[]; excluded: number } {
  const roster = members.filter(isPaperExamRosterStudent)
  const ordered = [...submissions].sort((a, b) => (b.receivedAt?.getTime() || 0) - (a.receivedAt?.getTime() || 0))
  const used = new Set<string>()
  const byContact = indexBy(ordered, item => item.contactId)
  const bySender = indexBy(ordered, item => item.senderJid || null)
  const byPhone = indexBy(ordered, item => {
    const phone = paperExamLast10Digits(item.phone)
    return phone.length === 10 ? phone : null
  })

  const take = (list: S[] | undefined): S | null => {
    const found = list?.find(item => !used.has(item.id))
    if (!found) return null
    used.add(found.id)
    return found
  }

  const students: PaperExamRosterMatch<S>[] = roster.map(member => {
    const phone = paperExamLast10Digits(member.phone)
    const submission = take(byContact.get(member.contactId))
      || take(bySender.get(member.contactId))
      || take(phone.length === 10 ? byPhone.get(phone) : undefined)
    return {
      contactId: member.contactId,
      name: paperExamDisplayName(member),
      phone: member.phone,
      submission,
    }
  })

  const submissionsByName = indexBy(ordered, item => {
    const name = normalizePaperExamName(item.studentName)
    return isMatchableName(name) ? name : null
  })
  const openByName = new Map<string, PaperExamRosterMatch<S>[]>()
  for (const student of students) {
    if (student.submission) continue
    const name = normalizePaperExamName(student.name)
    if (!isMatchableName(name)) continue
    const list = openByName.get(name)
    if (list) list.push(student)
    else openByName.set(name, [student])
  }
  for (const [name, openStudents] of openByName) {
    if (openStudents.length !== 1) continue
    const named = (submissionsByName.get(name) || []).filter(item => !used.has(item.id))
    if (named.length !== 1) continue
    const match = take(named)
    if (match) openStudents[0].submission = match
  }

  return {
    students,
    unmatched: ordered.filter(item => !used.has(item.id)),
    excluded: members.length - roster.length,
  }
}

export function paperExamRecheckReason(input: {
  status: string
  verified: boolean
  uncertain: number[]
  error: string | null
}): string | null {
  if (input.verified && input.status === 'graded' && input.uncertain.length === 0) return null
  if (input.status === 'failed') {
    return input.error ? `Grading failed: ${input.error}` : 'Grading failed — run OCR again'
  }
  if (input.status === 'processing') return 'Still grading'
  if (input.status === 'received') return 'Received, not graded yet'
  if (input.uncertain.length > 0 || input.status === 'review') {
    const questions = input.uncertain.length > 0
      ? `: ${[...input.uncertain].sort((a, b) => a - b).map(question => `Q${question}`).join(', ')}`
      : ''
    return `Answers need a re-check${questions}`
  }
  return null
}
