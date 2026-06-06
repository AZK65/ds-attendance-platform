'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft, Loader2, Phone, MapPin, Mail, Calendar, CreditCard,
  Award, Users, DollarSign, FileText, Receipt, Clock, Plus,
  BookOpen, GraduationCap, Database, CalendarDays, Download,
  CheckCircle, XCircle, ChevronDown, ChevronUp, ClipboardList,
  Shield, FileSignature, Pencil, ChevronRight, HeartPulse, AlertTriangle,
  Truck, Car,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { StudentAvatar } from '@/components/StudentAvatar'

interface TeamupEvent {
  id: string
  title: string
  start_dt: string
  end_dt: string
  subcalendar_ids: number[]
  notes?: string
}

interface SubCalendar { id: number; name: string }

interface StudentProfile {
  student: {
    student_id: number; full_name: string; phone_number: string; permit_number: string;
    full_address: string; city: string; postal_code: string; email: string; dob: string;
    status: string; contract_number: number; user_defined_contract_number: number | null;
  }
  localStudent: {
    id: string
    email?: string | null
    avatarImage?: string | null
    certificates: Array<{
      id: string; certificateType: string; contractNumber: string | null;
      attestationNumber: string | null; generatedAt: string;
    }>
  } | null
  invoices: Array<{
    id: string; invoiceNumber: string; invoiceDate: string; total: number;
    paymentStatus: string; lineItems: string;
  }>
  vehicleType?: string | null
  groups: Array<{ groupId: string; groupName: string; moduleNumber: number | null }>
  exams?: Array<{
    id: string; examCode: string; groupName: string; score: number | null;
    passed: boolean | null; totalQuestions: number; startedAt: string;
    submittedAt: string | null; timeExpired: boolean;
  }>
  summary: {
    totalInvoiced: number; totalPaid: number; openBalance: number;
    invoiceCount: number; certificateCount: number; groupCount: number;
  }
  registration: {
    id: string
    medical: string | null
    signatureImage: string | null
    idImage: string | null
    submittedAt: string | null
    confirmedAt: string | null
  } | null
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount)
}

