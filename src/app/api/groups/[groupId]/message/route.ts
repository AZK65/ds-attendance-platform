import { NextRequest, NextResponse } from 'next/server'
import { sendMessageToGroup } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)

  try {
    const { message } = await request.json()

    console.log(`[API] Sending message to group ${decodedGroupId}`)

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    await sendMessageToGroup(decodedGroupId, message)

    // Log to MessageLog
    await prisma.messageLog.create({
      data: {
        type: 'group-message',
        to: decodedGroupId,
        toName: 'Group Chat',
        message: message.slice(0, 500),
        status: 'sent',
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Send message error:', error)

    // Log failure
    await prisma.messageLog.create({
      data: {
        type: 'group-message',
        to: decodedGroupId,
        toName: 'Group Chat',
        message: 'Failed to send group message',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    }).catch(() => {})

    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
