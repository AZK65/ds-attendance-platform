// Server-side instrumentation — runs once when the Next.js server starts.
// Starts background intervals for processing scheduled messages and polling Teamup changes,
// so these run reliably regardless of whether any browser has the app open.

export async function register() {
  // Only run on the server (Node.js runtime), not during build or in edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const BASE_URL = `http://localhost:${process.env.PORT || 3000}`

    let isProcessing = false
    let isPolling = false

    // Process scheduled messages every 30 seconds
    async function processScheduledMessages() {
      if (isProcessing) return
      isProcessing = true
      try {
        const res = await fetch(`${BASE_URL}/api/scheduled-messages/process`, {
          method: 'POST',
          headers: { 'x-internal': '1' },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.processed > 0) {
            console.log(`[ServerProcessor] Processed ${data.processed} scheduled messages`)
          }
        }
      } catch {
        // Server might not be ready yet on first few attempts — silently retry
      } finally {
        isProcessing = false
      }
    }

    // Poll Teamup for changes every 2 minutes
    async function pollTeamupChanges() {
      if (isPolling) return
      isPolling = true
      try {
        const res = await fetch(`${BASE_URL}/api/scheduling/poll-changes`, {
          method: 'POST',
          headers: { 'x-internal': '1' },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.changes?.length > 0) {
            console.log(`[ServerPoller] Detected ${data.changes.length} Teamup change(s)`)
          }
        }
      } catch {
        // Silently retry
      } finally {
        isPolling = false
      }
    }

    // Wait for the server to be ready before starting intervals
    const STARTUP_DELAY = 10_000 // 10 seconds
    const MESSAGE_INTERVAL = 30_000 // 30 seconds
    const POLL_INTERVAL = 2 * 60_000 // 2 minutes

    setTimeout(async () => {
      // Auto-connect WhatsApp on startup
      console.log('[AutoConnect] Triggering WhatsApp connection...')
      try {
        await fetch(`${BASE_URL}/api/whatsapp/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal': '1' },
          body: JSON.stringify({}),
        })
        console.log('[AutoConnect] WhatsApp connect triggered')
      } catch {
        console.log('[AutoConnect] WhatsApp connect failed — will retry when first request comes in')
      }

      console.log('[ServerProcessor] Starting server-side scheduled message processor (every 30s)')
      console.log('[ServerPoller] Starting server-side Teamup change poller (every 2m)')

      processScheduledMessages()
      setInterval(processScheduledMessages, MESSAGE_INTERVAL)

      // Stagger the poller start by 15 seconds so they don't overlap on startup
      setTimeout(() => {
        pollTeamupChanges()
        setInterval(pollTeamupChanges, POLL_INTERVAL)
      }, 15_000)
    }, STARTUP_DELAY)
  }
}
