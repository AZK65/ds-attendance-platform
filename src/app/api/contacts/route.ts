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
      // Search cached WhatsApp contacts from SQLite
      let cachedContacts: Array<{ id: string; phone: string; name: string | null; pushName: string | null; source?: string }> = []
      if (search.length >= 2) {
        try {
          const cached = await prisma.contact.findMany({
            where: {
              OR: [
                { name: { contains: search } },
                { pushName: { contains: search } },
                { phone: { contains: search } },
              ],
            },
            take: 20,
            orderBy: { updatedAt: 'desc' },
          })
          cachedContacts = cached.map(c => ({
            id: c.id,
            phone: c.phone,
            name: c.name,
            pushName: c.pushName,
          }))
        } catch {
          // Non-fatal
        }
      }

      // Merge cached WhatsApp contacts + invoice students
      const cachedPhones = new Set(cachedContacts.map(c => c.phone))
      const uniqueStudents = studentContacts.filter(s => !cachedPhones.has(s.phone))

      return NextResponse.json({ contacts: [...cachedContacts, ...uniqueStudents], disconnected: true })
    }

    // Get contacts from WhatsApp + cached SQLite contacts
    let waContacts: Array<{ id: string; phone: string; name: string | null; pushName: string | null }> = []
    try {
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
      waContacts = allContacts.filter(c => !excludeIds.has(c.id))
    } catch {
      // WhatsApp search failed — fall through to cached contacts
    }

    // Also search cached contacts from SQLite (fills gaps when WhatsApp contact list is incomplete)
    if (search.length >= 2) {
      try {
        const cached = await prisma.contact.findMany({
          where: {
            OR: [
              { name: { contains: search } },
              { pushName: { contains: search } },
              { phone: { contains: search } },
            ],
          },
          take: 20,
          orderBy: { updatedAt: 'desc' },
        })
        const waPhones = new Set(waContacts.map(c => c.phone))
        for (const c of cached) {
          if (!waPhones.has(c.phone)) {
            waContacts.push({ id: c.id, phone: c.phone, name: c.name, pushName: c.pushName })
            waPhones.add(c.phone)
          }
        }
      } catch {
        // Non-fatal
      }
    }

    // Merge: WhatsApp/cached contacts first, then Student records not already present
    const allPhones = new Set(waContacts.map(c => c.phone))
    const uniqueStudents = studentContacts.filter(s => !allPhones.has(s.phone))

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
