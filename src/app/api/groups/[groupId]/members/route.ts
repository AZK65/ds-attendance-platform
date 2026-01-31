import { NextRequest, NextResponse } from 'next/server'
import {
  addParticipantToGroup,
  removeParticipantFromGroup,
  getWhatsAppState
} from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function POST(
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
    const { contactId, phone } = body

    // Use phone number directly (wwebjs expects phone number, not full JID)
    const phoneToAdd = phone || contactId?.replace('@c.us', '')

    const result = await addParticipantToGroup(decodedGroupId, phoneToAdd)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to add member' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Add member error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add member to group' },
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Remove member error:', error)
    return NextResponse.json(
      { error: 'Failed to remove member from group' },
      { status: 500 }
    )
  }
}
