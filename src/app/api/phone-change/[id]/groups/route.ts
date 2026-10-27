import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { addParticipantDirectOnce, addParticipantToGroup, phoneToJid } from '@/lib/whatsapp/client'
import { listGroupsForPhone, recordGroupAction } from '@/lib/phone-change'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const log = await prisma.phoneChangeLog.findUnique({ where: { id } })
  if (!log) {
    return NextResponse.json({ error: 'That phone change is no longer on file.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const action = body.action
  if (action !== 'invite' && action !== 'direct_add') {
    return NextResponse.json({ error: 'Choose an invite link or a direct add.' }, { status: 400 })
  }

  const groups = await listGroupsForPhone(log.oldPhone, log.contactId)
  const allowed = new Set(groups.map(group => group.id))
  const requested: string[] = Array.isArray(body.groupIds) ? body.groupIds.filter((value: unknown) => typeof value === 'string') : []
  const chosen = (requested.length > 0 ? requested : groups.map(group => group.id)).filter(groupId => allowed.has(groupId))
  if (chosen.length === 0) {
    return NextResponse.json({ error: 'Choose at least one group this person is already in.' }, { status: 400 })
  }

  const nameById = new Map(groups.map(group => [group.id, group.name]))
  const results: Array<{
    groupId: string
    groupName: string
    success: boolean
    error?: string
    disconnected?: boolean
    inviteSent?: boolean
  }> = []
  let disconnected = false

  if (action === 'invite') {
    for (const groupId of chosen) {
      try {
        const sent = await addParticipantToGroup(groupId, log.newPhone)
        results.push({
          groupId,
          groupName: nameById.get(groupId) || groupId,
          success: sent.success,
          inviteSent: sent.inviteSent,
          ...(sent.error ? { error: sent.error } : {}),
        })
      } catch (error) {
        results.push({
          groupId,
          groupName: nameById.get(groupId) || groupId,
          success: false,
          error: error instanceof Error ? error.message : 'Could not send the invite',
        })
      }
    }
  } else {
    const newJid = phoneToJid(log.newPhone)
    for (const groupId of chosen) {
      const added = await addParticipantDirectOnce(groupId, log.newPhone)
      results.push({
        groupId,
        groupName: nameById.get(groupId) || groupId,
        success: added.success,
        disconnected: added.disconnected,
        ...(added.error ? { error: added.error } : {}),
      })
      if (added.success) {
        await prisma.contact.upsert({
          where: { id: newJid },
          update: { phone: log.newPhone, ...(log.studentName ? { name: log.studentName } : {}) },
          create: { id: newJid, phone: log.newPhone, name: log.studentName },
        })
        await prisma.groupMember.upsert({
          where: { groupId_contactId: { groupId, contactId: newJid } },
          update: { phone: log.newPhone },
          create: { groupId, contactId: newJid, phone: log.newPhone },
        })
      }
      if (added.disconnected) {
        disconnected = true
        break
      }
    }
  }

  await recordGroupAction(log.id, action, { results, disconnected })

  const message = disconnected
    ? 'WhatsApp disconnected. Open Connect and scan the QR code before the school WhatsApp can send or receive again.'
    : action === 'invite'
      ? 'Invite link sent only for the groups that succeeded.'
      : 'Direct add finished. No invite message was sent.'

  return NextResponse.json({ success: !disconnected, disconnected, message, results })
}
