import { NextRequest, NextResponse } from 'next/server'
import { getAllChats, getWhatsAppState } from '@/lib/whatsapp/client'

export async function GET(request: NextRequest) {
  try {
    const waState = getWhatsAppState()
    if (!waState.isConnected) {
      return NextResponse.json({ chats: [], connected: false })
    }

    const search = request.nextUrl.searchParams.get('search')?.toLowerCase() || ''

    let chats = await getAllChats()

    // Server-side search filter
    if (search) {
      chats = chats.filter(chat =>
        chat.name.toLowerCase().includes(search) ||
        chat.id.toLowerCase().includes(search)
      )
    }

    return NextResponse.json({ chats, connected: true })
  } catch (error) {
    console.error('[API /inbox/chats] Error:', error)
    return NextResponse.json(
      { chats: [], connected: false, error: 'Failed to fetch chats' },
      { status: 500 }
    )
  }
}
