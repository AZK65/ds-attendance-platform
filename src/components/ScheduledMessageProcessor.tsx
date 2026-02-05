'use client'

import { useEffect } from 'react'

export function ScheduledMessageProcessor() {
  useEffect(() => {
    let processingInterval: NodeJS.Timeout | null = null
    let isProcessing = false

    const processScheduledMessages = async () => {
      if (isProcessing) return
      isProcessing = true

      try {
        const res = await fetch('/api/scheduled-messages/process', {
          method: 'POST'
        })

        if (res.ok) {
          const data = await res.json()
          if (data.processed > 0) {
            console.log(`[ScheduledProcessor] Processed ${data.processed} scheduled messages`)
          }
        }
      } catch {
        // Silently ignore errors - we'll try again on next interval
      } finally {
        isProcessing = false
      }
    }

    // Process immediately on start
    processScheduledMessages()

    // Then check every 30 seconds
    processingInterval = setInterval(processScheduledMessages, 30000)

    return () => {
      if (processingInterval) {
        clearInterval(processingInterval)
      }
    }
  }, [])

  return null
}
