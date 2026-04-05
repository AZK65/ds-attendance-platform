import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppState, phoneToJid, sendPrivateMessage, getGroupInviteLink } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

// POST /api/groups/[groupId]/members-bulk
// Adds ONLY new members to a group — skips anyone already in it
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

    // Get who's already in the group
    const existingMembers = await prisma.groupMember.findMany({
      where: { groupId: decodedGroupId },
      select: { phone: true },
    })
    const existingPhones = new Set<string>()
    for (const m of existingMembers) {
      existingPhones.add(m.phone)
      existingPhones.add(m.phone.slice(-10))
    }

    // Split into existing vs new
    const isExisting = (phone: string) => {
      const cleaned = phone.replace(/\D/g, '')
      return existingPhones.has(cleaned) || existingPhones.has(cleaned.slice(-10))
    }

    const newMembers = members.filter(m => !isExisting(m.phone))
    const skipped = members.filter(m => isExisting(m.phone))

    const results: Array<{ phone: string; name: string; success: boolean; inviteSent?: boolean; error?: string }> = []

    // Report skipped members
    for (const m of skipped) {
      results.push({ phone: m.phone, name: m.name, success: true, error: 'Already in group' })
    }

    if (newMembers.length === 0) {
      return NextResponse.json({ results })
    }

    // Save ONLY new members to SQLite
    for (const m of newMembers) {
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

    // Send invite links ONLY to new members
    if (state.isConnected) {
      const inviteLink = await getGroupInviteLink(decodedGroupId) || ''

      for (const m of newMembers) {
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
      for (const m of newMembers) {
        results.push({ phone: m.phone, name: m.name, success: true, error: 'Saved — WhatsApp not connected' })
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
