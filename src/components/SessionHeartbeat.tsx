'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Pings /api/auth/heartbeat on mount and every minute while an admin page is
// open. This keeps the device's "last active" fresh for the Settings →
// Devices list, and enforces remote logout: if this device was logged out
// from another device, the heartbeat returns valid:false and we bounce to
// /login. Fail-open — a network error never logs the user out.
export function SessionHeartbeat() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    const beat = async () => {
      try {
        const res = await fetch('/api/auth/heartbeat', { method: 'POST' })
        // API routes return 401 instead of redirecting. Previously this was
        // ignored, leaving an expired admin page open while individual navbar
        // requests failed and surfaced misleading "connection interrupted"
        // banners. Send the user through the normal login flow immediately.
        if (res.status === 401) {
          if (!cancelled) router.replace('/login')
          return
        }
        if (!res.ok) return // Transient server/network issue — fail open.
        const data = await res.json().catch(() => null)
        if (!cancelled && data && data.valid === false) {
          router.replace('/login')
        }
      } catch {
        // Offline / transient — do nothing (fail open)
      }
    }

    beat()
    const interval = setInterval(beat, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [router])

  return null
}
