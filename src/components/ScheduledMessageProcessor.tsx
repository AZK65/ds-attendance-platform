'use client'

import { useEffect } from 'react'

export function ScheduledMessageProcessor() {
  useEffect(() => {
    let processingInterval: NodeJS.Timeout | null = null
    let isProcessing = false
    let consecutiveErrors = 0

    const processScheduledMessages = async () => {
      if (isProcessing) return
      isProcessing = true

      try {
        const res = await fetch('/api/scheduled-messages/process', {
          method: 'POST'
        })

        if (res.ok) {
          const data = await res.json()
          consecutiveErrors = 0
          if (data.processed > 0) {
            console.log(`[ScheduledProcessor] Processed ${data.processed} scheduled messages`, data.results)
          }
          if (data.skipped) {
            // WhatsApp not connected — don't spam logs, log every 5th skip
            if (consecutiveErrors % 5 === 0) {
              console.log(`[ScheduledProcessor] Skipped: ${data.reason}`)
            }
          }
        } else {
          consecutiveErrors++
          const text = await res.text().catch(() => 'unknown')
          console.error(`[ScheduledProcessor] Process endpoint returned ${res.status}: ${text}`)
        }
      } catch (error) {
        consecutiveErrors++
        if (consecutiveErrors <= 3) {
          console.error('[ScheduledProcessor] Error calling process endpoint:', error)
        }
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
