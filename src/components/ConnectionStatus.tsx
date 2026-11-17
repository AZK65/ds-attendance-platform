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
  const [now, setNow] = useState(() => Date.now())
  const [refreshRequest, setRefreshRequest] = useState<{ image: string | null; startedAt: number } | null>(null)
  useEffect(() => {
    if (!showPanel) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [showPanel])

  const { data, isLoading, error: statusError } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status', { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 401 ? 'Your staff login expired. Sign in again to connect WhatsApp.' : 'Could not check the WhatsApp connection.')
      return res.json()
    },
    refetchInterval: 3000
  })

  const { data: qrData, error: qrError, dataUpdatedAt } = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/whatsapp/qr', { cache: 'no-store', signal })
      if (!res.ok) throw new Error(res.status === 401 ? 'Sign in again to view a fresh QR code.' : 'Could not load the QR code. Try again.')
      return res.json()
    },
    refetchInterval: 2000,
    enabled: showPanel && !data?.isConnected
  })

  const connectMutation = useMutation({
    mutationFn: async (action: 'connect' | 'refresh' | 'reconnect') => {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Connection failed')
      return result
    },
    onMutate: async (action) => {
      const previous = queryClient.getQueryData<{ qrImage?: string }>(['whatsapp-qr'])
      setRefreshRequest(action === 'refresh' || action === 'reconnect' ? { image: previous?.qrImage || null, startedAt: Date.now() } : null)
      // Cancel in-flight polling so an old response cannot put the old code back.
      await queryClient.cancelQueries({ queryKey: ['whatsapp-qr'] })
      queryClient.setQueryData(['whatsapp-qr'], { qrImage: null })
    },
    onSettled: () => {
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
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPanel(false) }
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escape)
    }
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
  const awaitingNewQr = !!refreshRequest && !isConnected && !data?.authenticatedAt &&
    (!qrData?.qrImage || qrData.qrImage === refreshRequest.image)
  const refreshTimedOut = awaitingNewQr && now - refreshRequest.startedAt >= 45000
  const error = statusError?.message || qrError?.message || connectMutation.error?.message ||
    disconnectMutation.error?.message || data?.lastError ||
    (refreshTimedOut ? 'A new QR code did not arrive. Try Refresh QR again. Your saved session has not been deleted.' : null)
  const refreshing = awaitingNewQr && !refreshTimedOut && !error
  const busy = connectMutation.isPending || refreshing
  const qrFresh = !!qrData?.qrImage && !error && !awaitingNewQr && !data?.authenticatedAt &&
    dataUpdatedAt > now - 15000 && qrData.generatedAt > now - 65000

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
        aria-label={dotTitle}
        aria-expanded={showPanel}
      >
        <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
      </button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            role="dialog"
            aria-label="WhatsApp connection"
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="platform-floating-panel absolute right-0 top-10 w-72 bg-card border rounded-lg shadow-xl z-50 p-4"
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
                aria-label="Close connection details"
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {error && <div role="alert" className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

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
                {/* No QR yet, not connecting — show Start button */}
                {!qrFresh && !isConnecting && !busy && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => connectMutation.mutate('connect')}
                    disabled={busy}
                  >
                    {connectMutation.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting...</>
                    ) : (
                      connectMutation.isError ? 'Retry Connection' : 'Start Connection'
                    )}
                  </Button>
                )}

                {/* Connecting but no QR yet */}
                {(isConnecting || busy) && !qrFresh && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p role="status" className="text-xs text-muted-foreground">{data?.authenticatedAt ? 'Phone linked. Syncing WhatsApp…' : 'Generating a new QR code…'}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => connectMutation.mutate('reconnect')}
                      disabled={busy || !!data?.authenticatedAt}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Reconnect safely
                    </Button>
                  </div>
                )}

                {/* QR Code */}
                {qrFresh && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-white p-2 rounded-lg">
                      <Image
                        src={qrData.qrImage}
                        alt="WhatsApp QR Code"
                        width={220}
                        height={220}
                        unoptimized
                        className="rounded"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Open WhatsApp → Settings → Linked Devices → Link a Device
                    </p>
                  </div>
                )}

                {!data?.authenticatedAt && (qrFresh || isConnecting || !!refreshRequest) && (
                  <Button variant="outline" size="sm" className="w-full" disabled={busy} onClick={() => connectMutation.mutate('refresh')}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5${busy ? ' animate-spin' : ''}`} />
                    {busy ? 'Refreshing QR…' : 'Refresh QR'}
                  </Button>
                )}

                {/* Help text when disconnected and no QR shown */}
                {!isConnecting && !qrFresh && !busy && (
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
