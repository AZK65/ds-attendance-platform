'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CheckCircle2, Loader2, RotateCcw, Download, X, Pencil, Users, ArrowLeft, ChevronRight, Search } from 'lucide-react'

interface TeamupEvent {
  id: string
  title: string
  start_dt: string
  end_dt: string
  notes?: string
}

interface GroupSummary {
  id: string
  name: string
  participantCount: number
  moduleNumber?: number | null
  vehicleType?: string | null
}

interface Participant {
  id: string
  phone: string
  name?: string | null
  pushName?: string | null
  isSuperAdmin?: boolean
}

// A single thing a student can sign for — either an in-car Teamup event or a
// member of a group class. The SignaturePad works off this, not the raw event.
interface SignTarget {
  eventId: string
  studentName: string
  phone: string | null
  sessionLabel: string
  subtitle: string
  moduleNumber: number | null
  sortieNumber: number | null
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

const last10 = (p: string | null | undefined) => (p || '').replace(/\D/g, '').slice(-10)

// Stable per-day id for a group class so each student signs once per day.
function groupEventId(groupId: string) {
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD (local)
  return `group-${groupId}-${today}`
}

interface SavedSignature {
  id: string
  eventId: string
  studentPhone: string
  signedAt: string
}

type View = 'classes' | 'groups' | 'roster'

export default function SignInMode({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<View>('classes')
  const [selectedGroup, setSelectedGroup] = useState<GroupSummary | null>(null)
  const [groupSearch, setGroupSearch] = useState('')
  const [signing, setSigning] = useState<SignTarget | null>(null)

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

  // Signatures signed today, refreshed every 30s. Used to mark both in-car
  // events (by eventId) and group members (by eventId + phone) as signed.
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

  const signedEventSet = useMemo(() => {
    const set = new Set<string>()
    for (const s of (signedData?.signatures || [])) set.add(s.eventId)
    return set
  }, [signedData])

  const signedKeySet = useMemo(() => {
    const set = new Set<string>()
    for (const s of (signedData?.signatures || [])) set.add(`${s.eventId}:${last10(s.studentPhone)}`)
    return set
  }, [signedData])

  // Groups (course cohorts) for the Group Classes view. Loaded lazily.
  const { data: groupsData, isLoading: groupsLoading } = useQuery<{ groups: GroupSummary[] }>({
    queryKey: ['signin-groups'],
    queryFn: async () => {
      const res = await fetch('/api/groups')
      if (!res.ok) throw new Error('Failed to fetch groups')
      return res.json()
    },
    enabled: view !== 'classes',
    staleTime: 60_000,
  })

  // Members of the selected group.
  const { data: membersData, isLoading: membersLoading } = useQuery<{ participants: Participant[]; moduleNumber?: number | null }>({
    queryKey: ['signin-group-members', selectedGroup?.id],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${encodeURIComponent(selectedGroup!.id)}`)
      if (!res.ok) throw new Error('Failed to fetch members')
      return res.json()
    },
    enabled: !!selectedGroup && view === 'roster',
  })

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

  const groups = useMemo(() => {
    const all = groupsData?.groups || []
    const q = groupSearch.trim().toLowerCase()
    return all
      .filter(g => g.name && g.name !== 'Status Broadcast')
      .filter(g => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [groupsData, groupSearch])

  const eventToTarget = (event: TeamupEvent): SignTarget => {
    const p = parseTitle(event.title)
    return {
      eventId: event.id,
      studentName: p.studentName || '(unknown)',
      phone: parsePhone(event.notes),
      sessionLabel: p.label,
      subtitle: `${p.label} · ${fmtTime(event.start_dt)}`,
      moduleNumber: p.moduleNumber,
      sortieNumber: p.sortieNumber,
    }
  }

  const memberToTarget = (group: GroupSummary, member: Participant, moduleNumber: number | null): SignTarget => {
    const name = member.name || member.pushName || member.phone
    const label = moduleNumber ? `${group.name} — Module ${moduleNumber}` : group.name
    return {
      eventId: groupEventId(group.id),
      studentName: name,
      phone: member.phone,
      sessionLabel: label,
      subtitle: group.name,
      moduleNumber: moduleNumber ?? null,
      sortieNumber: null,
    }
  }

  // ── Header ──────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        {view === 'classes' && (
          <>
            <h1 className="text-2xl font-bold">Sign-In Mode</h1>
            <p className="text-sm text-muted-foreground">
              Tap your name when you arrive. Today only — {todayEvents.length} session{todayEvents.length === 1 ? '' : 's'}.
            </p>
          </>
        )}
        {view === 'groups' && (
          <>
            <h1 className="text-2xl font-bold">Group Classes</h1>
            <p className="text-sm text-muted-foreground">Pick a class, then students sign in.</p>
          </>
        )}
        {view === 'roster' && selectedGroup && (
          <>
            <h1 className="text-2xl font-bold truncate">{selectedGroup.name}</h1>
            <p className="text-sm text-muted-foreground">
              {membersData?.moduleNumber ? `Module ${membersData.moduleNumber} · ` : ''}Tap a name to sign in.
            </p>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchSigs() }}>
          <RotateCcw className="h-4 w-4 mr-1" /> Refresh
        </Button>
        <Button variant="outline" onClick={onExit}>
          <X className="h-4 w-4 mr-1" /> Exit
        </Button>
      </div>
    </div>
  )

  // ── Classes view (in-car sessions) ──────────────────────────────
  const classesView = (
    <>
      <Button
        variant="outline"
        size="lg"
        className="w-full justify-between h-14 text-base"
        onClick={() => setView('groups')}
      >
        <span className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5" /> Group Classes</span>
        <ChevronRight className="h-5 w-5" />
      </Button>

      {eventsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : todayEvents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-base">No in-car classes today.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {todayEvents.map(event => {
            const p = parseTitle(event.title)
            const phone = parsePhone(event.notes)
            const signed = signedEventSet.has(event.id)
            return (
              <Card
                key={event.id}
                className={`transition-colors ${signed ? 'border-green-300 bg-green-50/40' : 'cursor-pointer hover:border-primary'}`}
                onClick={() => { if (!signed) setSigning(eventToTarget(event)) }}
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
    </>
  )

  // ── Groups view (pick a class) ──────────────────────────────────
  const groupsView = (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setView('classes')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to classes
        </Button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search classes…"
            value={groupSearch}
            onChange={e => setGroupSearch(e.target.value)}
          />
        </div>
      </div>

      {groupsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-base">No classes found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {groups.map(g => (
            <Card
              key={g.id}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => { setSelectedGroup(g); setView('roster') }}
            >
              <CardContent className="py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-lg truncate">{g.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {g.participantCount} student{g.participantCount === 1 ? '' : 's'}
                    {g.moduleNumber ? ` · Module ${g.moduleNumber}` : ''}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )

  // ── Roster view (students of a class sign in) ───────────────────
  const roster = useMemo(() => {
    const parts = membersData?.participants || []
    return parts
      .filter(p => p.phone && !p.isSuperAdmin)
      .sort((a, b) => (a.name || a.pushName || a.phone).localeCompare(b.name || b.pushName || b.phone))
  }, [membersData])

  const rosterView = selectedGroup && (
    <>
      <Button variant="outline" onClick={() => { setView('groups'); setSelectedGroup(null) }}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to class list
      </Button>

      {membersLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : roster.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-base">No students in this class yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {roster.map(member => {
            const eid = groupEventId(selectedGroup.id)
            const signed = signedKeySet.has(`${eid}:${last10(member.phone)}`)
            const name = member.name || member.pushName || member.phone
            return (
              <Card
                key={member.id}
                className={`transition-colors ${signed ? 'border-green-300 bg-green-50/40' : 'cursor-pointer hover:border-primary'}`}
                onClick={() => { if (!signed) setSigning(memberToTarget(selectedGroup, member, membersData?.moduleNumber ?? selectedGroup.moduleNumber ?? null)) }}
              >
                <CardContent className="py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-lg truncate">{name}</p>
                    {member.name && <p className="text-sm text-muted-foreground truncate">{member.phone}</p>}
                  </div>
                  {signed ? (
                    <Badge className="bg-green-100 text-green-800 gap-1 text-sm py-1.5 px-3">
                      <CheckCircle2 className="h-4 w-4" /> Signed
                    </Badge>
                  ) : (
                    <Button size="lg"><Pencil className="h-4 w-4 mr-2" /> Sign</Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )

  return (
    <div className="space-y-4">
      {header}
      {view === 'classes' && classesView}
      {view === 'groups' && groupsView}
      {view === 'roster' && rosterView}

      {signing && (
        <SignaturePad
          target={signing}
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
  target,
  onCancel,
  onSaved,
}: {
  target: SignTarget
  onCancel: () => void
  onSaved: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasInk, setHasInk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drawingRef = useRef(false)

  const phone = target.phone

  // Calibrate canvas to its rendered CSS box × devicePixelRatio. Has to
  // re-measure after the dialog open animation finishes (rect.width is
  // smaller during the animation), otherwise the finger position and the
  // ink position drift apart. ResizeObserver covers both the initial
  // animation and any later layout changes (rotation, keyboard, etc.).
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const measure = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = c.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      // Preserve any existing strokes by copying off and back.
      const prev = document.createElement('canvas')
      prev.width = c.width
      prev.height = c.height
      if (c.width > 0 && c.height > 0) {
        prev.getContext('2d')!.drawImage(c, 0, 0)
      }
      c.width = Math.round(rect.width * dpr)
      c.height = Math.round(rect.height * dpr)
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0f172a'
      if (prev.width > 0) {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(prev, 0, 0, c.width, c.height)
        ctx.restore()
      }
    }
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(c)
    return () => ro.disconnect()
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

  // Convert pointer event to CSS-pixel coords inside the canvas. Because
  // the context is transformed via setTransform(dpr,…), drawing at CSS-pixel
  // coordinates maps to the correct internal pixel under the finger.
  const localXY = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
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
      setError('No phone number for this student — cannot save.')
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
          eventId: target.eventId,
          studentPhone: phone,
          studentName: target.studentName || '(unknown)',
          signatureDataUrl: dataUrl,
          sessionLabel: target.sessionLabel,
          moduleNumber: target.moduleNumber,
          sortieNumber: target.sortieNumber,
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
          <DialogTitle>Sign In — {target.studentName || 'Student'}</DialogTitle>
          <DialogDescription>{target.subtitle}</DialogDescription>
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
