import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/students/pending — Fetch students (Contacts) not in any group
export async function GET() {
  try {
    // Get all contact IDs that are in at least one group
    const groupMembers = await prisma.groupMember.findMany({
      select: { contactId: true },
      distinct: ['contactId'],
    })
    const inGroupIds = new Set(groupMembers.map(m => m.contactId))

    // Get all contacts that are NOT in any group
    const allContacts = await prisma.contact.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const pending = allContacts.filter(c => !inGroupIds.has(c.id))

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
