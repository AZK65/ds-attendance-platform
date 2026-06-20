import { NextRequest } from 'next/server'
import { addDashboardSender, removeDashboardSender, buildKioskList } from '@/lib/kiosk-hub'

export const dynamic = 'force-dynamic'

// GET /api/kiosk/events  (authed — cookie sent automatically by EventSource)
// Server-Sent Events feed of live kiosk state for the dashboard. Pushes the
// full kiosk list on connect and whenever any kiosk changes.
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* closed */ }
      }

      addDashboardSender(send)
      controller.enqueue(encoder.encode(`: connected\n\n`))

      // Initial snapshot.
      try { send({ type: 'kiosks', kiosks: await buildKioskList() }) } catch { /* ignore */ }

      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)) } catch { /* closed */ }
      }, 20_000)

      const close = () => {
        clearInterval(ping)
        removeDashboardSender(send)
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
      'X-Accel-Buffering': 'no',
    },
  })
}
