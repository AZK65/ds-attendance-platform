'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { CheckCircle2, Circle, PenLine, RefreshCw, Calendar, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// Panel that replaces the Zoom live-attendance UI for truck cohorts.
// Shows today's Teamup event (if resolvable), the roster with a signed
// checkmark against everyone who has captured a signature, and a link to
// /scheduling so admin / iPad can open Sign-In Mode.

interface Member {
  phone: string
  name: string
}
interface Signature {
  studentPhone: string
  studentName: string
  signedAt: string
}
interface RecentSignature extends Signature {
  eventId: string
}
interface GroupTodayResp {
  group: { id: string; name: string; vehicleType: string }
  event: { id: string; title: string; start_dt: string; end_dt: string | null } | null
  signatures: Signature[]
  signedInLastHours: RecentSignature[]
  members: Member[]
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
}

function phoneSuffix(p: string): string {
  return p.replace(/\D/g, '').slice(-10)
}

export function TruckSignInPanel({ groupId }: { groupId: string }) {
  const { data, isLoading, refetch, isRefetching } = useQuery<GroupTodayResp>({
    queryKey: ['group-today', groupId],
    queryFn: () =>
      fetch(`/api/scheduling/group-today?groupId=${encodeURIComponent(groupId)}`).then(r => r.json()),
    refetchInterval: 20_000, // Refresh every 20 s while admin has this open.
  })

  // Build a map of member-phone → whether they signed today (from either
  // event-tied signatures OR the last-12h fallback list). This is what
  // powers the per-member ✓ mark.
  const signedSuffixMap = useMemo(() => {
    const map = new Map<string, { name: string; at: string }>()
    if (!data) return map
    for (const s of data.signatures) {
      map.set(phoneSuffix(s.studentPhone), { name: s.studentName, at: s.signedAt })
    }
    for (const s of data.signedInLastHours) {
      const k = phoneSuffix(s.studentPhone)
      if (!map.has(k)) map.set(k, { name: s.studentName, at: s.signedAt })
    }
    return map
  }, [data])

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Loading today's sign-ins…</div>
      </Card>
    )
  }
  if (!data) return null

  const members = data.members || []
  const signedCount = members.filter(m => signedSuffixMap.has(phoneSuffix(m.phone))).length
  const total = members.length
  const pct = total ? Math.round((signedCount / total) * 100) : 0

  return (
    <Card className="p-4 md:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PenLine className="h-4 w-4 text-emerald-600" />
            Sign-in sheet
            <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
              truck
            </Badge>
          </div>
          {data.event ? (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              <span>{data.event.title || 'Today'}</span>
              <span className="opacity-60">·</span>
              <span>{fmtTime(data.event.start_dt)}{data.event.end_dt ? `–${fmtTime(data.event.end_dt)}` : ''}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-1">
              No Teamup event resolved for today — showing anyone who signed in the last 12 h.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Link href="/scheduling" target="_blank" rel="noreferrer">
            <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
              <PenLine className="h-3 w-3 mr-1" /> Open Sign-In Mode
            </Button>
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-medium">
            {signedCount} / {total} signed
          </span>
          <span className="text-muted-foreground tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Roster */}
      {total === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6 flex flex-col items-center gap-2">
          <Users className="h-8 w-8 opacity-40" />
          <p>No members on this group yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {members.map(m => {
            const sig = signedSuffixMap.get(phoneSuffix(m.phone))
            const signed = !!sig
            return (
              <li key={m.phone} className="py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {signed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/40 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className={`text-sm truncate ${signed ? 'font-medium' : 'text-muted-foreground'}`}>
                      {m.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">{m.phone}</div>
                  </div>
                </div>
                {signed && sig && (
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums flex-shrink-0">
                    signed {fmtTime(sig.at)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Anyone-else who signed but isn't on the group roster */}
      {(() => {
        const memberSuffixes = new Set(members.map(m => phoneSuffix(m.phone)))
        const strangers = [...signedSuffixMap.entries()].filter(([suffix]) => !memberSuffixes.has(suffix))
        if (strangers.length === 0) return null
        return (
          <div className="mt-4 pt-4 border-t">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Signed but not on the group ({strangers.length})
            </div>
            <ul className="space-y-1.5">
              {strangers.map(([suffix, sig]) => (
                <li key={suffix} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <span className="truncate">{sig.name}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">{fmtTime(sig.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })()}
    </Card>
  )
}
