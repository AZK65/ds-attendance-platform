'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CheckCircle2, Loader2, RotateCcw, Download, X, Pencil } from 'lucide-react'

interface TeamupEvent {
  id: string
  title: string
  start_dt: string
  end_dt: string
  notes?: string
}

// Mirror of /scheduling parseModuleFromTitle but stripped to what Sign-In needs.
function parseTitle(fullTitle: string) {
  const parts = (fullTitle || '').split(' - ')
  const first = parts[0]?.trim() || ''
  let moduleNumber: number | null = null
  let sortieNumber: number | null = null
  let label = first
  const mMatch = first.match(/^M(\d+)$/i)
  const sMatch = first.match(/^Session (\d+)$/i)
  const moduleMatch = first.match(/^Module (\d+)$/i)
  if (sMatch) {
    sortieNumber = parseInt(sMatch[1])
    label = `Session ${sortieNumber} (In-Car)`
  } else if (mMatch) {
    moduleNumber = parseInt(mMatch[1])
    label = `Module ${moduleNumber}`
  } else if (moduleMatch) {
    moduleNumber = parseInt(moduleMatch[1])
    label = `Module ${moduleNumber}`
  }
  const studentName = (parts[1] || '').trim()
  return { moduleNumber, sortieNumber, label, studentName }
}

function parsePhone(notes?: string): string | null {
  if (!notes) return null
  const m = notes.match(/Phone:\s*([+\d\s()\-.]+)/i)
  return m ? m[1].replace(/\D/g, '') : null
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

interface SavedSignature {
  id: string
  eventId: string
  studentPhone: string
  signedAt: string
}

export default function SignInMode({ onExit }: { onExit: () => void }) {
  // /api/scheduling/events returns the events array directly (not wrapped).
  const { data: eventsData, isLoading: eventsLoading, refetch } = useQuery<TeamupEvent[]>({
    queryKey: ['signin-events-today'],
    queryFn: async () => {
      const today = new Date()
      const start = today.toISOString().split('T')[0]
      const endDate = new Date(today)
      endDate.setDate(endDate.getDate() + 1)
      const end = endDate.toISOString().split('T')[0]
      const res = await fetch(`/api/scheduling/events?startDate=${start}&endDate=${end}`)
      if (!res.ok) throw new Error('Failed to fetch events')
      return res.json()
    },
    refetchInterval: 30_000,
  })

  // Set of eventIds that already have a signature for today, refreshed every 30s.
  const { data: signedData, refetch: refetchSigs } = useQuery<{ signatures: SavedSignature[] }>({
    queryKey: ['signin-signatures-today'],
    queryFn: async () => {
      const since = new Date()
      since.setHours(0, 0, 0, 0)
      const res = await fetch(`/api/scheduling/signature?since=${encodeURIComponent(since.toISOString())}`)
      if (res.ok) return res.json()
      return { signatures: [] }
    },
    refetchInterval: 30_000,
  })

  const signedSet = useMemo(() => {
    const set = new Set<string>()
    for (const s of (signedData?.signatures || [])) set.add(s.eventId)
    return set
  }, [signedData])

  // Sort events by start time (ascending), only show in-car-style sessions.
  const todayEvents = useMemo(() => {
    const all = eventsData || []
    return all
      .filter(e => {
        const d = new Date(e.start_dt)
        const today = new Date()
        return d.toDateString() === today.toDateString()
      })
      .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())
  }, [eventsData])

  const [signing, setSigning] = useState<TeamupEvent | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sign-In Mode</h1>
          <p className="text-sm text-muted-foreground">
            Tap your name when you arrive. Today only — {todayEvents.length} session{todayEvents.length === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchSigs() }}>
            <RotateCcw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" onClick={onExit}>
            <X className="h-4 w-4 mr-1" /> Exit
          </Button>
        </div>
      </div>

      {eventsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : todayEvents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-base">No classes today.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {todayEvents.map(event => {
            const p = parseTitle(event.title)
            const phone = parsePhone(event.notes)
            const signed = signedSet.has(event.id)
            return (
              <Card
                key={event.id}
                className={`transition-colors ${signed ? 'border-green-300 bg-green-50/40' : 'cursor-pointer hover:border-primary'}`}
                onClick={() => {
                  if (signed) return
                  setSigning(event)
                }}
              >
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="text-2xl font-bold tabular-nums">{fmtTime(event.start_dt)}</p>
                      <div className="min-w-0">
                        <p className="font-semibold text-lg truncate">{p.studentName || '(no student name)'}</p>
                        <p className="text-sm text-muted-foreground truncate">{p.label}</p>
                      </div>
                    </div>
                  </div>
                  {signed ? (
                    <Badge className="bg-green-100 text-green-800 gap-1 text-sm py-1.5 px-3">
                      <CheckCircle2 className="h-4 w-4" /> Signed
                    </Badge>
                  ) : (
                    <Button size="lg" disabled={!phone}>
                      <Pencil className="h-4 w-4 mr-2" />
                      {phone ? 'Sign' : 'No phone'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {signing && (
        <SignaturePad
          event={signing}
          onCancel={() => setSigning(null)}
          onSaved={() => {
            setSigning(null)
            refetchSigs()
          }}
        />
      )}
    </div>
  )
}

function SignaturePad({
  event,
  onCancel,
  onSaved,
}: {
  event: TeamupEvent
  onCancel: () => void
  onSaved: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasInk, setHasInk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drawingRef = useRef(false)

  const parsed = parseTitle(event.title)
  const phone = parsePhone(event.notes)

  // Set canvas size to its CSS-rendered dimensions × DPR for crisp lines.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * dpr
    c.height = rect.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const start = (x: number, y: number) => {
    drawingRef.current = true
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (x: number, y: number) => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasInk(true)
  }
  const end = () => { drawingRef.current = false }

  const localXY = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top] as const
  }

  const clear = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.restore()
    setHasInk(false)
  }

  const save = async () => {
    if (!hasInk) {
      setError('Please sign in the box before saving.')
      return
    }
    if (!phone) {
      setError('No phone number found in event notes — cannot save.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const dataUrl = canvasRef.current!.toDataURL('image/png')
      const res = await fetch('/api/scheduling/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          studentPhone: phone,
          studentName: parsed.studentName || '(unknown)',
          signatureDataUrl: dataUrl,
          sessionLabel: parsed.label,
          moduleNumber: parsed.moduleNumber,
          sortieNumber: parsed.sortieNumber,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Save failed (${res.status})`)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sign In — {parsed.studentName || 'Student'}</DialogTitle>
          <DialogDescription>
            {parsed.label} · {fmtTime(event.start_dt)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="border-2 border-dashed rounded-lg overflow-hidden bg-muted/20">
            <canvas
              ref={canvasRef}
              className="w-full h-64 touch-none cursor-crosshair bg-white"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const [x, y] = localXY(e); start(x, y) }}
              onPointerMove={(e) => { const [x, y] = localXY(e); move(x, y) }}
              onPointerUp={end}
              onPointerLeave={end}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={clear} disabled={!hasInk || saving}>
              <RotateCcw className="h-4 w-4 mr-1" /> Clear
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={!hasInk || saving} className="min-w-[100px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            </div>
          </div>
          {phone && (
            <a
              href={`/api/scheduling/signature/pdf?phone=${encodeURIComponent(phone)}`}
              target="_blank"
              rel="noopener"
              className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
            >
              <Download className="h-3 w-3" /> Download this student&apos;s booklet PDF
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
