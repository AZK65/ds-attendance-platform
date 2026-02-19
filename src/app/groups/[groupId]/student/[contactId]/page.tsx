'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Phone,
  User,
  Users,
  Shield,
  Edit3,
  Loader2,
  CalendarDays,
  Clock,
  BookOpen,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Save,
  X,
  GraduationCap,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'motion/react'

interface Participant {
  id: string
  phone: string
  name?: string | null
  pushName?: string | null
  isAdmin?: boolean
  isSuperAdmin?: boolean
}

interface TeamupEvent {
  id: string
  title: string
  start_dt: string
  end_dt: string
  subcalendar_ids: number[]
  notes?: string
}

interface SubCalendar {
  id: number
  name: string
  active: boolean
  color: number
}

interface AttendanceRecord {
  id: string
  status: string
  notes: string | null
  date: string
  attendanceSheet: {
    name: string
    group: {
      id: string
      name: string
    }
  }
}

// Parse helpers (same as scheduling page)
const stripHtml = (html: string) =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, '').trim()

const parseModuleFromTitle = (fullTitle: string) => {
  const parts = fullTitle.split(' - ')
  const first = parts[0]?.trim() || ''
  let module = ''
  let restParts = parts

  const mMatch = first.match(/^M(\d+)$/)
  const sMatch = first.match(/^Session (\d+)$/)
  const moduleMatch = first.match(/^Module (\d+)$/)
  if (mMatch) {
    module = mMatch[1]
    restParts = parts.slice(1)
  } else if (sMatch) {
    module = `S${sMatch[1]}`
    restParts = parts.slice(1)
  } else if (moduleMatch) {
    module = moduleMatch[1]
    restParts = parts.slice(1)
  }

  return {
    module,
    title: restParts[0] || '',
    studentName: restParts[1] || '',
    group: restParts.slice(2).join(' - ') || '',
  }
}

const parseStudentFromNotes = (notes?: string) => {
  if (!notes) return ''
  const match = stripHtml(notes).match(/Student:\s*(.+)/)
  return match?.[1]?.trim() || ''
}

const parseExtraHoursFromNotes = (notes?: string) => {
  if (!notes) return false
  return /ExtraHours:\s*yes/i.test(stripHtml(notes))
}

const getPhaseInfo = (moduleVal: string): { phase: number; label: string; color: string } | null => {
  if (!moduleVal) return null
  if (moduleVal.startsWith('S')) {
    const sNum = parseInt(moduleVal.slice(1))
    if (isNaN(sNum)) return null
    if (sNum >= 1 && sNum <= 4) return { phase: 2, label: 'Phase 2', color: 'bg-green-100 text-green-800' }
    if (sNum >= 5 && sNum <= 10) return { phase: 3, label: 'Phase 3', color: 'bg-blue-100 text-blue-800' }
    if (sNum >= 11 && sNum <= 15) return { phase: 4, label: 'Phase 4', color: 'bg-purple-100 text-purple-800' }
    return null
  }
  const num = parseInt(moduleVal)
  if (isNaN(num)) return null
  if (num >= 1 && num <= 5) return { phase: 1, label: 'Phase 1', color: 'bg-yellow-100 text-yellow-800' }
  if (num >= 6 && num <= 7) return { phase: 2, label: 'Phase 2', color: 'bg-green-100 text-green-800' }
  if (num >= 8 && num <= 10) return { phase: 3, label: 'Phase 3', color: 'bg-blue-100 text-blue-800' }
  if (num >= 11 && num <= 12) return { phase: 4, label: 'Phase 4', color: 'bg-purple-100 text-purple-800' }
  return null
}

const getModuleLabel = (moduleVal: string) => {
  if (!moduleVal) return ''
  if (moduleVal.startsWith('S')) return `Session ${moduleVal.slice(1)} (In-Car)`
  return `Module ${moduleVal}`
}

