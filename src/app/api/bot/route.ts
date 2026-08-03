import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Admin-only. Middleware already gates /api/* on the auth-token cookie —
// no extra check needed here.

// GET /api/bot — status snapshot for the admin UI
//   { enabled: true, model: '...', conversations: [{ phone, displayName, studentId,
//     lastMessageAt, messageCount, paused, pausedUntil }], pauses: [{ phone, pausedUntil, reason }] }
export async function GET() {
  const conversations = await prisma.botConversation.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, role: true, body: true } },
    },
  })
  const pauseMap = new Map(
    (await prisma.botPause.findMany()).map(p => [p.phone, p])
  )
  const now = Date.now()

  return NextResponse.json({
    enabled: process.env.BOT_ENABLED !== 'false',
    model: process.env.BOT_MODEL || 'anthropic/claude-haiku-4.5',
    conversations: conversations.map(c => {
      const p = pauseMap.get(c.phone)
      const paused = !!(p && p.pausedUntil.getTime() > now)
      return {
        phone: c.phone,
        displayName: c.displayName,
        studentId: c.studentId,
        messageCount: c._count.messages,
        lastMessage: c.messages[0] || null,
        paused,
        pausedUntil: paused ? p!.pausedUntil : null,
        pauseReason: paused ? p!.reason : null,
      }
    }),
  })
}

// POST /api/bot — { phone, action: 'pause' | 'resume', hours? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const phone = String(body.phone || '').replace(/\D/g, '')
  const action = String(body.action || '')
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  if (action === 'pause') {
    const hours = Math.max(1, Math.min(24 * 30, Number(body.hours) || 24))
    const pausedUntil = new Date(Date.now() + hours * 60 * 60 * 1000)
    await prisma.botPause.upsert({
      where: { phone },
      create: { phone, pausedUntil, reason: 'admin-manual' },
      update: { pausedUntil, reason: 'admin-manual' },
    })
    return NextResponse.json({ ok: true, pausedUntil })
  }
  if (action === 'resume') {
    await prisma.botPause.deleteMany({ where: { phone } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'action must be pause or resume' }, { status: 400 })
}
