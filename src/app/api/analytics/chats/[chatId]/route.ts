import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - load a single chat with all messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params

  const chat = await prisma.analyticsChat.findUnique({
    where: { id: chatId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  return NextResponse.json({ chat })
}

// DELETE - delete a chat
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params

  await prisma.analyticsChat.delete({ where: { id: chatId } }).catch(() => {})

  return NextResponse.json({ success: true })
}
