import { NextRequest, NextResponse } from 'next/server'
import { getChatMessages, sendMessageToGroup, sendPrivateMessage, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params
    const waState = getWhatsAppState()
    if (!waState.isConnected) {
      return NextResponse.json({ messages: [], connected: false })
    }

    const decodedChatId = decodeURIComponent(chatId)
    const messages = await getChatMessages(decodedChatId, 50)

    return NextResponse.json({ messages, connected: true })
  } catch (error) {
    console.error('[API /inbox/messages] Error:', error)
    return NextResponse.json(
      { messages: [], connected: false, error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params
    const decodedChatId = decodeURIComponent(chatId)
    const { message } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const waState = getWhatsAppState()
    if (!waState.isConnected) {
      return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 503 })
    }

    // Send via appropriate method
    if (decodedChatId.endsWith('@g.us')) {
      await sendMessageToGroup(decodedChatId, message)
    } else if (decodedChatId.endsWith('@c.us')) {
      const phone = decodedChatId.replace('@c.us', '')
      await sendPrivateMessage(phone, message)
    } else {
      return NextResponse.json({ error: 'Invalid chat ID format' }, { status: 400 })
    }

    // Log the message
    try {
      await prisma.messageLog.create({
        data: {
          type: decodedChatId.endsWith('@g.us') ? 'group-message' : 'inbox-dm',
          to: decodedChatId,
          toName: decodedChatId,
          message: message.substring(0, 200),
          status: 'sent'
        }
      })
    } catch {
      // Logging failure should not block send
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /inbox/messages POST] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}
