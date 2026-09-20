import { NextRequest, NextResponse } from 'next/server'
import {
  checkWhatsAppNumber,
  getGroupInviteLink,
  getGroupParticipants,
  getPendingInvites,
  getWhatsAppState,
  sendPrivateMessage,
} from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

// GET /api/groups/[groupId]/invites — pending invites for a group
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const pendingInvites = await getPendingInvites(decodedGroupId)
  return NextResponse.json({ pendingInvites })
}

// POST /api/groups/[groupId]/invites — safely message the reusable group
// link to pending students. This deliberately performs no group-membership
// mutations, so one privacy-restricted student cannot log out the bot.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)

  if (!getWhatsAppState().isConnected) {
    return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 503 })
  }

  try {
    const body = await request.json().catch(() => ({})) as { phones?: string[] }

    // Refresh membership first so anyone already in the group is removed
    // from the pending list before messages are sent.
    await getGroupParticipants(decodedGroupId).catch(() => [])
    const pending = await getPendingInvites(decodedGroupId)
    const requested = body.phones?.length
      ? new Set(body.phones.map(phone => phone.replace(/[^0-9]/g, '')))
      : null
    const recipients = requested
      ? pending.filter(invite => requested.has(invite.phone))
      : pending

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, results: [] })
    }

    const inviteLink = await getGroupInviteLink(decodedGroupId)
    if (!inviteLink) {
      return NextResponse.json({ error: 'Could not load the WhatsApp group invite link' }, { status: 502 })
    }

    const group = await prisma.group.findUnique({
      where: { id: decodedGroupId },
      select: { name: true },
    })
    const groupName = group?.name || 'your Qazi class group'
    const results: Array<{ phone: string; success: boolean; error?: string }> = []

    for (const invite of recipients) {
      try {
        const check = await checkWhatsAppNumber(invite.phone).catch(() => null)
        if (check && !check.registered) {
          results.push({ phone: invite.phone, success: false, error: 'No WhatsApp account' })
        } else {
          await sendPrivateMessage(
            invite.phone,
            `You've been invited to join *${groupName}*\n\nTap here to join:\n${inviteLink}`
          )
          results.push({ phone: invite.phone, success: true })
        }
      } catch (error) {
        results.push({
          phone: invite.phone,
          success: false,
          error: error instanceof Error ? error.message : 'Invite message failed',
        })
      }
      // Normal private messages are much safer than group mutations, while
      // this small spacing keeps a full class within about one minute.
      await new Promise(resolve => setTimeout(resolve, 1500))
    }

    return NextResponse.json({
      success: true,
      sent: results.filter(result => result.success).length,
      failed: results.filter(result => !result.success).length,
      results,
    })
  } catch (error) {
    console.error('Send pending invites error:', error)
    return NextResponse.json({ error: 'Failed to send pending invites' }, { status: 500 })
  }
}

// DELETE /api/groups/[groupId]/invites { phone } — dismiss a pending invite
// (e.g. the student is never going to join, or was invited by mistake)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)

  try {
    const { phone } = await request.json()
    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }
    const cleaned = String(phone).replace(/[^0-9]/g, '')
    await prisma.groupInvite.deleteMany({
      where: { groupId: decodedGroupId, phone: cleaned },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Dismiss invite error:', error)
    return NextResponse.json({ error: 'Failed to dismiss invite' }, { status: 500 })
  }
}
