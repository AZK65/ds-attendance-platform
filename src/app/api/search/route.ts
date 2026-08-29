import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchStudents } from '@/lib/external-db'

export const dynamic = 'force-dynamic'

type GlobalSearchResult = {
  id: string
  type: 'student' | 'group-member' | 'group' | 'invoice' | 'registration' | 'lead'
  title: string
  subtitle: string
  meta?: string
  href: string
}

const clean = (value?: string | null) => (value || '').trim()
const phoneKey = (value?: string | null) => {
  const valueDigits = (value || '').replace(/\D/g, '')
  return valueDigits.length > 10 ? valueDigits.slice(-10) : valueDigits
}
const money = (value: number) => value.toLocaleString('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

// Authenticated global search used by the admin Command-K palette.
export async function GET(request: NextRequest) {
  const q = clean(request.nextUrl.searchParams.get('q')).slice(0, 100)
  if (q.length < 2) return NextResponse.json({ results: [] })
  const digits = q.replace(/\D/g, '')
  const phoneQuery = digits.length >= 3 ? digits : q

  const [students, contacts, groups, invoices, registrations, leads, externalStudents] = await Promise.all([
    prisma.student.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { phone: { contains: phoneQuery } },
          { phoneAlt: { contains: phoneQuery } },
          { email: { contains: q } },
          { licenceNumber: { contains: q } },
          { id: { contains: q } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }).catch(() => []),
    prisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { pushName: { contains: q } },
          { phone: { contains: phoneQuery } },
        ],
      },
      include: {
        groups: {
          include: { group: { select: { id: true, name: true, archivedAt: true } } },
          take: 3,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }).catch(() => []),
    prisma.group.findMany({
      where: { OR: [{ name: { contains: q } }, { id: { contains: q } }] },
      include: { _count: { select: { members: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }).catch(() => []),
    prisma.invoice.findMany({
      where: {
        OR: [
          { invoiceNumber: { contains: q } },
          { studentName: { contains: q } },
          { studentPhone: { contains: phoneQuery } },
          { studentEmail: { contains: q } },
          { cloverOrderId: { contains: q } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }).catch(() => []),
    prisma.studentRegistration.findMany({
      where: {
        OR: [
          { fullName: { contains: q } },
          { phoneNumber: { contains: phoneQuery } },
          { email: { contains: q } },
          { permitNumber: { contains: q } },
          { contractNumber: { contains: q } },
          { id: { contains: q } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }).catch(() => []),
    prisma.lead.findMany({
      where: {
        isTest: false,
        OR: [
          { name: { contains: q } },
          { phone: { contains: phoneQuery } },
          { email: { contains: q } },
          { notes: { contains: q } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }).catch(() => []),
    // The archive database is directly reachable from the production
    // container. Local development may require an interactive SSH-key
    // passphrase, so keep local Command-K useful with platform records only.
    process.env.NODE_ENV === 'production' ? searchStudents(q).catch(() => []) : Promise.resolve([]),
  ])

  // A student and a WhatsApp contact are intentionally separate records in
  // storage, but they represent one person in search. Pull memberships for
  // every student phone returned above so a licence/email search can still
  // open the student's group profile directly.
  const studentPhoneKeys = Array.from(new Set([
    ...students.flatMap(student => [phoneKey(student.phone), phoneKey(student.phoneAlt)]),
    ...externalStudents.map(student => phoneKey(student.phone_number)),
  ].filter(phone => phone.length >= 7)))
  const membershipContacts = studentPhoneKeys.length
    ? await prisma.contact.findMany({
        where: { OR: studentPhoneKeys.map(phone => ({ phone: { contains: phone } })) },
        include: {
          groups: {
            include: { group: { select: { id: true, name: true, archivedAt: true } } },
            take: 3,
          },
        },
      }).catch(() => [])
    : []

  const allContacts = Array.from(new Map(
    [...contacts, ...membershipContacts].map(contact => [contact.id, contact]),
  ).values())
  const contactByPhone = new Map<string, (typeof allContacts)[number]>()
  allContacts.forEach(contact => {
    const key = phoneKey(contact.phone)
    if (key) contactByPhone.set(key, contact)
  })
  const matchedContactIds = new Set<string>()
  const localPhones = new Set(students.flatMap(student => [phoneKey(student.phone), phoneKey(student.phoneAlt)]).filter(Boolean))
  const results: GlobalSearchResult[] = []

  students.forEach(student => {
    const contact = [student.phone, student.phoneAlt]
      .map(phone => contactByPhone.get(phoneKey(phone)))
      .find(Boolean)
    const membership = contact?.groups.find(item => !item.group.archivedAt) || contact?.groups[0]
    if (contact && membership) matchedContactIds.add(contact.id)
    const fallbackSearch = student.phone || student.email || student.name

    results.push({
      id: `student:${student.id}`,
      type: 'student',
      title: student.name,
      subtitle: membership
        ? [student.phone || contact?.phone, membership.group.name].filter(Boolean).join(' · ')
        : [student.phone, student.email, student.licenceNumber && `Licence ${student.licenceNumber}`].filter(Boolean).join(' · ') || 'Student profile',
      meta: membership ? 'Student · Group member' : 'Platform student',
      href: membership && contact
        ? `/groups/${encodeURIComponent(membership.groupId)}/student/${encodeURIComponent(contact.id)}`
        : `/students?search=${encodeURIComponent(fallbackSearch)}`,
    })
  })

  externalStudents
    .filter(student => !localPhones.has(phoneKey(student.phone_number)))
    .slice(0, 8)
    .forEach(student => {
      const contact = contactByPhone.get(phoneKey(student.phone_number))
      const membership = contact?.groups.find(item => !item.group.archivedAt) || contact?.groups[0]
      if (contact && membership) matchedContactIds.add(contact.id)

      results.push({
        id: `external-student:${student.student_id}`,
        type: 'student',
        title: student.full_name,
        subtitle: membership
          ? [student.phone_number, membership.group.name].filter(Boolean).join(' · ')
          : [student.phone_number, student.permit_number && `Permit ${student.permit_number}`, student.contract_number && `Contract ${student.contract_number}`].filter(Boolean).join(' · '),
        meta: membership ? 'Student · Group member' : 'Student archive',
        href: membership && contact
          ? `/groups/${encodeURIComponent(membership.groupId)}/student/${encodeURIComponent(contact.id)}`
          : `/students/${encodeURIComponent(String(student.student_id))}`,
      })
    })

  contacts.forEach(contact => {
    if (matchedContactIds.has(contact.id)) return
    const membership = contact.groups.find(item => !item.group.archivedAt) || contact.groups[0]
    if (!membership) return
    results.push({
      id: `member:${membership.groupId}:${contact.id}`,
      type: 'group-member',
      title: contact.name || contact.pushName || contact.phone,
      subtitle: `${contact.phone} · ${membership.group.name}`,
      meta: 'Group member',
      href: `/groups/${encodeURIComponent(membership.groupId)}/student/${encodeURIComponent(contact.id)}`,
    })
  })

  groups.forEach(group => results.push({
    id: `group:${group.id}`,
    type: 'group',
    title: group.name,
    subtitle: `${group.vehicleType === 'truck' ? 'Class 1' : 'Class 5'} · ${group._count.members} members`,
    meta: group.archivedAt ? 'Archived group' : 'Group',
    href: `/groups/${encodeURIComponent(group.id)}`,
  }))

  invoices.forEach(invoice => results.push({
    id: `invoice:${invoice.id}`,
    type: 'invoice',
    title: `${invoice.invoiceNumber} · ${invoice.studentName}`,
    subtitle: [money(invoice.total), invoice.paymentStatus, invoice.studentPhone].filter(Boolean).join(' · '),
    meta: 'Invoice',
    href: `/invoice/${encodeURIComponent(invoice.id)}`,
  }))

  registrations.forEach(registration => {
    const searchValue = registration.phoneNumber || registration.fullName || registration.id
    results.push({
      id: `registration:${registration.id}`,
      type: 'registration',
      title: registration.fullName || 'Unnamed registration',
      subtitle: [registration.phoneNumber, registration.email, registration.vehicleType === 'truck' ? 'Class 1' : 'Class 5'].filter(Boolean).join(' · '),
      meta: `${registration.status.replace(/_/g, ' ')} registration`,
      href: registration.status === 'submitted'
        ? `/students?review=${encodeURIComponent(registration.id)}`
        : `/students?search=${encodeURIComponent(searchValue)}`,
    })
  })

  leads.forEach(lead => {
    const searchValue = lead.phone || lead.email || lead.name || q
    results.push({
      id: `lead:${lead.id}`,
      type: 'lead',
      title: lead.name || lead.phone || lead.email || 'Unnamed lead',
      subtitle: [lead.phone, lead.email, lead.source.replace(/_/g, ' ')].filter(Boolean).join(' · '),
      meta: `${lead.status} lead`,
      href: `/leads?search=${encodeURIComponent(searchValue)}`,
    })
  })

  return NextResponse.json({ results, query: q })
}
