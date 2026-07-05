import { NextRequest, NextResponse } from 'next/server'
import { getPendingInvites } from '@/lib/whatsapp/client'
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
