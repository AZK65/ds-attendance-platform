import { NextRequest, NextResponse } from 'next/server'
import { getChatMessages, sendMessageToGroup, sendPrivateMessage, sendToRawChatId, getWhatsAppState } from '@/lib/whatsapp/client'
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

    // ?limit=<n> — client uses this to progressively load more history when
    // the user hits "Load older". Clamped so a runaway request can't ask WA
    // for 100k messages and lock the Chromium frame.
    const rawLimit = Number(request.nextUrl.searchParams.get('limit'))
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(2000, Math.floor(rawLimit))
      : 100

    const decodedChatId = decodeURIComponent(chatId)
    const messages = await getChatMessages(decodedChatId, limit)

    return NextResponse.json({ messages, connected: true, limit })
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

    // Send via the appropriate method for each chat type.
    //  - @g.us  : WhatsApp group. Uses the group send path.
    //  - @c.us  : regular direct message (legacy WhatsApp JID). Strip suffix
    //             so sendPrivateMessage can re-JID via phoneToJid and get
    //             its LID-resolve retry for free.
    //  - @lid   : Linked ID — newer WhatsApp contact identifier that isn't
    //             a phone number. Send the raw JID as-is; phoneToJid would
    //             mangle it into `<lid>@c.us` and the send would silently
    //             miss.
    //  - anything else with an @ : unknown but not obviously wrong; forward
    //             raw and let WhatsApp reject if truly invalid. Better than
    //             hard-rejecting a JID format we haven't seen yet.
    if (decodedChatId.endsWith('@g.us')) {
      await sendMessageToGroup(decodedChatId, message)
    } else if (decodedChatId.endsWith('@c.us')) {
      const phone = decodedChatId.replace('@c.us', '')
      await sendPrivateMessage(phone, message)
    } else if (decodedChatId.includes('@')) {
      await sendToRawChatId(decodedChatId, message)
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
