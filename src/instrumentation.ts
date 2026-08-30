// Server-side instrumentation — runs once when the Next.js server starts.
// Starts background intervals for processing scheduled messages and polling Teamup changes,
// so these run reliably regardless of whether any browser has the app open.

export async function register() {
  // Only run on the server (Node.js runtime), not during build or in edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const BASE_URL = `http://localhost:${process.env.PORT || 3000}`

    let isProcessing = false
    let isPolling = false
    let isReconcilingZoom = false

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

    // Poll Teamup frequently so direct calendar cancellations and reschedules
    // reach WhatsApp while the admin is still working in Teamup.
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

    // If the server missed meeting.ended during a restart, detect that the
    // tracked meeting has closed and rebuild final attendance from Zoom's
    // completed-meeting report.
    async function reconcileZoomAttendance() {
      if (isReconcilingZoom) return
      isReconcilingZoom = true
      try {
        const res = await fetch(`${BASE_URL}/api/zoom/reconcile-live`, {
          method: 'POST',
          headers: { 'x-internal': '1' },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.reconciled) {
            console.log(`[ZoomRecovery] Reconciled ${data.matchedCount} attendee(s)`)
          }
        }
      } catch {
        // Report may not be ready yet; the next interval retries.
      } finally {
        isReconcilingZoom = false
      }
    }

    // Wait for the server to be ready before starting intervals
    const STARTUP_DELAY = 10_000 // 10 seconds
    const MESSAGE_INTERVAL = 30_000 // 30 seconds
    const POLL_INTERVAL = 15_000 // 15 seconds
    const ZOOM_RECONCILE_INTERVAL = 60_000 // 1 minute

    setTimeout(async () => {
      // Rehydrate live Zoom store from the persisted snapshot so a server
      // restart mid-class doesn't blank the attendance UI.
      try {
        const { hydrateFromDb } = await import('@/lib/zoom/live-store')
        await hydrateFromDb()
      } catch (err) {
        console.error('[LiveStore] Hydrate from DB failed:', err)
      }

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
      console.log('[ServerPoller] Starting server-side Teamup change poller (every 15s)')

      processScheduledMessages()
      setInterval(processScheduledMessages, MESSAGE_INTERVAL)
      reconcileZoomAttendance()
      setInterval(reconcileZoomAttendance, ZOOM_RECONCILE_INTERVAL)

      // Stagger the poller start by 15 seconds so they don't overlap on startup
      setTimeout(() => {
        pollTeamupChanges()
        setInterval(pollTeamupChanges, POLL_INTERVAL)
      }, 15_000)
    }, STARTUP_DELAY)
  }
}
