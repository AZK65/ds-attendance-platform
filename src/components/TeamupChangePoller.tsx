'use client'

import { useEffect } from 'react'

const POLL_INTERVAL = 2 * 60 * 1000 // 2 minutes

export function TeamupChangePoller() {
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null
    let isPolling = false
    let consecutiveErrors = 0

    const pollForChanges = async () => {
      if (isPolling) return
      isPolling = true

      try {
        const res = await fetch('/api/scheduling/poll-changes', {
          method: 'POST',
        })

        if (res.ok) {
          const data = await res.json()
          consecutiveErrors = 0
          if (data.changes?.length > 0) {
            console.log(`[TeamupPoller] Detected ${data.changes.length} change(s):`, data.changes)
          }
        } else {
          consecutiveErrors++
          if (consecutiveErrors <= 3) {
            const text = await res.text().catch(() => 'unknown')
            console.error(`[TeamupPoller] Poll returned ${res.status}: ${text}`)
          }
        }
      } catch (error) {
        consecutiveErrors++
        if (consecutiveErrors <= 3) {
          console.error('[TeamupPoller] Error polling:', error)
        }
      } finally {
        isPolling = false
      }
    }

    // Initial poll on mount
    pollForChanges()

    // Then poll every 2 minutes
    pollInterval = setInterval(pollForChanges, POLL_INTERVAL)

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  }, [])

  return null
}
