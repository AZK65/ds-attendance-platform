'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, LogOut, Monitor, Smartphone, ShieldCheck } from 'lucide-react'

interface DeviceSession {
  id: string
  label: string | null
  device: string
  ipAddress: string | null
  createdAt: string
  lastSeenAt: string
  current: boolean
  sessionCount?: number
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Active now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function DevicesPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<{ sessions: DeviceSession[] }>({
    queryKey: ['admin-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/auth/sessions')
      if (!res.ok) throw new Error('Failed to load devices')
      return res.json()
    },
    refetchInterval: 30_000,
  })

  const revoke = useMutation({
    mutationFn: async (body: { id?: string; others?: boolean }) => {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to log out device')
      return res.json()
    },
    onSuccess: (_data, vars) => {
      // If we logged ourselves out, go to login; otherwise refresh the list.
      const loggedOutSelf = sessions.find(s => s.id === vars.id)?.current
      if (loggedOutSelf) {
        window.location.href = '/login'
        return
      }
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] })
    },
  })

  const sessions = data?.sessions || []
  const otherCount = sessions.filter(s => !s.current).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Logged-in Devices</h2>
        <p className="text-sm text-muted-foreground">
          Every browser currently signed in with the admin password. Log out any you don&apos;t recognize.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Devices</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading…' : `${sessions.length} device${sessions.length === 1 ? '' : 's'} signed in`}
            </CardDescription>
          </div>
          {otherCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Log out ${otherCount} other device${otherCount === 1 ? '' : 's'}? They'll need the password to sign back in.`)) {
                  revoke.mutate({ others: true })
                }
              }}
              disabled={revoke.isPending}
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              Log out all others
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No active devices.</p>
          ) : (
            sessions.map(s => {
              const isMobile = /iPhone|iPad|Android/i.test(s.device)
              const Icon = isMobile ? Smartphone : Monitor
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${s.current ? 'border-green-300 bg-green-50/50' : ''}`}
                >
                  <div className="flex-shrink-0 rounded-md bg-muted p-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{s.label || s.device}</span>
                      {s.current && (
                        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 gap-1">
                          <ShieldCheck className="h-3 w-3" /> This device
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.ipAddress ? `${s.ipAddress} · ` : ''}{relativeTime(s.lastSeenAt)}
                      <span className="hidden sm:inline"> · signed in {fullDate(s.createdAt)}</span>
                      {(s.sessionCount ?? 1) > 1 && (
                        <span className="hidden sm:inline"> · {s.sessionCount} sessions</span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive flex-shrink-0"
                    onClick={() => {
                      const msg = s.current
                        ? 'Log out this device? You will be returned to the login screen.'
                        : `Log out "${s.label || s.device}"? It will need the password to sign back in.`
                      if (confirm(msg)) revoke.mutate({ id: s.id })
                    }}
                    disabled={revoke.isPending}
                  >
                    <LogOut className="h-4 w-4 mr-1.5" />
                    {s.current ? 'Log out' : 'Remove'}
                  </Button>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        A removed device is signed out within about a minute. Devices stay signed in as long as they&apos;re
        used at least once a year, so you won&apos;t get logged out during normal use.
      </p>
    </div>
  )
}
