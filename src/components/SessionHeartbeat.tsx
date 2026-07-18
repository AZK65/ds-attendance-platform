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
        if (!res.ok) return // 401 etc. — leave it to normal navigation/middleware
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
