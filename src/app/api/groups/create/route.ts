import { NextRequest, NextResponse } from 'next/server'
import { createWhatsAppGroup, getWhatsAppState, phoneToJid } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  const state = getWhatsAppState()

  if (!state.isConnected) {
    return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 503 })
  }

  try {
    const { name, participants } = await request.json() as {
      name: string
      participants: string[]
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    const result = await createWhatsAppGroup(name.trim(), participants || [])

    // Sync new group to database
    await prisma.group.upsert({
      where: { id: result.groupId },
      update: { name: result.title, lastSynced: new Date() },
      create: {
        id: result.groupId,
        name: result.title,
        participantCount: (participants?.length || 0) + 1, // +1 for self
      },
    })

    // Sync participants as contacts + group members
    for (const phone of (participants || [])) {
      const jid = phoneToJid(phone)
      await prisma.contact.upsert({
        where: { id: jid },
        update: { phone, lastSynced: new Date() },
        create: { id: jid, phone },
      })
      await prisma.groupMember.upsert({
        where: { groupId_contactId: { groupId: result.groupId, contactId: jid } },
        update: { phone },
        create: { groupId: result.groupId, contactId: jid, phone },
      })
    }

    return NextResponse.json({
      success: true,
      groupId: result.groupId,
      title: result.title,
    })
  } catch (error) {
    console.error('Create group error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create group' },
      { status: 500 }
    )
  }
}