const formatTime12h = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function StudentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const groupId = decodeURIComponent(params.groupId as string)
  const contactId = decodeURIComponent(params.contactId as string)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  // Fetch group data to get participant info
  const { data: groupData, isLoading: loadingGroup } = useQuery<{
    group: { id: string; name: string; participantCount: number; moduleNumber?: number }
    participants: Participant[]
  }>({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`)
      if (!res.ok) throw new Error('Failed to fetch group')
      return res.json()
    },
  })

  const participant = groupData?.participants?.find(p => p.id === contactId)
  const displayName = participant?.name || participant?.pushName || participant?.phone || 'Unknown'
  const phone = participant?.phone || contactId.replace('@c.us', '')

  // Fetch student's scheduled classes from Teamup
  const { data: studentEvents = [], isLoading: loadingEvents } = useQuery<TeamupEvent[]>({
    queryKey: ['student-events', displayName, phone],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (displayName && displayName !== phone) params.set('studentName', displayName)
      params.set('phone', phone)
      const res = await fetch(`/api/scheduling/student-events?${params}`)
      if (!res.ok) throw new Error('Failed to fetch student events')
      return res.json()
    },
    enabled: !!phone,
  })

  // Fetch subcalendars (teachers) for displaying teacher names
  const { data: subcalendars = [] } = useQuery<SubCalendar[]>({
    queryKey: ['subcalendars'],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/subcalendars')
      if (!res.ok) throw new Error('Failed to fetch teachers')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const getTeacherName = (subcalendarIds: number[]) => {
    const teacher = subcalendars.find(s => subcalendarIds.includes(s.id))
    return teacher?.name?.split(' ')[0] || 'Unknown'
  }

  // Fetch attendance records
  const { data: attendanceData, isLoading: loadingAttendance } = useQuery<{ records: AttendanceRecord[] }>({
    queryKey: ['student-attendance', contactId],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/student?contactId=${encodeURIComponent(contactId)}`)
      if (!res.ok) throw new Error('Failed to fetch attendance')
      return res.json()
    },
  })

  // Split events into upcoming and past
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = new Date()
    const upcoming: TeamupEvent[] = []
    const past: TeamupEvent[] = []
    for (const event of studentEvents) {
      if (new Date(event.start_dt) >= now) {
        upcoming.push(event)
      } else {
        past.push(event)
      }
    }
    // Upcoming sorted ascending, past sorted descending
    upcoming.sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())
    past.sort((a, b) => new Date(b.start_dt).getTime() - new Date(a.start_dt).getTime())
    return { upcomingEvents: upcoming, pastEvents: past }
  }, [studentEvents])

  // Attendance stats
  const attendanceStats = useMemo(() => {
    const records = attendanceData?.records || []
    const total = records.length
    const present = records.filter(r => r.status === 'present').length
    const absent = total - present
    const rate = total > 0 ? Math.round((present / total) * 100) : 0
    return { total, present, absent, rate }
  }, [attendanceData])

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async ({ newPhone, newName }: { newPhone?: string; newName?: string }) => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, newPhone, newName }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
      setEditing(false)
    },
  })

  const handleSaveEdit = () => {
    const phoneChanged = editPhone !== phone
    const nameChanged = editName !== (participant?.name || '')
    if (!phoneChanged && !nameChanged) {
      setEditing(false)
      return
    }
    editMutation.mutate({
      newPhone: phoneChanged ? editPhone : undefined,
      newName: nameChanged ? editName : undefined,
    })
  }

  const startEditing = () => {
    setEditName(participant?.name || participant?.pushName || '')
    setEditPhone(phone)
    setEditing(true)
    editMutation.reset()
  }

  const isLoading = loadingGroup || loadingEvents || loadingAttendance

  // Render an event card
  const renderEventCard = (event: TeamupEvent) => {
    const parsed = parseModuleFromTitle(event.title)
    const phaseInfo = parsed.module ? getPhaseInfo(parsed.module) : null
    const isExtraHours = parseExtraHoursFromNotes(event.notes)

    return (
      <div
        key={event.id}
        onClick={() => router.push(`/scheduling?eventId=${encodeURIComponent(event.id)}`)}
        className="flex items-center gap-4 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
      >
        <div className="flex-shrink-0 text-center">
          <p className="text-xs text-muted-foreground">
            {new Date(event.start_dt).toLocaleDateString('en-US', { weekday: 'short' })}
          </p>
          <p className="text-lg font-bold">
            {new Date(event.start_dt).getDate()}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(event.start_dt).toLocaleDateString('en-US', { month: 'short' })}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">
              {parsed.module ? getModuleLabel(parsed.module) : parsed.title || event.title}
            </p>
            {phaseInfo && (
              <Badge variant="secondary" className={`text-xs ${phaseInfo.color}`}>
                {phaseInfo.label}
              </Badge>
            )}
            {isExtraHours && (
              <Badge variant="outline" className="text-xs">Extra Hours</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime12h(event.start_dt)} - {formatTime12h(event.end_dt)}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {getTeacherName(event.subcalendar_ids)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href={`/groups/${encodeURIComponent(groupId)}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Group
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {loadingGroup ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold truncate">{displayName}</h1>
                <a href={`tel:+${phone}`} className="text-muted-foreground hover:text-primary flex items-center gap-1 mt-1">
                  <Phone className="h-4 w-4" />
                  +{phone}
                </a>
              </>
            )}
          </div>
          {!loadingGroup && participant && (
            <div className="flex gap-2">
              <Button variant="default" size="sm" asChild>
                <Link href={`/scheduling?bookFor=${encodeURIComponent(displayName)}&phone=${encodeURIComponent(phone)}`}>
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Book Class
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Edit3 className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Edit Section */}
      {editing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="border rounded-lg p-4 space-y-4"
        >
          <h3 className="font-medium">Edit Student Info</h3>
          {editPhone !== phone && (
            <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Changing the phone will remove the old number and add the new one to the WhatsApp group.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Student name" />
            </div>
            <div>
              <Label className="text-sm">Phone</Label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone number" />
            </div>
          </div>
          {editMutation.isError && (
            <p className="text-sm text-destructive">
              {editMutation.error?.message || 'Failed to update'}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveEdit} disabled={editMutation.isPending}>
              {editMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={editMutation.isPending}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        </motion.div>
      )}

      {/* Info Cards */}
      {!loadingGroup && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <div className="p-3 border rounded-lg text-center">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Group</p>
            <p className="font-medium text-sm truncate">{groupData?.group?.name || '-'}</p>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <Shield className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Role</p>
            <p className="font-medium text-sm">
              {participant?.isSuperAdmin ? 'Owner' : participant?.isAdmin ? 'Admin' : 'Member'}
            </p>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <CalendarDays className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Classes</p>
            <p className="font-medium text-sm">{studentEvents.length}</p>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <GraduationCap className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Attendance</p>
            <p className="font-medium text-sm">{attendanceStats.rate}%</p>
          </div>
        </motion.div>
      )}

      {/* Upcoming Classes */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" />
              Upcoming Classes
              {upcomingEvents.length > 0 && (
                <Badge variant="secondary" className="ml-auto">{upcomingEvents.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading schedule...</span>
              </div>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No upcoming classes scheduled</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map(renderEventCard)}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Past Classes */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.25 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Past Classes
              {pastEvents.length > 0 && (
                <Badge variant="secondary" className="ml-auto">{pastEvents.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : pastEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No past classes found</p>
            ) : (
              <div className="space-y-2">
                {pastEvents.slice(0, 20).map(renderEventCard)}
                {pastEvents.length > 20 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    Showing 20 of {pastEvents.length} past classes
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Attendance History */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.25 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" />
              Attendance History
              {attendanceStats.total > 0 && (
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {attendanceStats.present}/{attendanceStats.total} present ({attendanceStats.rate}%)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAttendance ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading attendance...</span>
              </div>
            ) : !attendanceData?.records?.length ? (
              <p className="text-muted-foreground text-center py-6">No attendance records found</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceData.records.map(record => (
                      <TableRow key={record.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(record.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          {record.status === 'present' ? (
                            <Badge className="bg-green-100 text-green-800 gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Present
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-red-100 text-red-800 gap-1">
                              <XCircle className="h-3 w-3" />
                              Absent
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {record.attendanceSheet?.group?.name || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {record.notes || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  )
}
