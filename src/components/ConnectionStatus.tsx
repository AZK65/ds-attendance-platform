'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { Loader2, RefreshCw, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'

export function ConnectionStatus() {
  const [showPanel, setShowPanel] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status')
      return res.json()
    },
    refetchInterval: 3000
  })

  const { data: qrData } = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/qr')
      return res.json()
    },
    refetchInterval: 2000,
    enabled: showPanel && !data?.isConnected
  })

  const connectMutation = useMutation({
    mutationFn: async (force?: boolean) => {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: force || false })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Connection failed')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-qr'] })
    }
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Disconnect failed')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
    }
  })

  // Close on outside click
  useEffect(() => {
    if (!showPanel) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPanel])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-8 w-8">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isConnected = data?.isConnected
  const isConnecting = data?.isConnecting

  const dotColor = isConnected
    ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]'
    : isConnecting
    ? 'bg-yellow-500 animate-pulse'
    : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'

  const dotTitle = isConnected
    ? 'WhatsApp Connected'
    : isConnecting
    ? 'Connecting...'
    : 'WhatsApp Disconnected'

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors"
        title={dotTitle}
      >
        <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
      </button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 w-72 bg-background border rounded-lg shadow-xl z-50 p-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${dotColor}`} />
                <span className="text-sm font-medium">
                  {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
                </span>
              </div>
              <button
                onClick={() => setShowPanel(false)}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Connected State */}
            {isConnected && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                  <Check className="h-4 w-4 flex-shrink-0" />
                  WhatsApp is connected and ready.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Disconnecting...</>
                  ) : (
                    'Disconnect'
                  )}
                </Button>
              </div>
            )}

            {/* Disconnected — show connect button or QR */}
            {!isConnected && (
              <div className="space-y-3">
                {connectMutation.isError && (
                  <div className="p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700 text-center">
                    {connectMutation.error?.message || 'Connection failed'}
                  </div>
                )}

                {/* No QR yet, not connecting — show Start button */}
                {!qrData?.qrImage && !isConnecting && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => connectMutation.mutate(false)}
                    disabled={connectMutation.isPending}
                  >
                    {connectMutation.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting...</>
                    ) : (
                      connectMutation.isError ? 'Retry Connection' : 'Start Connection'
                    )}
                  </Button>
                )}

                {/* Connecting but no QR yet */}
                {isConnecting && !qrData?.qrImage && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Generating QR code...</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => connectMutation.mutate(true)}
                      disabled={connectMutation.isPending}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Force Reconnect
                    </Button>
                  </div>
                )}

                {/* QR Code */}
                {qrData?.qrImage && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-white p-2 rounded-lg">
                      <Image
                        src={qrData.qrImage}
                        alt="WhatsApp QR Code"
                        width={220}
                        height={220}
                        className="rounded"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Open WhatsApp → Settings → Linked Devices → Link a Device
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['whatsapp-qr'] })}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Refresh QR
                    </Button>
                  </div>
                )}

                {/* Help text when disconnected and no QR shown */}
                {!isConnecting && !qrData?.qrImage && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Possible causes:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Phone lost internet</li>
                      <li>WhatsApp was logged out</li>
                      <li>Session expired</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
