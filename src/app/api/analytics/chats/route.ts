import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - list all chats
export async function GET() {
  const chats = await prisma.analyticsChat.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { messages: true } } },
  })

  return NextResponse.json({
    chats: chats.map(c => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    })),
  })
}

// POST - create new chat
export async function POST() {
  const chat = await prisma.analyticsChat.create({
    data: { title: 'New Chat' },
  })
  return NextResponse.json({ chat })
}
