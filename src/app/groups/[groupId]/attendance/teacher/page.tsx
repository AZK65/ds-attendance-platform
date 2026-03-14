'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  UserCheck,
  UserX,
  CheckCircle,
  Undo2,
  Wifi,
  WifiOff,
  RefreshCw,
  Monitor,
  HelpCircle
} from 'lucide-react'
import Link from 'next/link'

interface MatchedStudent {
  whatsappName: string
  whatsappPhone: string
  zoomName: string
  duration: number
  joinTime: string
}

interface AbsentStudent {
  name: string
  phone: string
}

interface UnmatchedZoom {
  name: string
  duration: number
}

interface ManualOverrideData {
  phone: string
  zoomName: string
  setBy: string
  setAt: string
}

interface SSEData {
  type: string
  isLive: boolean
  meetingId: string | null
  topic: string | null
  startTime: string | null
  participantCount: number
  matched: MatchedStudent[]
  absent: AbsentStudent[]
  unmatchedZoom: UnmatchedZoom[]
  manualOverrides: ManualOverrideData[]
  timestamp: string
}

type FilterTab = 'all' | 'absent' | 'present'

export default function TeacherAttendancePage() {
  const params = useParams()
  const groupId = decodeURIComponent(params.groupId as string)

  const [sseConnected, setSSEConnected] = useState(false)
  const [liveData, setLiveData] = useState<SSEData | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('absent')
  const [pickingForPhone, setPickingForPhone] = useState<string | null>(null)
  const [optimisticAdds, setOptimisticAdds] = useState<Map<string, string>>(new Map())
  const [optimisticRemoves, setOptimisticRemoves] = useState<Set<string>>(new Set())
  const eventSourceRef = useRef<EventSource | null>(null)

  // Fetch group data
  const { data: groupData } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`)
      return res.json()
    }
  })

  // Check meeting status
  const { data: meetingStatus, refetch: recheckMeeting } = useQuery({
    queryKey: ['live-meeting'],
    queryFn: async () => {
      const res = await fetch('/api/zoom/live-meeting?meetingId=4171672829')
      return res.json()
    },
    refetchInterval: 60000
  })

  const group = groupData?.group

  // Connect to SSE stream
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`/api/zoom/live-stream?groupId=${encodeURIComponent(groupId)}`)
    eventSourceRef.current = es

    es.onopen = () => setSSEConnected(true)

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEData
        setLiveData(data)
        setOptimisticAdds(new Map())
        setOptimisticRemoves(new Set())
      } catch {
        // Ignore parse errors
      }
    }

    es.onerror = () => setSSEConnected(false)
  }, [groupId])

  useEffect(() => {
    connectSSE()
    return () => { eventSourceRef.current?.close() }
  }, [connectSSE])

  // Derive overrides from SSE data + optimistic state
  const serverOverrides = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of (liveData?.manualOverrides ?? [])) {
      if (!optimisticRemoves.has(o.phone)) {
        map.set(o.phone, o.zoomName)
      }
    }
    for (const [phone, zoomName] of optimisticAdds) {
      map.set(phone, zoomName)
    }
    return map
  }, [liveData?.manualOverrides, optimisticAdds, optimisticRemoves])

  // Mark present via server API
  const markPresent = async (phone: string, zoomName?: string) => {
    const name = zoomName || '(Manual)'
    setPickingForPhone(null)
    setOptimisticAdds(prev => new Map(prev).set(phone, name))
    setOptimisticRemoves(prev => {
      const next = new Set(prev)
      next.delete(phone)
      return next
    })
    await fetch('/api/zoom/live-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, phone, zoomName: name, action: 'add', setBy: 'teacher' })
    })
  }

  const undoMarkPresent = async (phone: string) => {
    setOptimisticRemoves(prev => new Set(prev).add(phone))
    setOptimisticAdds(prev => {
      const next = new Map(prev)
      next.delete(phone)
      return next
    })
    await fetch('/api/zoom/live-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, phone, action: 'remove', setBy: 'teacher' })
    })
  }

  // Compute effective lists
  const matched = liveData?.matched ?? []
  const rawAbsent = liveData?.absent ?? []
  const rawUnmatchedZoom = liveData?.unmatchedZoom ?? []

  const linkedZoomNames = new Set(
    [...serverOverrides.values()].filter(v => v !== '(Manual)')
  )

  const overriddenAbsent = rawAbsent.filter(a => serverOverrides.has(a.phone))
  const effectivePresent = [
    ...matched,
    ...overriddenAbsent.map(a => ({
      whatsappName: a.name,
      whatsappPhone: a.phone,
      zoomName: serverOverrides.get(a.phone) || '(Manual)',
      duration: 0,
      joinTime: ''
    }))
  ].sort((a, b) => a.whatsappName.localeCompare(b.whatsappName))

  const effectiveAbsent = rawAbsent
    .filter(a => !serverOverrides.has(a.phone))
    .sort((a, b) => a.name.localeCompare(b.name))

  const unmatchedZoom = rawUnmatchedZoom.filter(p => !linkedZoomNames.has(p.name))

  const isLive = liveData?.isLive ?? meetingStatus?.isLive ?? false
  const totalStudents = effectivePresent.length + effectiveAbsent.length

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto px-3 py-4 max-w-lg">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Link href={`/groups/${encodeURIComponent(groupId)}/attendance`}>
              <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">{group?.name || 'Loading...'}</h1>
              <div className="flex items-center gap-2">
                {isLive ? (
                  <Badge className="bg-green-600 text-white text-xs px-2 py-0.5">
                    <span className="relative flex h-1.5 w-1.5 mr-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                    </span>
                    LIVE
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs px-2 py-0.5">Offline</Badge>
                )}
                <span className="text-sm font-medium text-muted-foreground">
                  {effectivePresent.length}/{totalStudents} Present
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link href={`/groups/${encodeURIComponent(groupId)}/attendance`}>
              <Button variant="ghost" size="icon" className="h-9 w-9" title="Office View">
                <Monitor className="h-4 w-4" />
              </Button>
            </Link>
            {sseConnected ? (
              <Wifi className="h-4 w-4 text-green-600" />
            ) : (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { recheckMeeting(); connectSSE() }}>
                <WifiOff className="h-4 w-4 text-red-500" />
              </Button>
            )}
          </div>
        </div>

        {/* Not Live State */}
        {!isLive && !liveData?.participantCount && (
          <div className="text-center py-16 border rounded-xl bg-muted/30">
            <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <h2 className="text-lg font-medium text-muted-foreground mb-2">No Active Meeting</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Waiting for class to start...
            </p>
            <Button variant="outline" size="sm" onClick={() => recheckMeeting()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
          </div>
        )}

        {/* Live Content */}
        {(isLive || (liveData?.matched && liveData.matched.length > 0)) && (
          <>
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="h-3 bg-red-100 dark:bg-red-950/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: totalStudents > 0 ? `${(effectivePresent.length / totalStudents) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 mb-4 bg-muted/50 rounded-lg p-1">
              <button
                className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveTab('all')}
              >
                All ({totalStudents})
              </button>
              <button
                className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'absent' ? 'bg-background shadow-sm text-red-700' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveTab('absent')}
              >
                Absent ({effectiveAbsent.length})
              </button>
              <button
                className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'present' ? 'bg-background shadow-sm text-green-700' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveTab('present')}
              >
                Present ({effectivePresent.length})
              </button>
            </div>

            {/* Student List */}
            <div className="space-y-1.5">
              {/* Show absent students */}
              {(activeTab === 'all' || activeTab === 'absent') && effectiveAbsent.map((student) => (
                <div key={`absent-${student.phone}`} className="border border-red-200 dark:border-red-900 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserX className="h-5 w-5 text-red-500 flex-shrink-0" />
                      <span className="font-medium text-base truncate">{student.name}</span>
                    </div>
                    {unmatchedZoom.length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 px-4 border-green-300 text-green-700 hover:bg-green-50 flex-shrink-0"
                        onClick={() => setPickingForPhone(pickingForPhone === student.phone ? null : student.phone)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                        Mark
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 px-4 border-green-300 text-green-700 hover:bg-green-50 flex-shrink-0"
                        onClick={() => markPresent(student.phone)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                        Mark
                      </Button>
                    )}
                  </div>
                  {/* Zoom picker */}
                  {pickingForPhone === student.phone && (
                    <div className="border-t px-3 py-2.5 bg-muted/30 space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Link to Zoom participant:</p>
                      {unmatchedZoom.map((z, zi) => (
                        <button
                          key={zi}
                          className="w-full text-left px-4 py-3 text-sm rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 border hover:border-green-300 transition-colors"
                          onClick={() => markPresent(student.phone, z.name)}
                        >
                          {z.name}
                        </button>
                      ))}
                      <button
                        className="w-full text-left px-4 py-3 text-sm rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 border hover:border-blue-300 transition-colors text-muted-foreground"
                        onClick={() => markPresent(student.phone)}
                      >
                        Mark without linking
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Show present students */}
              {(activeTab === 'all' || activeTab === 'present') && effectivePresent.map((student) => {
                const isOverridden = serverOverrides.has(student.whatsappPhone)
                return (
                  <div
                    key={`present-${student.whatsappPhone}`}
                    className="flex items-center justify-between px-4 py-4 border border-green-200 dark:border-green-900 rounded-xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-base truncate block">{student.whatsappName}</span>
                        <span className="text-xs text-muted-foreground">
                          {isOverridden ? (
                            student.zoomName === '(Manual)' ? 'Manual' : `Linked: ${student.zoomName}`
                          ) : (
                            'Auto-matched'
                          )}
                        </span>
                      </div>
                    </div>
                    {isOverridden ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 w-10 p-0 flex-shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={() => undoMarkPresent(student.whatsappPhone)}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-200 flex-shrink-0">
                        Auto
                      </Badge>
                    )}
                  </div>
                )
              })}

              {/* Empty states */}
              {activeTab === 'absent' && effectiveAbsent.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <UserCheck className="h-10 w-10 mx-auto mb-2 text-green-500" />
                  <p className="font-medium">Everyone is present!</p>
                </div>
              )}
              {activeTab === 'present' && effectivePresent.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">No students matched yet</p>
                </div>
              )}
            </div>

            {/* Unmatched Zoom (collapsed by default on mobile) */}
            {unmatchedZoom.length > 0 && activeTab === 'all' && (
              <div className="mt-4 border rounded-xl overflow-hidden">
                <div className="bg-gray-100 dark:bg-gray-900/50 px-4 py-2.5 border-b">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Unmatched Zoom ({unmatchedZoom.length})
                  </h3>
                </div>
                <div className="divide-y max-h-[150px] overflow-y-auto">
                  {unmatchedZoom.map((p, i) => (
                    <div key={i} className="px-4 py-2 text-sm text-muted-foreground">
                      {p.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
