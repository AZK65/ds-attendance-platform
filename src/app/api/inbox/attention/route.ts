import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/inbox/attention — count of WhatsApp threads that need a human reply.
//
// A thread "needs attention" when the last message on it is either:
//   - role='user'    — customer sent, nobody responded yet
//   - role='assistant' status='deferred' — bot chose silence, needs human
//
// Threads where the last message is role='admin' or role='assistant' status='sent'
// are considered handled. Only looks at conversations touched in the last 14
// days so ancient threads don't inflate the counter forever.
//
// Admin-only (middleware).
export async function GET() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const convs = await prisma.botConversation.findMany({
    where: { updatedAt: { gte: since } },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { role: true, status: true, createdAt: true, body: true },
      },
    },
  })
  const needing = convs.filter(c => {
    const last = c.messages[0]
    if (!last) return false
    if (last.role === 'user') return true
    if (last.role === 'assistant' && last.status === 'deferred') return true
    return false
  })
  return NextResponse.json({
    count: needing.length,
    // Small sample so the bell can surface who's waiting in a tooltip
    // without another round trip. Cap at 5 — enough to preview, not so
    // many that the payload balloons on busy days.
    preview: needing.slice(0, 5).map(c => ({
      phone: c.phone,
      displayName: c.displayName,
      lastAt: c.messages[0].createdAt,
      lastBody: c.messages[0].body.slice(0, 120),
      reason: c.messages[0].role === 'user' ? 'unanswered' : 'bot-deferred',
    })),
  })
}