function AttendanceSheetButton({ phone }: { phone: string }) {
  const { data } = useQuery<{ signatures: Array<{ id: string }> }>({
    queryKey: ['attendance-sheet-count', phone],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/signature?phone=${encodeURIComponent(phone)}`)
      if (!res.ok) return { signatures: [] }
      return res.json()
    },
    enabled: !!phone,
    staleTime: 60 * 1000,
  })
  const count = data?.signatures?.length ?? 0
  return (
    <Button variant="outline" size="sm" asChild>
      <a
        href={`/api/scheduling/signature/pdf?phone=${encodeURIComponent(phone)}`}
        target="_blank"
        rel="noopener"
      >
        <FileSignature className="h-4 w-4 mr-1" />
        Attendance Sheet
        {count > 0 && (
          <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{count}</Badge>
        )}
      </a>
    </Button>
  )
}

function parseModuleFromTitle(title: string) {
  const match = title.match(/^(?:Session|M|Module)\s*(\d+)/i)
  return match ? match[1] : null
}

export default function StudentProfilePage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const studentId = params.studentId as string
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [editingBalance, setEditingBalance] = useState(false)
  const [newBalanceInput, setNewBalanceInput] = useState('')
  const [balanceSaving, setBalanceSaving] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailInput, setEmailInput] = useState('')

  // Update email on the LOCAL SQLite student record (writes always go
  // there; MySQL is read-only for us). Creates a local row if one
  // doesn't exist yet so DB-only students can still get an email.
  const emailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update email')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-profile', studentId] })
      setEditingEmail(false)
    },
  })

  const { data, isLoading } = useQuery<StudentProfile>({
    queryKey: ['student-profile', studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const student = data?.student
  const phone = student?.phone_number?.replace(/\D/g, '') || ''
  const displayName = student?.full_name || 'Unknown'
  const groupNames = data?.groups?.map(g => g.groupName) || []

  // Fetch Teamup events
  const { data: studentEvents = [], isLoading: loadingEvents } = useQuery<TeamupEvent[]>({
    queryKey: ['student-events-standalone', displayName, phone, groupNames],
    queryFn: async () => {
      const allEvents: TeamupEvent[] = []
      const seenIds = new Set<string>()
      const fetchEvents = async (p: URLSearchParams) => {
        const res = await fetch(`/api/scheduling/student-events?${p}`)
        if (!res.ok) return
        const events: TeamupEvent[] = await res.json()
        for (const e of events) { if (!seenIds.has(e.id)) { seenIds.add(e.id); allEvents.push(e) } }
      }
      const p1 = new URLSearchParams()
      if (student?.full_name) p1.set('studentName', student.full_name)
      if (phone) p1.set('phone', phone)
      for (const gn of groupNames) { if (gn) p1.set('groupName', gn) }
      await fetchEvents(p1)
      if (student?.full_name) {
        const parts = student.full_name.trim().split(/\s+/).filter(p => p.length >= 3)
        if (parts.length >= 2) {
          const shortName = parts.slice(-2).join(' ')
          if (shortName !== student.full_name) {
            const p2 = new URLSearchParams()
            p2.set('studentName', shortName)
            await fetchEvents(p2)
          }
        }
      }
      return allEvents
    },
    enabled: !!student,
  })

  // Fetch Zoom theory classes
  const { data: theoryClasses = [] } = useQuery<Array<{ moduleNumber: number; date: string; meetingUUID: string; groupId: string; zoomName: string; status: string }>>({
    queryKey: ['student-theory-standalone', phone, displayName],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (phone) params.set('phone', phone)
      if (displayName && displayName !== phone) params.set('name', displayName)
      const res = await fetch(`/api/scheduling/student-theory?${params}`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!phone,
  })

  // Also fetch profile data for more reliable invoice/exam matching
  const { data: profileData } = useQuery<{
    invoices: Array<{ id: string; invoiceNumber: string; invoiceDate: string; total: number; paymentStatus: string; lineItems: string; studentAddress?: string; studentCity?: string; studentPostalCode?: string; studentEmail?: string }>
    exams?: Array<{ id: string; examCode: string; groupName: string; score: number | null; passed: boolean | null; totalQuestions: number; startedAt: string; submittedAt: string | null; timeExpired: boolean }>
    summary: { totalInvoiced: number; totalPaid: number; openBalance: number }
  }>({
    queryKey: ['student-profile-data', phone, displayName],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (phone) params.set('phone', phone)
      if (displayName && displayName !== phone) params.set('name', displayName)
      const res = await fetch(`/api/students/profile?${params}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!phone,
  })

  // Fetch attendance
  const eventIds = studentEvents.map(e => e.id).join(',')
  const { data: attendanceMap = {} } = useQuery<Record<string, boolean>>({
    queryKey: ['class-attendance-standalone', eventIds],
    queryFn: async () => {
      if (!eventIds) return {}
      const res = await fetch(`/api/scheduling/attendance?eventIds=${eventIds}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: studentEvents.length > 0,
  })

  // Fetch teachers
  const { data: subcalendars = [] } = useQuery<SubCalendar[]>({
    queryKey: ['subcalendars'],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/subcalendars')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const getTeacherName = (ids: number[]) => subcalendars.find(s => ids.includes(s.id))?.name?.split(' ')[0] || ''

  // Merge Teamup events + Zoom theory classes
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = new Date()
    const upcoming = studentEvents.filter(e => new Date(e.start_dt) >= now).sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())
    const past = studentEvents.filter(e => new Date(e.start_dt) < now)

    // Add Zoom theory classes to past events (if not already there).
    // Records without a moduleNumber must still appear — see commit f54937e
    // and the matching logic in /groups/[groupId]/student/[contactId]/page.tsx
    for (const tc of theoryClasses) {
      const tcDate = new Date(tc.date)
      // Only dedupe when this Zoom record HAS a module — otherwise we'd kill
      // legitimate generic theory classes whenever a Teamup event happened to
      // sit nearby on the timeline.
      const alreadyExists = tc.moduleNumber != null && past.some(e => {
        const mod = parseModuleFromTitle(e.title)
        return mod === String(tc.moduleNumber) && Math.abs(new Date(e.start_dt).getTime() - tcDate.getTime()) < 24 * 60 * 60 * 1000
      })
      if (!alreadyExists) {
        const isAbsent = tc.status === 'absent'
        const modLabel = tc.moduleNumber != null ? `M${tc.moduleNumber}` : 'Theory Class'
        past.push({
          id: `theory-${tc.moduleNumber ?? 'x'}-${tc.meetingUUID}`,
          title: `${modLabel} - ${displayName}${isAbsent ? ' (ABSENT)' : ''}`,
          start_dt: tc.date,
          end_dt: tc.date,
          subcalendar_ids: [],
          notes: `Zoom Theory Class\nModule ${tc.moduleNumber ?? '—'}`,
        })
      }
    }

    past.sort((a, b) => new Date(b.start_dt).getTime() - new Date(a.start_dt).getTime())
    return { upcomingEvents: upcoming, pastEvents: past }
  }, [studentEvents, theoryClasses, displayName])

  if (isLoading) return <main className="max-w-3xl mx-auto p-6 flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></main>
  if (!data || !student) return <main className="max-w-3xl mx-auto p-6"><p className="text-center text-muted-foreground py-20">Student not found</p></main>

  const { invoices, groups, summary } = data

  // Use profile data for invoices/exams if the main API didn't find them
  const mergedInvoices = invoices.length > 0 ? invoices : (profileData?.invoices || [])
  const mergedExams = (data.exams && data.exams.length > 0) ? data.exams : (profileData?.exams || [])
  const mergedSummary = invoices.length > 0 ? summary : (profileData?.summary ? { ...summary, totalInvoiced: profileData.summary.totalInvoiced, totalPaid: profileData.summary.totalPaid, openBalance: profileData.summary.openBalance } : summary)

  const renderEventCard = (event: TeamupEvent) => {
    const module = parseModuleFromTitle(event.title)
    const teacher = getTeacherName(event.subcalendar_ids)
    const startDt = new Date(event.start_dt)
    const endDt = new Date(event.end_dt)
    const dateStr = startDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const startTime = startDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const endTime = endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const isPast = startDt < new Date()
    const hasAttendance = event.id in attendanceMap
    const isPresent = attendanceMap[event.id]

    return (
      <div key={event.id} className={`flex items-center justify-between p-3 rounded-lg border ${
        isPast ? (hasAttendance ? (isPresent ? 'bg-green-50/50 dark:bg-green-950/10 border-green-200' : 'bg-red-50/50 dark:bg-red-950/10 border-red-200') : '') : 'bg-blue-50/50 dark:bg-blue-950/10 border-blue-200'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          {isPast && hasAttendance ? (
            isPresent ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          ) : isPast ? <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" /> : <CalendarDays className="h-4 w-4 text-blue-600 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{event.title}</p>
            <p className="text-xs text-muted-foreground">{dateStr} {startTime} - {endTime}{teacher ? ` with ${teacher}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasAttendance && <Badge variant={isPresent ? 'default' : 'destructive'} className="text-xs">{isPresent ? 'Present' : 'Absent'}</Badge>}
          {module && <Badge variant="outline" className="text-xs">M{module}</Badge>}
        </div>
      </div>
    )
  }

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header — same as group profile */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/students"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Students</Link>
        </Button>

        <div className="space-y-4">
          <div className="flex items-center gap-5 min-w-0">
            <StudentAvatar
              src={data?.localStudent?.avatarImage || null}
              name={displayName}
              size={96}
              className="shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="text-3xl font-bold truncate leading-tight">{displayName}</h1>
                {data?.vehicleType === 'truck' ? (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 font-medium shrink-0">
                    <Truck className="h-3.5 w-3.5 mr-1" /> Truck
                  </Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100 font-medium shrink-0">
                    <Car className="h-3.5 w-3.5 mr-1" /> Car
                  </Badge>
                )}
              </div>
              <a href={`tel:+${phone}`} className="text-muted-foreground hover:text-primary flex items-center gap-1.5 mt-1.5">
                <Phone className="h-4 w-4" /> +{phone}
              </a>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="default" size="sm" asChild>
              <Link href={`/scheduling?bookFor=${encodeURIComponent(displayName)}&phone=${encodeURIComponent(phone)}`}>
                <CalendarDays className="h-4 w-4 mr-1" /> Book Class
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/certificate?studentName=${encodeURIComponent(displayName)}&studentPhone=${encodeURIComponent(phone)}`}>
                <Award className="h-4 w-4 mr-1" /> Certificate
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoice?studentName=${encodeURIComponent(student.full_name)}&studentPhone=${encodeURIComponent(student.phone_number)}&studentAddress=${encodeURIComponent(student.full_address || '')}&studentCity=${encodeURIComponent(student.city || '')}&studentPostalCode=${encodeURIComponent(student.postal_code || '')}&studentEmail=${encodeURIComponent(data.localStudent?.email || student.email || "")}`}>
                <Receipt className="h-4 w-4 mr-1" /> Invoice
              </Link>
            </Button>
            <AttendanceSheetButton phone={phone} />
          </div>
        </div>
      </motion.div>

      {/* Info Cards — same 6-column layout */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.25 }} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {groups.length > 0 ? (
          <Link href={`/groups/${encodeURIComponent(groups[0].groupId)}`} className="p-3 border rounded-lg text-center hover:bg-accent/50 transition-colors cursor-pointer block">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Group</p>
            <p className="font-medium text-sm truncate text-primary">{groups[0].groupName}</p>
          </Link>
        ) : (
          <div className="p-3 border rounded-lg text-center">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Group</p>
            <p className="font-medium text-sm text-muted-foreground">None</p>
          </div>
        )}
        <div className="p-3 border rounded-lg text-center">
          <Shield className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="font-medium text-sm">{student.status || 'Active'}</p>
        </div>
        <div className="p-3 border rounded-lg text-center">
          <CalendarDays className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Classes</p>
          <p className="font-medium text-sm">{studentEvents.length}</p>
        </div>
        <div className="p-3 border rounded-lg text-center">
          <GraduationCap className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Attendance</p>
          <p className="font-medium text-sm">{Object.keys(attendanceMap).length > 0 ? `${Math.round((Object.values(attendanceMap).filter(v => v).length / Object.keys(attendanceMap).length) * 100)}%` : '-'}</p>
        </div>
        <div className="p-3 border rounded-lg text-center">
          <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Invoiced</p>
          <p className="font-medium text-sm">${mergedSummary.totalInvoiced.toFixed(2)}</p>
        </div>
        <div className={`p-3 border rounded-lg text-center ${mergedSummary.openBalance > 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : ''}`}>
          <CreditCard className={`h-5 w-5 mx-auto mb-1 ${mergedSummary.openBalance > 0 ? 'text-amber-600' : 'text-green-600'}`} />
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className={`font-medium text-sm ${mergedSummary.openBalance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {mergedSummary.openBalance > 0 ? `$${mergedSummary.openBalance.toFixed(2)}` : 'Paid up'}
          </p>
        </div>
      </motion.div>

      {/* Database Profile Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.25 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5" /> Student Profile
              <Badge variant="outline" className="ml-auto text-xs text-blue-600 border-blue-200">Matched from DB</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div><p className="text-xs text-muted-foreground">Full Name</p><p className="font-medium">{student.full_name}</p></div>
                {student.permit_number && (
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Permit Number</p><p className="text-sm">{student.permit_number}</p></div>
                  </div>
                )}
                {(student.contract_number || student.user_defined_contract_number) && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Contract #</p><p className="text-sm">{student.user_defined_contract_number || student.contract_number}</p></div>
                  </div>
                )}
                {student.dob && student.dob !== '0000-00-00' && (
                  <div><p className="text-xs text-muted-foreground">Date of Birth</p><p className="text-sm">{new Date(student.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
                )}
              </div>
              <div className="space-y-3">
                {(() => {
                  const effectiveEmail = data.localStudent?.email || student.email || ''
                  return (
                    <div className="flex items-start gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Email</p>
                        {editingEmail ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <Input
                              type="email"
                              value={emailInput}
                              onChange={e => setEmailInput(e.target.value)}
                              placeholder="student@example.com"
                              className="h-7 text-sm"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') emailMutation.mutate(emailInput.trim())
                                if (e.key === 'Escape') setEditingEmail(false)
                              }}
                            />
                            <Button size="sm" className="h-7 px-2" disabled={emailMutation.isPending} onClick={() => emailMutation.mutate(emailInput.trim())}>
                              {emailMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingEmail(false)} disabled={emailMutation.isPending}>Cancel</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p className="text-sm">{effectiveEmail || <span className="text-muted-foreground italic">none set</span>}</p>
                            <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => { setEmailInput(effectiveEmail); setEditingEmail(true) }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {emailMutation.isError && (
                          <p className="text-xs text-red-600 mt-1">{emailMutation.error?.message || 'Failed to save'}</p>
                        )}
                      </div>
                    </div>
                  )
                })()}
                {(student.full_address || student.city) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div><p className="text-xs text-muted-foreground">Address</p><p className="text-sm">{[student.full_address, student.city, student.postal_code].filter(Boolean).join(', ')}</p></div>
                  </div>
                )}
                {student.status && (
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="secondary" className="text-xs mt-0.5">{student.status}</Badge></div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Medical Declaration (SAAQ 6224A) */}
      {data.registration && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.25 }}>
          <MedicalDeclarationCard
            medical={data.registration.medical}
            studentId={studentId}
            studentName={data.student.full_name}
          />
        </motion.div>
      )}

      {/* Certificate Info */}
      {data.localStudent && data.localStudent.certificates.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.25 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Award className="h-5 w-5" /> Certificate Info
                <Badge variant="secondary" className="ml-auto text-xs">{data.localStudent.certificates.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.localStudent.certificates.map(cert => (
                  <div key={cert.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cert.certificateType === 'full' ? 'bg-green-100 dark:bg-green-950' : 'bg-blue-100 dark:bg-blue-950'}`}>
                        <GraduationCap className={`h-4 w-4 ${cert.certificateType === 'full' ? 'text-green-600' : 'text-blue-600'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{cert.certificateType === 'full' ? 'Full Certificate' : 'Learners Certificate'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(cert.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        <div className="flex flex-wrap gap-x-3 mt-0.5">
                          {cert.contractNumber && <p className="text-xs"><span className="text-muted-foreground">Contract: </span><span className="font-mono font-medium">{cert.contractNumber}</span></p>}
                          {cert.attestationNumber && <p className="text-xs"><span className="text-muted-foreground">Attestation: </span><span className="font-mono font-medium">{cert.attestationNumber}</span></p>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Upcoming Classes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.25 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" /> Upcoming Classes
              {upcomingEvents.length > 0 && <Badge variant="secondary" className="ml-auto">{upcomingEvents.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin mr-2" /><span className="text-muted-foreground">Loading schedule...</span></div>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No upcoming classes scheduled</p>
            ) : (
              <div className="space-y-2">{upcomingEvents.map(renderEventCard)}</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Past Classes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.25 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" /> Past Classes
              {pastEvents.length > 0 && <Badge variant="secondary" className="ml-auto">{pastEvents.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin mr-2" /><span className="text-muted-foreground">Loading...</span></div>
            ) : pastEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No past classes found</p>
            ) : (
              <div className="space-y-2">
                {pastEvents.slice(0, 20).map(renderEventCard)}
                {pastEvents.length > 20 && <p className="text-sm text-muted-foreground text-center pt-2">Showing 20 of {pastEvents.length} past classes</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Invoice History */}
      {mergedInvoices.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.25 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Receipt className="h-5 w-5" /> Invoice History
                  <Badge variant="secondary">{mergedInvoices.length}</Badge>
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    Total: {formatCurrency(mergedSummary.totalInvoiced)} | Paid: {formatCurrency(mergedSummary.totalPaid)}
                  </span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingBalance(true)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit balance
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mergedInvoices.map(inv => {
                  let lineItems: Array<{ description: string; quantity: number; unitPrice: number }> = []
                  try { lineItems = JSON.parse(inv.lineItems) } catch { /* skip */ }
                  const isExpanded = expandedInvoice === inv.id

                  return (
                    <div key={inv.id}>
                      <div
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">Invoice #{inv.invoiceNumber}</p>
                            <p className="text-xs text-muted-foreground">{inv.invoiceDate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium text-sm">{formatCurrency(inv.total)}</span>
                          <Badge variant={inv.paymentStatus === 'paid' ? 'default' : inv.paymentStatus === 'refunded' ? 'secondary' : 'outline'}
                            className={`text-xs ${inv.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : inv.paymentStatus === 'refunded' ? 'bg-purple-100 text-purple-800' : 'text-orange-600'}`}>
                            {inv.paymentStatus}
                          </Badge>
                          {lineItems.length > 0 && (isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                        </div>
                      </div>
                      {isExpanded && lineItems.length > 0 && (
                        <div className="ml-7 mr-3 mt-1 mb-2 p-2 bg-muted/30 rounded text-xs">
                          <table className="w-full">
                            <thead><tr className="text-muted-foreground"><th className="text-left py-1">Item</th><th className="text-center py-1">Qty</th><th className="text-right py-1">Price</th><th className="text-right py-1">Total</th></tr></thead>
                            <tbody>
                              {lineItems.map((item, idx) => (
                                <tr key={idx} className="border-t border-muted">
                                  <td className="py-1">{item.description}</td>
                                  <td className="text-center py-1">{item.quantity}</td>
                                  <td className="text-right py-1">${item.unitPrice.toFixed(2)}</td>
                                  <td className="text-right py-1">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/invoice?studentName=${encodeURIComponent(student.full_name)}&studentPhone=${encodeURIComponent(student.phone_number)}&studentAddress=${encodeURIComponent(student.full_address || '')}&studentCity=${encodeURIComponent(student.city || '')}&studentPostalCode=${encodeURIComponent(student.postal_code || '')}&studentEmail=${encodeURIComponent(data.localStudent?.email || student.email || "")}`}>
                      <Plus className="h-4 w-4 mr-1" /> Create Invoice
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Exam Results */}
      {mergedExams && mergedExams.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.25 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5" /> Exam Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mergedExams.map(exam => {
                  const isFinished = exam.passed !== null
                  const rowClass = `flex items-center justify-between p-3 rounded-lg transition-colors ${
                    exam.passed ? 'bg-green-50 dark:bg-green-950/10 border border-green-200' :
                    exam.passed === false ? 'bg-red-50 dark:bg-red-950/10 border border-red-200' : 'bg-muted/50 border'
                  } ${isFinished ? 'hover:brightness-95 dark:hover:brightness-110 cursor-pointer' : ''}`
                  const inner = (
                    <>
                      <div>
                        <p className="font-medium text-sm">{exam.groupName}</p>
                        <p className="text-xs text-muted-foreground">
                          Code: {exam.examCode} — {exam.submittedAt ? new Date(exam.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'In progress'}
                          {exam.timeExpired && ' (time expired)'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {exam.score !== null && <span className="font-mono font-bold text-sm">{exam.score}/{exam.totalQuestions}</span>}
                        {exam.passed === true && <Badge className="bg-green-600">Passed</Badge>}
                        {exam.passed === false && <Badge variant="destructive">Failed</Badge>}
                        {exam.passed === null && <Badge variant="secondary">In Progress</Badge>}
                        {isFinished && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </>
                  )
                  return isFinished ? (
                    <Link key={exam.id} href={`/exam/review/${exam.id}`} className={rowClass}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={exam.id} className={rowClass}>{inner}</div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Edit Balance Dialog — updates the latest invoice's remainingBalance. */}
      <Dialog open={editingBalance} onOpenChange={(o) => {
        if (!o) { setEditingBalance(false); setBalanceError(null) }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Open Balance</DialogTitle>
            <DialogDescription>
              Sets the remaining balance on the student&apos;s most recent invoice.
              Use <code className="px-1 rounded bg-muted">0</code> to mark them as fully paid up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              <p className="text-muted-foreground">Current open balance</p>
              <p className="text-2xl font-bold">${mergedSummary.openBalance.toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-sm">New balance ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={newBalanceInput}
                onChange={(e) => setNewBalanceInput(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            {balanceError && <p className="text-sm text-destructive">{balanceError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditingBalance(false)} disabled={balanceSaving}>Cancel</Button>
              <Button
                disabled={balanceSaving || newBalanceInput === '' || isNaN(parseFloat(newBalanceInput)) || parseFloat(newBalanceInput) < 0}
                onClick={async () => {
                  const value = parseFloat(newBalanceInput)
                  const latest = mergedInvoices[0]
                  if (!latest) {
                    setBalanceError('No invoice found for this student to update')
                    return
                  }
                  setBalanceSaving(true)
                  setBalanceError(null)
                  try {
                    const res = await fetch(`/api/invoice/${encodeURIComponent(latest.id)}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ remainingBalance: value }),
                    })
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}))
                      throw new Error(data.error || `Save failed (${res.status})`)
                    }
                    setEditingBalance(false)
                    setNewBalanceInput('')
                    // Refresh both the studentId-keyed query and the profile query
                    queryClient.invalidateQueries({ queryKey: ['student-profile', studentId] })
                    queryClient.invalidateQueries({ queryKey: ['student-profile-extra'] })
                  } catch (err) {
                    setBalanceError(err instanceof Error ? err.message : 'Failed to save')
                  } finally {
                    setBalanceSaving(false)
                  }
                }}
                className="min-w-[80px]"
              >
                {balanceSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Medical Declaration card — collapsible, with PDF download (SAAQ form 6224A)
// ---------------------------------------------------------------------------
const SAAQ_CONDITIONS_SHORT = [
  'Glasses or contact lenses to drive',
  'Eye disease or disorder',
  'Hearing impairment + commercial driving',
  'Vertigo restricting activities',
  'Heart disease restricting activities',
  'Excessive sleepiness from sleep disorder',
  'Significant movement limitations (neck/hands/feet)',
  'Serious psychiatric disorder',
  'Substance use disorder',
  'Cognitive impairment (dementia, Alzheimer\'s, etc.)',
  'Epileptic seizures',
  'Neurological condition restricting activities',
  'Loss of consciousness in past 12 months',
  'Insulin-treated diabetes',
  'Lung disease restricting activities',
  'Deterioration of functional abilities',
  'Daily medication causing drowsiness',
]

function MedicalDeclarationCard({
  medical,
  studentId,
  studentName,
}: {
  medical: string | null
  studentId: string
  studentName: string
}) {
  const [open, setOpen] = useState(false)

  let parsed: { conditions?: number[]; none?: boolean; attestedAt?: string | null } | null = null
  if (medical) {
    try { parsed = JSON.parse(medical) } catch { parsed = null }
  }
  const conditions = parsed?.conditions || []
  const none = !!parsed?.none
  const hasData = !!medical && (none || conditions.length > 0)
  const isFlagged = conditions.length > 0

  const downloadName = `medical-${(studentName || 'student').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <HeartPulse className={`h-5 w-5 ${isFlagged ? 'text-amber-600' : 'text-emerald-600'}`} />
          Medical Declaration
          <span className="text-xs font-normal text-muted-foreground ml-1">(SAAQ 6224A)</span>
          {hasData ? (
            isFlagged ? (
              <Badge className="ml-auto bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {conditions.length} declared
              </Badge>
            ) : (
              <Badge className="ml-auto bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                None declared
              </Badge>
            )
          ) : (
            <Badge variant="secondary" className="ml-auto text-xs">No data</Badge>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent>
          {!hasData && (
            <p className="text-sm text-muted-foreground">
              No medical declaration on file for this student. (Older registration, before the SAAQ
              6224A step was added.)
            </p>
          )}

          {none && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              ✓ Student declared <strong>no</strong> conditions affecting safe driving.
            </p>
          )}

          {isFlagged && (
            <ul className="space-y-1.5">
              {conditions.map((n) => (
                <li
                  key={n}
                  className="flex items-start gap-3 p-2 rounded-md bg-amber-500/5 border border-amber-500/20"
                >
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0 mt-0.5">
                    {String(n).padStart(2, '0')}
                  </span>
                  <span className="text-sm text-foreground/90">
                    {SAAQ_CONDITIONS_SHORT[n - 1] ?? `Condition ${n}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {parsed?.attestedAt && (
            <p className="text-xs text-muted-foreground mt-3">
              Attested {new Date(parsed.attestedAt).toLocaleString()}
            </p>
          )}

          <div className="mt-4 pt-4 border-t flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Download a pre-filled SAAQ form 6224A as a PDF for your records.
            </p>
            <a
              href={`/api/students/${studentId}/medical-pdf`}
              download={downloadName}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/70 transition-colors border border-foreground/20 hover:border-foreground/40 rounded-md px-3 py-1.5"
            >
              <Download className="h-4 w-4" />
              Download form (PDF)
            </a>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
