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
  Users,
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

export default function TeacherAttendancePage() {
  const params = useParams()
  const groupId = decodeURIComponent(params.groupId as string)

  const [sseConnected, setSSEConnected] = useState(false)
  const [liveData, setLiveData] = useState<SSEData | null>(null)
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
  const lastUpdate = liveData?.timestamp ? new Date(liveData.timestamp) : null

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href={`/groups/${encodeURIComponent(groupId)}/attendance`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold">{group?.name || 'Loading...'}</h1>
              <p className="text-sm text-muted-foreground">Teacher Attendance</p>
            </div>
            {isLive ? (
              <Badge className="bg-green-600 text-white ml-2 text-sm px-3 py-1">
                <span className="relative flex h-2 w-2 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                LIVE
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-2 text-sm px-3 py-1">
                Not Active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/groups/${encodeURIComponent(groupId)}/attendance`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Monitor className="h-4 w-4" />
                Office View
              </Button>
            </Link>
            {sseConnected ? (
              <div className="flex items-center gap-1 text-green-600 text-xs">
                <Wifi className="h-3 w-3" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-500 text-xs">
                <WifiOff className="h-3 w-3" />
                Disconnected
              </div>
            )}
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { recheckMeeting(); connectSSE() }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Not Live State */}
        {!isLive && !liveData?.participantCount && (
          <div className="text-center py-20 border rounded-xl bg-muted/30">
            <Users className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-medium text-muted-foreground mb-2">No Active Meeting</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Waiting for a Zoom meeting to start...
              <br />
              This page will update automatically when the class begins.
            </p>
            <Button variant="outline" onClick={() => recheckMeeting()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>
          </div>
        )}

        {/* Live Content */}
        {(isLive || (liveData?.matched && liveData.matched.length > 0)) && (
          <>
            {/* Stats + Progress */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 dark:bg-green-950/30 border-2 border-green-300 dark:border-green-800 rounded-xl p-5 text-center">
                <UserCheck className="h-7 w-7 mx-auto text-green-600 mb-1" />
                <span className="text-4xl font-bold text-green-700 dark:text-green-400">{effectivePresent.length}</span>
                <p className="text-sm text-green-600 dark:text-green-500 font-medium mt-1">Present</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-300 dark:border-red-800 rounded-xl p-5 text-center">
                <UserX className="h-7 w-7 mx-auto text-red-600 mb-1" />
                <span className="text-4xl font-bold text-red-700 dark:text-red-400">{effectiveAbsent.length}</span>
                <p className="text-sm text-red-600 dark:text-red-500 font-medium mt-1">Absent</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/30 border-2 border-gray-300 dark:border-gray-700 rounded-xl p-5 text-center">
                <HelpCircle className="h-7 w-7 mx-auto text-gray-500 mb-1" />
                <span className="text-4xl font-bold text-gray-700 dark:text-gray-400">{unmatchedZoom.length}</span>
                <p className="text-sm text-gray-500 font-medium mt-1">Unmatched</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-muted-foreground">Attendance Progress</span>
                <span className="text-sm font-bold">
                  {totalStudents > 0 ? Math.round((effectivePresent.length / totalStudents) * 100) : 0}%
                </span>
              </div>
              <div className="h-3 bg-red-100 dark:bg-red-950/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: totalStudents > 0 ? `${(effectivePresent.length / totalStudents) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Two Column Layout — Absent (left) and Present (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Absent Students — Action needed */}
              <div className="border-2 border-red-200 dark:border-red-900 rounded-xl overflow-hidden">
                <div className="bg-red-100 dark:bg-red-950/50 px-4 py-3 border-b border-red-200 dark:border-red-900">
                  <h2 className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
                    <UserX className="h-5 w-5" />
                    Absent ({effectiveAbsent.length})
                    {effectiveAbsent.length === 0 && effectivePresent.length > 0 && (
                      <span className="text-xs font-normal ml-1">— All present!</span>
                    )}
                  </h2>
                </div>
                <div className="divide-y divide-red-100 dark:divide-red-900/50 max-h-[600px] overflow-y-auto">
                  {effectiveAbsent.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <UserCheck className="h-10 w-10 mx-auto mb-2 text-green-500" />
                      <p className="font-medium text-green-700 dark:text-green-400">Everyone is present!</p>
                    </div>
                  ) : (
                    effectiveAbsent.map((student) => (
                      <div key={student.phone} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserX className="h-4 w-4 text-red-400 flex-shrink-0" />
                            <span className="font-medium truncate">{student.name}</span>
                          </div>
                          {unmatchedZoom.length > 0 ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 border-green-300 text-green-700 hover:bg-green-50 flex-shrink-0"
                              onClick={() => setPickingForPhone(pickingForPhone === student.phone ? null : student.phone)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Link &amp; Mark
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 border-green-300 text-green-700 hover:bg-green-50 flex-shrink-0"
                              onClick={() => markPresent(student.phone)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Mark Present
                            </Button>
                          )}
                        </div>
                        {/* Zoom picker dropdown */}
                        {pickingForPhone === student.phone && (
                          <div className="mt-2 border rounded-lg bg-muted/30 p-2 space-y-1">
                            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Link to Zoom participant:</p>
                            {unmatchedZoom.map((z, zi) => (
                              <button
                                key={zi}
                                className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-green-50 dark:hover:bg-green-950/30 border hover:border-green-300 transition-colors"
                                onClick={() => markPresent(student.phone, z.name)}
                              >
                                {z.name}
                              </button>
                            ))}
                            <button
                              className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 border hover:border-blue-300 transition-colors text-muted-foreground"
                              onClick={() => markPresent(student.phone)}
                            >
                              Mark without linking
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Present Students */}
              <div className="border-2 border-green-200 dark:border-green-900 rounded-xl overflow-hidden">
                <div className="bg-green-100 dark:bg-green-950/50 px-4 py-3 border-b border-green-200 dark:border-green-900">
                  <h2 className="font-semibold text-green-800 dark:text-green-300 flex items-center gap-2">
                    <UserCheck className="h-5 w-5" />
                    Present ({effectivePresent.length})
                  </h2>
                </div>
                <div className="divide-y divide-green-100 dark:divide-green-900/50 max-h-[600px] overflow-y-auto">
                  {effectivePresent.length === 0 ? (
                    <div className="px-4 py-12 text-center text-muted-foreground text-sm">
                      No students matched yet
                    </div>
                  ) : (
                    effectivePresent.map((student, i) => {
                      const isOverridden = serverOverrides.has(student.whatsappPhone)
                      return (
                        <div key={student.whatsappPhone || i} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium">{student.whatsappName}</p>
                            <p className="text-xs text-muted-foreground">
                              {isOverridden ? (
                                student.zoomName === '(Manual)' ? 'Manually marked' : `Linked: ${student.zoomName}`
                              ) : (
                                <>
                                  Zoom: {student.zoomName}
                                  {student.joinTime && (
                                    <> &middot; Joined {new Date(student.joinTime).toLocaleTimeString()}</>
                                  )}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOverridden ? (
                              <>
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  {student.zoomName === '(Manual)' ? 'Manual' : 'Linked'}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => undoMarkPresent(student.whatsappPhone)}
                                >
                                  <Undo2 className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                                Auto
                              </Badge>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Unmatched Zoom Participants */}
            {unmatchedZoom.length > 0 && (
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-gray-100 dark:bg-gray-900/50 px-4 py-3 border-b">
                  <h2 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 text-sm">
                    <HelpCircle className="h-4 w-4" />
                    Unmatched Zoom Participants ({unmatchedZoom.length})
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    These Zoom names could not be matched to any WhatsApp member
                  </p>
                </div>
                <div className="divide-y max-h-[200px] overflow-y-auto">
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

        {/* Meeting Info Footer */}
        {liveData?.topic && (
          <div className="mt-6 text-center text-xs text-muted-foreground">
            {liveData.topic}
            {liveData.startTime && (
              <> &middot; Started {new Date(liveData.startTime).toLocaleTimeString()}</>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
