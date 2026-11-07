export interface AttendanceSource {
  onmessage: ((event: { data: string }) => void) | null
  onerror: (() => void) | null
  close(): void
}

/** One stream at a time. Retain the last roster while reconnecting. */
export function createAttendanceConnection(options: {
  createSource: () => AttendanceSource
  onState: (value: Record<string, unknown>) => void
  onConnection: (connected: boolean) => void
}) {
  let source: AttendanceSource | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let attempts = 0
  let lastStateAt = Date.now()

  function disconnect() {
    if (source) { source.onmessage = null; source.onerror = null; source.close(); source = null }
    options.onConnection(false)
  }
  function reconnect() {
    if (stopped) return
    clearTimeout(retry); retry = undefined
    disconnect()
    lastStateAt = Date.now()
    try {
      const next = options.createSource()
      source = next
      next.onmessage = event => {
        if (stopped || source !== next) return
        try {
          const data = JSON.parse(event.data)
          if (data?.type !== 'state' || !Array.isArray(data.matched) || !Array.isArray(data.absent)) return
          lastStateAt = Date.now(); attempts = 0
          options.onState(data)
          options.onConnection(true)
        } catch { /* Malformed frames never replace the last good roster. */ }
      }
      next.onerror = () => { if (source === next) scheduleRetry() }
    } catch { scheduleRetry() }
  }
  function scheduleRetry() {
    if (stopped || retry) return
    disconnect()
    const delay = Math.min(1000 * 2 ** attempts++, 30_000)
    retry = setTimeout(reconnect, delay)
  }
  const watchdog = setInterval(() => {
    if (!retry && Date.now() - lastStateAt > 75_000) scheduleRetry()
  }, 10_000)
  reconnect()
  return {
    reconnect,
    stop() { stopped = true; clearTimeout(retry); clearInterval(watchdog); disconnect() },
  }
}
