'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Monitor, Loader2, RotateCcw, Lock, Unlock, MessageSquare,
  RefreshCw, Pencil, Trash2,
} from 'lucide-react'

interface Kiosk {
  id: string
  kioskId: string
  name: string
  currentStep: string | null
  vehicleType: string | null
  lastSeenAt: string
  online: boolean
  hasPendingCommand: boolean
}

const STEP_LABELS: Record<string, string> = {
  select: 'Start screen',
  'truck-contact': 'Truck contact',
  personal: 'Personal info',
  address: 'Address',
  documents: 'Documents',
  agreements: 'Agreement / sign',
  'rep-handoff': 'Hand to school',
  'rep-sign': 'School sign',
  'payment-method': 'Payment method',
  payment: 'Payment',
  submitting: 'Submitting…',
  done: 'Done / thank-you',
}

function relTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function KiosksPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<{ kiosks: Kiosk[] }>({
    queryKey: ['kiosks'],
    queryFn: async () => {
      const res = await fetch('/api/kiosk')
      if (!res.ok) throw new Error('Failed to load kiosks')
      return res.json()
    },
    refetchInterval: 3000,
  })
  const kiosks = data?.kiosks || []

  const command = useMutation({
    mutationFn: async ({ id, type, message }: { id: string; type: string; message?: string }) => {
      const res = await fetch(`/api/kiosk/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message }),
      })
      if (!res.ok) throw new Error('Command failed')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kiosks'] }),
  })

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/kiosk/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Rename failed')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kiosks'] }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/kiosk/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kiosks'] }),
  })

  return (
    <main className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Monitor className="h-6 w-6" /> Kiosks
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live view and remote control of your registration kiosks.
        </p>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-muted-foreground">Loading kiosks…</span>
        </div>
      ) : kiosks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Monitor className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No kiosks have checked in yet.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Open <code className="px-1 rounded bg-muted">/register/kiosk</code> on an iPad and it will
              appear here within a few seconds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kiosks.map(k => (
            <Card key={k.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${k.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="truncate">{k.name}</span>
                  </CardTitle>
                  <Badge variant={k.online ? 'secondary' : 'outline'} className={k.online ? 'bg-green-100 text-green-700' : ''}>
                    {k.online ? 'Online' : 'Offline'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current screen</p>
                  <p className="text-lg font-semibold">
                    {k.currentStep ? (STEP_LABELS[k.currentStep] || k.currentStep) : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {k.vehicleType ? `${k.vehicleType} · ` : ''}seen {relTime(k.lastSeenAt)}
                    {k.hasPendingCommand && ' · command pending…'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => command.mutate({ id: k.id, type: 'reset' })}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => command.mutate({ id: k.id, type: 'lock' })}>
                    <Lock className="h-3.5 w-3.5 mr-1.5" /> Lock
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => command.mutate({ id: k.id, type: 'unlock' })}>
                    <Unlock className="h-3.5 w-3.5 mr-1.5" /> Unlock
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => {
                      const message = window.prompt('Message to show on the kiosk:')
                      if (message && message.trim()) command.mutate({ id: k.id, type: 'message', message: message.trim() })
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Message
                  </Button>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t">
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground"
                    onClick={() => command.mutate({ id: k.id, type: 'reload' })} title="Reload the page">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground"
                    onClick={() => {
                      const name = window.prompt('Rename kiosk:', k.name)
                      if (name && name.trim()) rename.mutate({ id: k.id, name: name.trim() })
                    }} title="Rename">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive ml-auto"
                    onClick={() => {
                      if (confirm(`Remove "${k.name}"? It will reappear if the iPad checks in again.`)) remove.mutate(k.id)
                    }} title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
