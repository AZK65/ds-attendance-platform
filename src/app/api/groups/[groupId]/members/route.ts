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
    let whatsappWarning: string | undefined

    // Always update SQLite first
    if (newPhone && newPhone !== oldPhone) {
      const newJid = phoneToJid(newPhone)

      // Update Contact: create new, keep old for history
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

      // Update GroupMember: remove old, add new
      await prisma.groupMember.deleteMany({
        where: { groupId: decodedGroupId, contactId },
      })
      await prisma.groupMember.upsert({
        where: { groupId_contactId: { groupId: decodedGroupId, contactId: newJid } },
        update: { phone: newPhone },
        create: { groupId: decodedGroupId, contactId: newJid, phone: newPhone },
      })

      // Try WhatsApp swap (best-effort)
      if (state.isConnected) {
        try {
          await removeParticipantFromGroup(decodedGroupId, contactId)
        } catch (removeErr) {
          console.error('Failed to remove old participant from WhatsApp:', removeErr)
          whatsappWarning = 'Could not remove old number from WhatsApp group'
        }

        const addResult = await addParticipantToGroup(decodedGroupId, newPhone)
        if (!addResult.success) {
          console.log(`[Edit Member] WhatsApp add failed for ${newPhone}: ${addResult.error}`)
          whatsappWarning = (whatsappWarning ? whatsappWarning + '; ' : '') +
            (addResult.error || 'Could not add new number to WhatsApp group')
        }
      } else {
        whatsappWarning = 'WhatsApp not connected — database updated only'
      }
    } else if (newName !== undefined) {
      // Only name changed — update local database
      await prisma.contact.upsert({
        where: { id: contactId },
        update: { name: newName },
        create: {
          id: contactId,
          phone: oldPhone,
          name: newName,
        },
      })
    }

    return NextResponse.json({ success: true, whatsappWarning })
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
