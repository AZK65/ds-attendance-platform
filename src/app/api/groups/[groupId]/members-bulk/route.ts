import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppState, phoneToJid, sendPrivateMessage, getGroupInviteLink } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

// POST /api/groups/[groupId]/members-bulk
// Saves members to SQLite and sends invite links (no addParticipants — it crashes Chromium)
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

    // Save all to SQLite (so they show up in the app)
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

    // Send invite links via private message (safe — doesn't crash WhatsApp)
    const results: Array<{ phone: string; name: string; success: boolean; inviteSent?: boolean; error?: string }> = []

    if (state.isConnected) {
      // Get group invite link once
      const inviteLink = await getGroupInviteLink(decodedGroupId) || ''

      for (const m of members) {
        if (inviteLink) {
          try {
            await sendPrivateMessage(m.phone, `You've been added to a class group!\n\nClick to join:\n${inviteLink}`)
            results.push({ phone: m.phone, name: m.name, success: true, inviteSent: true })
          } catch {
            results.push({ phone: m.phone, name: m.name, success: true, error: 'Saved but invite failed' })
          }
          await new Promise(r => setTimeout(r, 1500))
        } else {
          results.push({ phone: m.phone, name: m.name, success: true, error: 'Saved (no invite link)' })
        }
      }
    } else {
      for (const m of members) {
        results.push({ phone: m.phone, name: m.name, success: true, error: 'WhatsApp not connected — saved to database only' })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Bulk add members error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add members' },
      { status: 500 }
    )
  }
}
