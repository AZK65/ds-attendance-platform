import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { addKioskSender, removeKioskSender, broadcastKiosks } from '@/lib/kiosk-hub'

export const dynamic = 'force-dynamic'

// GET /api/kiosk/stream?kioskId=...  (public — the kiosk page has no auth)
// Server-Sent Events: the kiosk holds this open and receives commands the
// instant they're queued. While the stream is open the kiosk counts as online.
export async function GET(request: NextRequest) {
  const kioskId = request.nextUrl.searchParams.get('kioskId')?.trim()
  if (!kioskId) return new Response('kioskId required', { status: 400 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* closed */ }
      }

      addKioskSender(kioskId, send)
      controller.enqueue(encoder.encode(`: connected\n\n`))

      // Mark online + flush any command queued while it was offline.
      try {
        const k = await prisma.kiosk.findUnique({ where: { kioskId } })
        if (k) {
          await prisma.kiosk.update({ where: { kioskId }, data: { lastSeenAt: new Date() } })
          if (k.pendingCommand) {
            try { send({ type: 'command', command: JSON.parse(k.pendingCommand) }) } catch { /* bad json */ }
            await prisma.kiosk.update({ where: { kioskId }, data: { pendingCommand: null } })
          }
        }
      } catch { /* DB hiccup — stream still serves live commands */ }
      broadcastKiosks().catch(() => {})

      // Keepalive comment so proxies don't close the idle connection.
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)) } catch { /* closed */ }
      }, 20_000)

      const close = () => {
        clearInterval(ping)
        removeKioskSender(kioskId, send)
        broadcastKiosks().catch(() => {})
        try { controller.close() } catch { /* already closed */ }
      }
      request.signal.addEventListener('abort', close)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering for SSE
    },
  })
}
