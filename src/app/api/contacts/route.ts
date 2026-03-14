import { NextRequest, NextResponse } from 'next/server'
import { searchContacts, getGroupParticipants, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const excludeGroupId = searchParams.get('excludeGroupId')

  try {
    const state = getWhatsAppState()

    // Always search local Student table (from invoices/certificates) — fast DB query
    let studentContacts: Array<{ id: string; phone: string; name: string | null; pushName: string | null; source: string }> = []
    if (search.length >= 2) {
      try {
        const students = await prisma.student.findMany({
          where: {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
            ],
          },
          take: 10,
          orderBy: { updatedAt: 'desc' },
        })
        studentContacts = students
          .filter(s => s.phone)
          .map(s => ({
            id: `student-${s.id}`,
            phone: s.phone!,
            name: s.name,
            pushName: null,
            source: 'student',
          }))
      } catch {
        // Non-fatal
      }
    }

    if (!state.isConnected) {
      return NextResponse.json({ contacts: studentContacts, disconnected: true })
    }

    // Get contacts from WhatsApp
    const allContacts = await searchContacts(search)

    // Get current group members to exclude them
    let excludeIds: Set<string> = new Set()
    if (excludeGroupId) {
      try {
        const participants = await getGroupParticipants(excludeGroupId)
        excludeIds = new Set(participants.map(p => p.id))
      } catch {
        // Group might not exist or not accessible
      }
    }

    // Filter out existing group members
    const waContacts = allContacts.filter(c => !excludeIds.has(c.id))

    // Merge: WhatsApp contacts first, then Student records not already in WhatsApp results
    const waPhones = new Set(waContacts.map(c => c.phone))
    const uniqueStudents = studentContacts.filter(s => !waPhones.has(s.phone))

    const contacts = [
      ...waContacts,
      ...uniqueStudents,
    ]

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error('Search contacts error:', error)
    return NextResponse.json(
      { error: 'Failed to search contacts' },
      { status: 500 }
    )
  }
}
