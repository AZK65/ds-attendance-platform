'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { Loader2 } from 'lucide-react'

export function ConnectionStatus() {
  const [showError, setShowError] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status')
      return res.json()
    },
    refetchInterval: 3000
  })

  // Close on outside click
  useEffect(() => {
    if (!showError) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowError(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showError])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-8 w-8">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isConnected = data?.isConnected
  const isConnecting = data?.isConnecting

  if (isConnected) {
    return (
      <div className="flex items-center justify-center h-8 w-8" title="WhatsApp Connected">
        <div className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
      </div>
    )
  }

  if (isConnecting) {
    return (
      <div className="flex items-center justify-center h-8 w-8" title="Connecting...">
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-500 animate-pulse" />
      </div>
    )
  }

  // Disconnected — clickable to show error details
  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setShowError(!showError)}
        className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors"
        title="WhatsApp Disconnected — click for details"
      >
        <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
      </button>

      <AnimatePresence>
        {showError && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 w-64 bg-background border rounded-lg shadow-xl z-50 p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-sm font-medium">WhatsApp Disconnected</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              The WhatsApp connection is not active. Messages cannot be sent until reconnected.
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Possible causes:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Phone lost internet connection</li>
                <li>WhatsApp was logged out</li>
                <li>Session expired</li>
                <li>Server was restarted</li>
              </ul>
            </div>
            <div className="mt-2 pt-2 border-t">
              <a
                href="/connect"
                className="text-xs text-primary hover:underline font-medium"
              >
                Go to Connect page to re-scan QR →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
