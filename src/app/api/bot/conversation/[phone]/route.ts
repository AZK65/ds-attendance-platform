import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/bot/conversation/[phone] — full transcript of a single WA thread.
// Admin-only (middleware).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const { phone: rawPhone } = await params
  const phone = decodeURIComponent(rawPhone).replace(/\D/g, '')
  const conv = await prisma.botConversation.findUnique({
    where: { phone },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(conv)
}
