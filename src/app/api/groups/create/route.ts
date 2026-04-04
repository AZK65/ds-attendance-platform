import { NextRequest, NextResponse } from 'next/server'
import { createWhatsAppGroup, getWhatsAppState, phoneToJid, getGroupParticipants, sendPrivateMessage, addParticipantToGroup } from '@/lib/whatsapp/client'
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

    let groupId: string
    let title: string
    let whatsappWarning: string | undefined

    try {
      const result = await createWhatsAppGroup(name.trim(), participants || [])
      groupId = result.groupId
      title = result.title
    } catch (waError) {
      console.error('WhatsApp createGroup failed:', waError)
      whatsappWarning = waError instanceof Error ? waError.message : 'WhatsApp group creation failed'
      // Can't proceed without a group ID from WhatsApp
      return NextResponse.json(
        { error: 'Failed to create WhatsApp group: ' + whatsappWarning },
        { status: 500 }
      )
    }

    // Always sync to SQLite — even if WhatsApp had partial failures
    try {
      await prisma.group.upsert({
        where: { id: groupId },
        update: { name: title, lastSynced: new Date() },
        create: {
          id: groupId,
          name: title,
          participantCount: (participants?.length || 0) + 1,
        },
      })

      for (const phone of (participants || [])) {
        const jid = phoneToJid(phone)
        await prisma.contact.upsert({
          where: { id: jid },
          update: { phone, lastSynced: new Date() },
          create: { id: jid, phone },
        })
        await prisma.groupMember.upsert({
          where: { groupId_contactId: { groupId, contactId: jid } },
          update: { phone },
          create: { groupId, contactId: jid, phone },
        })
      }
    } catch (dbError) {
      console.error('SQLite sync after group create failed:', dbError)
      // Group was created on WhatsApp — return success with warning
      whatsappWarning = 'Group created but database sync failed'
    }

    // Check which participants actually got added and send invite links to the rest
    const missingMembers: string[] = []
    try {
      await new Promise(r => setTimeout(r, 2000)) // Let WhatsApp settle
      const actualParticipants = await getGroupParticipants(groupId)
      const actualPhones = new Set(actualParticipants.map(p => p.phone))

      for (const phone of (participants || [])) {
        const cleaned = phone.replace(/\D/g, '')
        if (!actualPhones.has(cleaned) && !actualPhones.has('1' + cleaned) && !actualPhones.has(cleaned.replace(/^1/, ''))) {
          missingMembers.push(phone)
        }
      }

      if (missingMembers.length > 0) {
        console.log(`[createGroup] ${missingMembers.length} participants not added, trying individual add + invite links...`)
        for (const phone of missingMembers) {
          try {
            const result = await addParticipantToGroup(groupId, phone)
            if (result.inviteSent) {
              console.log(`[createGroup] Invite sent to ${phone}`)
            } else if (result.success) {
              console.log(`[createGroup] Added ${phone} on retry`)
            }
          } catch (err) {
            console.log(`[createGroup] Failed to add/invite ${phone}:`, err)
          }
          await new Promise(r => setTimeout(r, 1500))
        }
        whatsappWarning = `${missingMembers.length} member(s) couldn't be added directly — invite links sent`
      }
    } catch (checkErr) {
      console.log('[createGroup] Could not verify participants:', checkErr)
    }

    return NextResponse.json({
      success: true,
      groupId,
      title,
      whatsappWarning,
      missingMembers,
    })
  } catch (error) {
    console.error('Create group error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create group' },
      { status: 500 }
    )
  }
}
