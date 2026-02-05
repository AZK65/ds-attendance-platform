// Scheduled message processor
// This runs in the background to process pending scheduled messages

let processingInterval: NodeJS.Timeout | null = null
let isProcessing = false

export function startScheduledMessageProcessor() {
  if (processingInterval) {
    console.log('[ScheduledProcessor] Already running')
    return
  }

  console.log('[ScheduledProcessor] Starting processor (every 30 seconds)')

  // Process immediately on start
  processScheduledMessages()

  // Then check every 30 seconds
  processingInterval = setInterval(() => {
    processScheduledMessages()
  }, 30000)
}

export function stopScheduledMessageProcessor() {
  if (processingInterval) {
    clearInterval(processingInterval)
    processingInterval = null
    console.log('[ScheduledProcessor] Stopped')
  }
}

async function processScheduledMessages() {
  if (isProcessing) {
    return
  }

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
  } catch (error) {
    // Silently ignore errors - we'll try again on next interval
    console.error('[ScheduledProcessor] Error:', error)
  } finally {
    isProcessing = false
  }
}
