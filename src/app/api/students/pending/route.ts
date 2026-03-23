import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchStudentsByPhones } from '@/lib/external-db'

// GET /api/students/pending — Fetch students created via the app that aren't in any group yet
export async function GET() {
  try {
    // Get all contact IDs that are in at least one group
    const groupMembers = await prisma.groupMember.findMany({
      select: { contactId: true },
      distinct: ['contactId'],
    })
    const inGroupIds = new Set(groupMembers.map(m => m.contactId))

    // Get contacts with a name (app-created contacts have names set)
    // that are NOT in any group
    const namedContacts = await prisma.contact.findMany({
      where: { name: { not: null } },
      orderBy: { createdAt: 'desc' },
    })

    const ungrouped = namedContacts.filter(c => !inGroupIds.has(c.id))

    // Cross-reference with MySQL to confirm they're real students
    // (not just random WhatsApp contacts that got a name from pushName sync)
    const phones = ungrouped.map(c => c.phone)
    let mysqlStudents: Array<{ phone_number: string }> = []
    try {
      mysqlStudents = await searchStudentsByPhones(phones)
    } catch {
      // MySQL might not be reachable — fall back to all named ungrouped contacts
    }

    let pending = ungrouped
    if (mysqlStudents.length > 0) {
      // Only include contacts that exist in MySQL student table
      const mysqlPhones = new Set(
        mysqlStudents.map(s => (s.phone_number || '').replace(/\D/g, '').slice(-10))
      )
      pending = ungrouped.filter(c => {
        const last10 = c.phone.replace(/\D/g, '').slice(-10)
        return mysqlPhones.has(last10)
      })
    }

    return NextResponse.json({
      students: pending.map(c => ({
        id: c.id,
        phone: c.phone,
        name: c.name || c.pushName || null,
        createdAt: c.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[Pending Students] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending students' },
      { status: 500 }
    )
  }
}
