import { NextRequest, NextResponse } from 'next/server'
import { createWhatsAppGroup, getWhatsAppState, phoneToJid, getGroupParticipants, sendPrivateMessage, getGroupInviteLink, recordGroupInvite } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'
import { syncGroupMembers } from '@/lib/group-sync'

export async function POST(request: NextRequest) {
  const state = getWhatsAppState()

  if (!state.isConnected) {
    return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 503 })
  }

  try {
    const { name, participants, participantNames, vehicleType: requestedType } = await request.json() as {
      name: string
      participants: string[]
      participantNames?: string[]
      vehicleType?: 'car' | 'truck'
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    const vehicleType: 'car' | 'truck' = requestedType === 'truck' ? 'truck' : 'car'

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
        update: { name: title, vehicleType },
        create: {
          id: groupId,
          name: title,
          // Do not count every selected student as joined. WhatsApp may add
          // only some of them and require the rest to use an invite link.
          // The authoritative live roster below fills this in.
          participantCount: 0,
          lastSynced: new Date(0),
          vehicleType,
        },
      })

      // Save the student contacts now, but do not create GroupMember rows
      // until WhatsApp confirms they are actually inside the group. The old
      // flow inserted all selected students here and then also rendered the
      // rejected ones as pending invites (for example 30 + 18 = 48 rows).
      for (let i = 0; i < (participants || []).length; i++) {
        const phone = participants[i]
        const memberName = participantNames?.[i] || null
        const jid = phoneToJid(phone)
        await prisma.contact.upsert({
          where: { id: jid },
          update: { phone, ...(memberName ? { name: memberName } : {}), lastSynced: new Date() },
          create: { id: jid, phone, name: memberName },
        })
      }
    } catch (dbError) {
      console.error('SQLite sync after group create failed:', dbError)
      // Group was created on WhatsApp — return success with warning
      whatsappWarning = 'Group created but database sync failed'
    }

    // Check which participants actually got added and send invite links to the rest
    let missingMembers: string[] = []
    try {
      await new Promise(r => setTimeout(r, 2000)) // Let WhatsApp settle
      const actualParticipants = await getGroupParticipants(groupId)
      // The live WhatsApp roster is the only source of truth for "joined".
      // Everyone absent from this list is represented once, as pending.
      await syncGroupMembers(groupId, actualParticipants)
      const actualPhones = new Set(actualParticipants.map(p => p.phone))

      for (const phone of (participants || [])) {
        const cleaned = phone.replace(/\D/g, '')
        if (!actualPhones.has(cleaned) && !actualPhones.has('1' + cleaned) && !actualPhones.has(cleaned.replace(/^1/, ''))) {
          missingMembers.push(phone)
        }
      }

      if (missingMembers.length > 0) {
        const initiallyMissing = [...missingMembers]
        let invitedCount = 0
        const inviteLink = await getGroupInviteLink(groupId)
        console.log(`[createGroup] ${initiallyMissing.length} participants were not added directly; sending safe group-link messages...`)

        // Do not retry a whole roster with addParticipants. Rapid group
        // mutations — and WhatsApp's broken automatic Invite V4 fallback —
        // are what invalidated the linked device. The creation RPC already
        // directly added everyone WhatsApp allowed; only the rejected people
        // receive the normal group link here.
        await Promise.all(initiallyMissing.map(phone => recordGroupInvite(groupId, phone).catch(() => {})))
        for (const phone of initiallyMissing) {
          if (!inviteLink) continue
          try {
            await sendPrivateMessage(phone, `You've been invited to join *${title}*\n\nTap here to join:\n${inviteLink}`)
            invitedCount++
          } catch (err) {
            console.log(`[createGroup] Could not message invite to ${phone}:`, err)
          }
          await new Promise(r => setTimeout(r, 1500))
        }
        missingMembers = initiallyMissing
        whatsappWarning = inviteLink
          ? `${invitedCount} member(s) received a WhatsApp group invite; ${initiallyMissing.length} remain pending until they join`
          : `${initiallyMissing.length} member(s) remain pending; the invite link could not be loaded`
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
