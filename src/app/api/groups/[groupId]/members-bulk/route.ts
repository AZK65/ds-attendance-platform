import { NextRequest, NextResponse } from 'next/server'
import { addParticipantsToGroupBulk, getWhatsAppState, phoneToJid } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

// POST /api/groups/[groupId]/members-bulk
// Adds multiple members to a group in a single WhatsApp call
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const state = getWhatsAppState()

  try {
    const { members } = await request.json() as {
      members: Array<{ phone: string; name: string }>
    }

    if (!members || members.length === 0) {
      return NextResponse.json({ error: 'No members provided' }, { status: 400 })
    }

    // Save all to SQLite first (so they show up in the app regardless of WhatsApp result)
    for (const m of members) {
      const jid = phoneToJid(m.phone)
      await prisma.contact.upsert({
        where: { id: jid },
        update: { phone: m.phone, ...(m.name ? { name: m.name } : {}), lastSynced: new Date() },
        create: { id: jid, phone: m.phone, name: m.name || null },
      })
      await prisma.groupMember.upsert({
        where: { groupId_contactId: { groupId: decodedGroupId, contactId: jid } },
        update: { phone: m.phone },
        create: { groupId: decodedGroupId, contactId: jid, phone: m.phone },
      })
    }

    // Bulk add to WhatsApp
    if (!state.isConnected) {
      return NextResponse.json({
        results: members.map(m => ({
          phone: m.phone,
          name: m.name,
          success: true,
          warning: 'WhatsApp not connected — saved to database only',
        })),
      })
    }

    const phones = members.map(m => m.phone)
    const waResults = await addParticipantsToGroupBulk(decodedGroupId, phones)

    // Merge results with names
    const results = waResults.map((r, i) => ({
      phone: r.phone,
      name: members[i].name,
      success: r.success,
      inviteSent: r.inviteSent,
      error: r.error,
    }))

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Bulk add members error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add members' },
      { status: 500 }
    )
  }
}
