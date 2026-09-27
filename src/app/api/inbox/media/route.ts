import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppState, sendMediaToChat } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 25 * 1024 * 1024

function isAdmin(request: NextRequest): boolean {
  return request.cookies.get('auth-token')?.value === 'valid'
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!getWhatsAppState().isConnected) {
      return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 503 })
    }

    const form = await request.formData()
    const chatId = String(form.get('chatId') || '')
    const caption = String(form.get('message') || '').trim()
    const file = form.get('file')

    if (!chatId.includes('@')) {
      return NextResponse.json({ error: 'Invalid chat' }, { status: 400 })
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Choose a photo or file first' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Attachment must be 25 MB or smaller' }, { status: 413 })
    }

    const mimetype = file.type || 'application/octet-stream'
    const filename = file.name || 'attachment'
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    await sendMediaToChat(chatId, base64, filename, mimetype, caption)

    try {
      await prisma.messageLog.create({
        data: {
          type: chatId.endsWith('@g.us') ? 'group-media' : 'inbox-media',
          to: chatId,
          toName: chatId,
          message: (caption || `[${mimetype}] ${filename}`).substring(0, 200),
          status: 'sent',
        },
      })
    } catch {
      // Sending succeeded; logging must never turn it into a visible failure.
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send attachment'
    console.error('[Inbox media] Send failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
