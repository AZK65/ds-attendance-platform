import { NextRequest, NextResponse } from 'next/server'
import { sendMessageToGroup } from '@/lib/whatsapp/client'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const decodedGroupId = decodeURIComponent(groupId)
    const { message } = await request.json()

    console.log(`[API] Sending message to group ${decodedGroupId}`)

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    await sendMessageToGroup(decodedGroupId, message)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Send message error:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
