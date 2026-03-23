import { NextRequest, NextResponse } from 'next/server'
import {
  addParticipantToGroup,
  removeParticipantFromGroup,
  getWhatsAppState,
  phoneToJid
} from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const state = getWhatsAppState()

  try {
    const body = await request.json()
    const { contactId, phone, name } = body

    // Use phone number directly (wwebjs expects phone number, not full JID)
    const phoneToAdd = phone || contactId?.replace('@c.us', '')

    // Always save to SQLite first so the student shows up in the app
    const jid = phoneToAdd.includes('@') ? phoneToAdd : `${phoneToAdd}@c.us`
    await prisma.contact.upsert({
      where: { id: jid },
      update: { phone: phoneToAdd, ...(name ? { name } : {}), lastSynced: new Date() },
      create: { id: jid, phone: phoneToAdd, name: name || null },
    })
    await prisma.groupMember.upsert({
      where: { groupId_contactId: { groupId: decodedGroupId, contactId: jid } },
      update: { phone: phoneToAdd },
      create: { groupId: decodedGroupId, contactId: jid, phone: phoneToAdd },
    })

    // Try adding to WhatsApp group (best-effort — student is already in our DB)
    let whatsappWarning: string | undefined
    if (state.isConnected) {
      const result = await addParticipantToGroup(decodedGroupId, phoneToAdd)
      if (!result.success) {
        whatsappWarning = result.error || 'Could not add to WhatsApp group'
        console.log(`[Add Member] WhatsApp add failed for ${phoneToAdd}: ${whatsappWarning}`)
      }
    } else {
      whatsappWarning = 'WhatsApp not connected — student saved to database only'
    }

    return NextResponse.json({
      success: true,
      whatsappWarning,
    })
  } catch (error) {
    console.error('Add member error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add member to group' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const state = getWhatsAppState()

  try {
    const body = await request.json()
    const { contactId, newPhone, newName } = body

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
    }

    const oldPhone = contactId.replace('@c.us', '')

    // If phone changed, swap in WhatsApp group
    if (newPhone && newPhone !== oldPhone) {
      if (!state.isConnected) {
        return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 400 })
      }

      // Step 1: Remove old number from group
      try {
        await removeParticipantFromGroup(decodedGroupId, contactId)
      } catch (removeErr) {
        console.error('Failed to remove old participant:', removeErr)
        return NextResponse.json(
          { error: `Failed to remove old number from group: ${removeErr instanceof Error ? removeErr.message : String(removeErr)}` },
          { status: 500 }
        )
      }

      // Step 2: Add new number to group
      const addResult = await addParticipantToGroup(decodedGroupId, newPhone)
      if (!addResult.success) {
        // Rollback: try to re-add old number
        console.error('Failed to add new number, rolling back...')
        try {
          await addParticipantToGroup(decodedGroupId, oldPhone)
        } catch (rollbackErr) {
          console.error('Rollback also failed:', rollbackErr)
        }
        return NextResponse.json(
          { error: addResult.error || 'Failed to add new phone to group. Old number was restored.' },
          { status: 400 }
        )
      }

      // Step 3: Update Contact in database
      const newJid = phoneToJid(newPhone)
      await prisma.contact.upsert({
        where: { id: newJid },
        update: {
          phone: newPhone,
          ...(newName !== undefined && { name: newName }),
          lastSynced: new Date(),
        },
        create: {
          id: newJid,
          phone: newPhone,
          name: newName || null,
          pushName: null,
        },
      })
    } else if (newName !== undefined) {
      // Only name changed — update local database
      await prisma.contact.update({
        where: { id: contactId },
        data: { name: newName },
      }).catch(() => {
        // Contact might not exist in DB yet, create it
        return prisma.contact.upsert({
          where: { id: contactId },
          update: { name: newName },
          create: {
            id: contactId,
            phone: oldPhone,
            name: newName,
          },
        })
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update member error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update member' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const state = getWhatsAppState()

  if (!state.isConnected) {
    return NextResponse.json(
      { error: 'WhatsApp not connected' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const { contactId } = body

    await removeParticipantFromGroup(decodedGroupId, contactId)

    // Remove from database
    const sheet = await prisma.attendanceSheet.findUnique({
      where: { groupId: decodedGroupId }
    })

    if (sheet) {
      await prisma.attendanceRecord.deleteMany({
        where: {
          attendanceSheetId: sheet.id,
          contactId
        }
      })
    }

    // Remove from GroupMember table so cached queries return fresh data
    await prisma.groupMember.deleteMany({
      where: { groupId: decodedGroupId, contactId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Remove member error:', error)
    return NextResponse.json(
      { error: 'Failed to remove member from group' },
      { status: 500 }
    )
  }
}
