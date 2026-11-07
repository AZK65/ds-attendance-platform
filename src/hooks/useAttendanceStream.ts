'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createAttendanceConnection, type AttendanceSource } from '@/lib/attendance-connection'

export function useAttendanceStream<T>(groupId: string, onState: (state: T) => void, onConnection: (connected: boolean) => void) {
  const callbacks = useRef({ onState, onConnection })
  useEffect(() => { callbacks.current = { onState, onConnection } }, [onState, onConnection])
  const connection = useRef<ReturnType<typeof createAttendanceConnection> | null>(null)
  useEffect(() => {
    const active = createAttendanceConnection({
      createSource: () => new EventSource(`/api/zoom/live-stream?groupId=${encodeURIComponent(groupId)}`) as unknown as AttendanceSource,
      onState: value => callbacks.current.onState(value as T),
      onConnection: value => callbacks.current.onConnection(value),
    })
    connection.current = active
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) active.reconnect() }
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
      active.stop(); connection.current = null
    }
  }, [groupId])
  return useCallback(() => connection.current?.reconnect(), [])
}
