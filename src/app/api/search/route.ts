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

  const localPhones = new Set(students.flatMap(student => [student.phone, student.phoneAlt].filter(Boolean)))
  const results: GlobalSearchResult[] = []

  students.forEach(student => results.push({
    id: `student:${student.id}`,
    type: 'student',
    title: student.name,
    subtitle: [student.phone, student.email, student.licenceNumber && `Licence ${student.licenceNumber}`].filter(Boolean).join(' · ') || 'Student profile',
    meta: 'Platform student',
    href: `/students/${encodeURIComponent(student.id)}`,
  }))

  externalStudents
    .filter(student => !localPhones.has(student.phone_number))
    .slice(0, 8)
    .forEach(student => results.push({
      id: `external-student:${student.student_id}`,
      type: 'student',
      title: student.full_name,
      subtitle: [student.phone_number, student.permit_number && `Permit ${student.permit_number}`, student.contract_number && `Contract ${student.contract_number}`].filter(Boolean).join(' · '),
      meta: 'Student archive',
      href: `/students?search=${encodeURIComponent(student.full_name || student.phone_number)}`,
    }))

  contacts.forEach(contact => {
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
