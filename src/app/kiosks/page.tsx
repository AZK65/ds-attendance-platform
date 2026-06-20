'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad'
import {
  Monitor, Loader2, RotateCcw, Lock, Unlock, MessageSquare,
  RefreshCw, Pencil, Trash2, PenTool, CheckCircle2,
} from 'lucide-react'

interface LiveData {
  name?: string; phone?: string; email?: string; dob?: string
  address?: string; city?: string; province?: string; postalCode?: string
  permitNumber?: string; permitExpiry?: string
  signedAtPlace?: string; firstCourseDate?: string
  truckPaymentMethod?: string; cardLocation?: string; repName?: string
  hasPermit?: boolean; hasId?: boolean; hasPhoto?: boolean
  hasStudentSig?: boolean; hasRepSig?: boolean
}

interface Kiosk {
  id: string
  kioskId: string
  name: string
  currentStep: string | null
  vehicleType: string | null
  liveData: LiveData | null
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

// Live form panel — shows what the customer is entering.
function LivePanel({ d }: { d: LiveData }) {
  const rows: [string, string | undefined][] = [
    ['Name', d.name],
    ['Phone', d.phone],
    ['Email', d.email],
    ['DOB', d.dob],
    ['Address', [d.address, d.city, d.postalCode].filter(Boolean).join(', ') || undefined],
    ['Permit #', d.permitNumber],
    ['Permit exp.', d.permitExpiry],
    ['1st course', d.firstCourseDate],
    ['Signed at', d.signedAtPlace],
    ['Payment', [d.truckPaymentMethod, d.cardLocation].filter(Boolean).join(' / ') || undefined],
    ['Rep name', d.repName],
  ].filter(([, v]) => v && v.trim() !== '') as [string, string][]

  const docs = [
    { label: 'Permit', ok: d.hasPermit },
    { label: 'ID', ok: d.hasId },
    { label: 'Photo', ok: d.hasPhoto },
    { label: 'Student sig', ok: d.hasStudentSig },
    { label: 'Rep sig', ok: d.hasRepSig },
  ].filter(x => x.ok)

  if (rows.length === 0 && docs.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Nothing entered yet.</p>
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <dl className="text-sm space-y-0.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="text-muted-foreground w-24 flex-shrink-0">{label}</dt>
              <dd className="font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {docs.map(x => (
            <Badge key={x.label} variant="secondary" className="bg-green-100 text-green-700 text-[10px]">
              <CheckCircle2 className="h-3 w-3 mr-1" />{x.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export default function KiosksPage() {
  const [kiosks, setKiosks] = useState<Kiosk[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [, forceTick] = useState(0)
  const seededRef = useRef(false)

  // Staff-signature dialog state
  const [signTarget, setSignTarget] = useState<Kiosk | null>(null)
  const [signerName, setSignerName] = useState('')
  const [sigData, setSigData] = useState<string | null>(null)
  const sigRef = useRef<SignaturePadHandle>(null)

  // Live state over SSE — no polling. The stream pushes the full list on
  // connect and whenever any kiosk changes (connects, navigates, etc.).
  useEffect(() => {
    const es = new EventSource('/api/kiosk/events')
    es.onopen = () => setLive(true)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'kiosks') {
          setKiosks(msg.kiosks)
          setLoading(false)
          seededRef.current = true
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => setLive(false) // EventSource auto-reconnects
    // Safety: if the stream is slow to send the first snapshot, fetch once.
    const t = setTimeout(async () => {
      if (seededRef.current) return
      try {
        const res = await fetch('/api/kiosk')
        if (res.ok) setKiosks((await res.json()).kiosks)
      } catch { /* ignore */ } finally { setLoading(false) }
    }, 1500)
    return () => { es.close(); clearTimeout(t) }
  }, [])

  // Re-render every 15s so the "seen X ago" labels stay fresh between events.
  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 15000)
    return () => clearInterval(id)
  }, [])

  const command = useMutation({
    mutationFn: async (vars: { id: string; type: string; message?: string; signature?: string; signerName?: string }) => {
      const res = await fetch(`/api/kiosk/${vars.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      })
      if (!res.ok) throw new Error('Command failed')
      return res.json()
    },
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
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/kiosk/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      return res.json()
    },
  })

  const submitSignature = () => {
    if (!signTarget || !sigData) return
    command.mutate(
      { id: signTarget.id, type: 'staff-signature', signature: sigData, signerName: signerName.trim() },
      {
        onSuccess: () => {
          setSignTarget(null)
          setSignerName('')
          setSigData(null)
        },
      }
    )
  }

  return (
    <main className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6" /> Kiosks
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live view and remote control of your registration kiosks.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 flex-shrink-0">
          <span className={`h-2 w-2 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
          {live ? 'Live' : 'Reconnecting…'}
        </Badge>
      </motion.div>

      {loading ? (
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
          {kiosks.map(k => {
            const needsRepSign = k.currentStep === 'rep-handoff' || k.currentStep === 'rep-sign'
            return (
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

                  {/* Staff signs from here — no need to hand the iPad over */}
                  {needsRepSign && (
                    <Button
                      className="w-full bg-amber-600 hover:bg-amber-700"
                      onClick={() => { setSignTarget(k); setSignerName(k.liveData?.repName || ''); setSigData(null) }}
                    >
                      <PenTool className="h-4 w-4 mr-2" /> Sign as staff
                    </Button>
                  )}

                  {/* What the customer is entering, live */}
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Live entry</p>
                    {k.liveData ? <LivePanel d={k.liveData} /> : <p className="text-xs text-muted-foreground italic">Nothing entered yet.</p>}
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
            )
          })}
        </div>
      )}

      {/* Staff signature — pushes to the kiosk and advances it to payment */}
      <Dialog open={!!signTarget} onOpenChange={(o) => { if (!o) setSignTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Staff signature</DialogTitle>
            <DialogDescription>
              Sign here for {signTarget?.liveData?.name || 'this student'}. It's sent to the
              kiosk and the flow continues to payment — no need to hand over the iPad.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Printed name</Label>
              <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="School representative name" />
            </div>
            <div className="space-y-1.5">
              <Label>Signature</Label>
              <SignaturePad ref={sigRef} height={180} placeholder="Sign here" strokeWidth={2.5} onChange={setSigData} />
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { sigRef.current?.clear(); setSigData(null) }}>
                Clear
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignTarget(null)}>Cancel</Button>
            <Button
              onClick={submitSignature}
              disabled={!sigData || signerName.trim().length < 2 || command.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {command.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
