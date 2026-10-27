import { prisma } from '@/lib/db'
import { TOTAL_QUESTIONS } from '@/lib/exam-questions'
import { paperExamResultIsVerified } from '@/lib/paper-exam-result'
import { maskLicence, maskPhone, scoreLabel } from '@/lib/assistant/mask'
import { phoneLast10 } from '@/lib/assistant/roster'

const PERSON_LIMIT = 15
const EXAM_LIMIT = 5

type RecentExam = {
  kind: 'paper' | 'online'
  title: string
  groupName: string
  score: number | null
  total: number | null
  scoreLabel: string | null
  passed: boolean | null
  status: string
  verified: boolean | null
  at: string
}

type Person = {
  id: string
  source: 'student' | 'whatsapp' | 'exam'
  name: string
  phoneMasked: string | null
  licenceMasked: string | null
  groups: Array<{ id: string; name: string }>
  recentExams: RecentExam[]
}

function cleanQuery(value: string): string {
  return value.replace(/[%_]/g, '').trim().slice(0, 80)
}

function nameKey(value: string): string {
  return value.replace(/\s*#\d+\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function personKey(name: string, phone: string | null | undefined): string {
  const digits = phoneLast10(phone)
  if (digits.length === 10) return `phone:${digits}`
  return `name:${nameKey(name)}`
}

export async function searchAssistantStudents(rawQuery: string) {
  const q = cleanQuery(rawQuery)
  if (q.length < 2) {
    return { error: 'Query must be at least 2 characters.' as const }
  }
  const digits = q.replace(/\D/g, '')
  const phoneQuery = digits.length >= 3 ? digits.slice(-10) : ''

  const studentWhere = {
    OR: [
      { name: { contains: q } },
      ...(phoneQuery ? [{ phone: { contains: phoneQuery } }, { phoneAlt: { contains: phoneQuery } }] : []),
      { licenceNumber: { contains: q } },
    ],
  }
  const contactWhere = {
    OR: [
      { name: { contains: q } },
      { pushName: { contains: q } },
      ...(phoneQuery ? [{ phone: { contains: phoneQuery } }] : []),
    ],
  }

  const [students, contacts, paperSubs, attempts] = await Promise.all([
    prisma.student.findMany({
      where: studentWhere,
      orderBy: { updatedAt: 'desc' },
      take: PERSON_LIMIT,
      select: { id: true, name: true, phone: true, phoneAlt: true, licenceNumber: true },
    }),
    prisma.contact.findMany({
      where: contactWhere,
      orderBy: { updatedAt: 'desc' },
      take: PERSON_LIMIT,
      select: {
        id: true,
        name: true,
        pushName: true,
        phone: true,
        groups: {
          where: { isAdmin: false, isSuperAdmin: false },
          select: { group: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.paperExamSubmission.findMany({
      where: {
        OR: [
          { studentName: { contains: q } },
          ...(phoneQuery ? [{ phone: { contains: phoneQuery } }] : []),
        ],
      },
      orderBy: { receivedAt: 'desc' },
      take: 40,
      select: {
        studentName: true,
        phone: true,
        status: true,
        score: true,
        totalQuestions: true,
        passed: true,
        extractedAnswers: true,
        receivedAt: true,
        session: { select: { title: true, groupName: true } },
      },
    }),
    prisma.examAttempt.findMany({
      where: {
        OR: [
          { studentName: { contains: q } },
          ...(phoneQuery ? [{ studentPhone: { contains: phoneQuery } }] : []),
        ],
      },
      orderBy: { startedAt: 'desc' },
      take: 40,
      select: {
        studentName: true,
        studentPhone: true,
        score: true,
        passed: true,
        startedAt: true,
        submittedAt: true,
        exam: { select: { code: true, groupName: true } },
      },
    }),
  ])

  const phones = new Set<string>()
  for (const student of students) {
    const primary = phoneLast10(student.phone)
    const alt = phoneLast10(student.phoneAlt)
    if (primary.length === 10) phones.add(primary)
    if (alt.length === 10) phones.add(alt)
  }
  for (const contact of contacts) {
    const phone = phoneLast10(contact.phone)
    if (phone.length === 10) phones.add(phone)
  }
  for (const submission of paperSubs) {
    const phone = phoneLast10(submission.phone)
    if (phone.length === 10) phones.add(phone)
  }
  for (const attempt of attempts) {
    const phone = phoneLast10(attempt.studentPhone)
    if (phone.length === 10) phones.add(phone)
  }

  const memberships = phones.size === 0
    ? []
    : await prisma.groupMember.findMany({
        where: {
          isAdmin: false,
          isSuperAdmin: false,
          OR: [...phones].map(phone => ({ phone: { contains: phone } })),
        },
        select: { phone: true, group: { select: { id: true, name: true } } },
      })
  const groupsByPhone = new Map<string, Array<{ id: string; name: string }>>()
  for (const membership of memberships) {
    const phone = phoneLast10(membership.phone)
    if (phone.length !== 10) continue
    const list = groupsByPhone.get(phone) || []
    if (!list.some(group => group.id === membership.group.id)) {
      list.push({ id: membership.group.id, name: membership.group.name })
    }
    groupsByPhone.set(phone, list)
  }

  const people = new Map<string, Person>()

  const ensure = (key: string, seed: Omit<Person, 'recentExams' | 'groups'> & { groups?: Person['groups'] }) => {
    const existing = people.get(key)
    if (existing) {
      if (!existing.phoneMasked && seed.phoneMasked) existing.phoneMasked = seed.phoneMasked
      if (!existing.licenceMasked && seed.licenceMasked) existing.licenceMasked = seed.licenceMasked
      if (existing.source === 'exam' && seed.source !== 'exam') {
        existing.source = seed.source
        existing.id = seed.id
        existing.name = seed.name
      }
      for (const group of seed.groups || []) {
        if (!existing.groups.some(item => item.id === group.id)) existing.groups.push(group)
      }
      return existing
    }
    const created: Person = { ...seed, groups: seed.groups || [], recentExams: [] }
    people.set(key, created)
    return created
  }

  for (const student of students) {
    const phone = phoneLast10(student.phone) || phoneLast10(student.phoneAlt)
    ensure(personKey(student.name, phone), {
      id: student.id,
      source: 'student',
      name: student.name,
      phoneMasked: maskPhone(student.phone || student.phoneAlt),
      licenceMasked: maskLicence(student.licenceNumber),
      groups: phone.length === 10 ? [...(groupsByPhone.get(phone) || [])] : [],
    })
  }

  for (const contact of contacts) {
    const phone = phoneLast10(contact.phone)
    const name = contact.name || contact.pushName || 'Student'
    const groups = contact.groups.map(membership => ({
      id: membership.group.id,
      name: membership.group.name,
    }))
    ensure(personKey(name, phone), {
      id: contact.id,
      source: 'whatsapp',
      name,
      phoneMasked: maskPhone(contact.phone),
      licenceMasked: null,
      groups: groups.length > 0 ? groups : (phone.length === 10 ? [...(groupsByPhone.get(phone) || [])] : []),
    })
  }

  const paperExams: Array<RecentExam & { name: string; phone: string }> = paperSubs.map(submission => ({
    kind: 'paper' as const,
    title: submission.session.title,
    groupName: submission.session.groupName,
    score: submission.score,
    total: submission.totalQuestions,
    scoreLabel: scoreLabel(submission.score, submission.totalQuestions),
    passed: submission.passed,
    status: submission.status,
    verified: paperExamResultIsVerified(submission.extractedAnswers),
    at: submission.receivedAt.toISOString(),
    name: submission.studentName,
    phone: submission.phone,
  }))

  const onlineExams: Array<RecentExam & { name: string; phone: string | null }> = attempts.map(attempt => ({
    kind: 'online' as const,
    title: attempt.exam.code,
    groupName: attempt.exam.groupName,
    score: attempt.score,
    total: attempt.submittedAt ? TOTAL_QUESTIONS : null,
    scoreLabel: attempt.submittedAt ? scoreLabel(attempt.score, TOTAL_QUESTIONS) : null,
    passed: attempt.passed,
    status: attempt.submittedAt ? 'submitted' : 'in_progress',
    verified: null,
    at: (attempt.submittedAt || attempt.startedAt).toISOString(),
    name: attempt.studentName,
    phone: attempt.studentPhone,
  }))

  const attach = (exam: RecentExam & { name: string; phone: string | null }) => {
    const phone = phoneLast10(exam.phone)
    const key = personKey(exam.name, phone)
    let person = people.get(key)
    if (!person && phone.length !== 10) {
      const wanted = nameKey(exam.name)
      person = [...people.values()].find(item => nameKey(item.name) === wanted)
    }
    if (!person) {
      if (people.size >= PERSON_LIMIT) return
      person = ensure(key, {
        id: key,
        source: 'exam',
        name: exam.name,
        phoneMasked: maskPhone(exam.phone),
        licenceMasked: null,
        groups: phone.length === 10 ? [...(groupsByPhone.get(phone) || [])] : [],
      })
    }
    if (person.recentExams.length >= EXAM_LIMIT) return
    person.recentExams.push({
      kind: exam.kind,
      title: exam.title,
      groupName: exam.groupName,
      score: exam.score,
      total: exam.total,
      scoreLabel: exam.scoreLabel,
      passed: exam.passed,
      status: exam.status,
      verified: exam.verified,
      at: exam.at,
    })
  }

  for (const exam of [...paperExams, ...onlineExams].sort((a, b) => b.at.localeCompare(a.at))) {
    attach(exam)
  }

  return {
    query: q,
    students: [...people.values()].slice(0, PERSON_LIMIT).map(person => ({
      id: person.id,
      source: person.source,
      name: person.name,
      phoneMasked: person.phoneMasked,
      licenceMasked: person.licenceMasked,
      groups: person.groups,
      recentExams: person.recentExams,
    })),
  }
}
