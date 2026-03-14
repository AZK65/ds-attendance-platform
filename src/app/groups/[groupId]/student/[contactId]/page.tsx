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
  Receipt,
  DollarSign,
  Database,
  MapPin,
  Mail,
  CreditCard,
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  Award,
  Download,
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

interface DBStudentRecord {
  student_id: number
  full_name: string
  permit_number: string
  full_address: string
  city: string
  postal_code: string
  phone_number: string
  email: string
  contract_number: number
  dob: string
  status: string
  user_defined_contract_number: number | null
}

interface InvoiceRecord {
  id: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string | null
  studentName: string
  lineItems: string
  subtotal: number
  gstAmount: number
  qstAmount: number
  total: number
  notes: string | null
  paymentStatus: string | null
  paymentMethod: string | null
  createdAt: string
}

interface CertificateRecord {
  id: string
  certificateType: string
  contractNumber: string | null
  attestationNumber: string | null
  generatedAt: string
}

interface LocalStudentRecord {
  id: string
  name: string
  licenceNumber: string | null
  phone: string | null
  phoneAlt: string | null
  address: string | null
  municipality: string | null
  province: string | null
  postalCode: string | null
  registrationDate: string | null
  expiryDate: string | null
  module1Date: string | null
  module2Date: string | null
  module3Date: string | null
  module4Date: string | null
  module5Date: string | null
  module6Date: string | null
  module7Date: string | null
  module8Date: string | null
  module9Date: string | null
  module10Date: string | null
  module11Date: string | null
  module12Date: string | null
  sortie1Date: string | null
  sortie2Date: string | null
  sortie3Date: string | null
  sortie4Date: string | null
  sortie5Date: string | null
  sortie6Date: string | null
  sortie7Date: string | null
  sortie8Date: string | null
  sortie9Date: string | null
  sortie10Date: string | null
  sortie11Date: string | null
  sortie12Date: string | null
  sortie13Date: string | null
  sortie14Date: string | null
  sortie15Date: string | null
  certificates: CertificateRecord[]
}

interface TheoryClassRecord {
  moduleNumber: number
  date: string
  groupId: string
  meetingUUID: string
  zoomName: string
}

interface StudentProfileData {
  dbStudent: DBStudentRecord | null
  localStudent: LocalStudentRecord | null
  invoices: InvoiceRecord[]
  summary: {
    totalInvoiced: number
    totalPaid: number
    openBalance: number
    invoiceCount: number
    lastInvoiceDate: string | null
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

  // Fetch hybrid student profile (external DB match + local invoices)
  const { data: profileData, isLoading: loadingProfile } = useQuery<StudentProfileData>({
    queryKey: ['student-profile', phone, displayName],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('phone', phone)
      if (displayName && displayName !== phone) params.set('name', displayName)
      const res = await fetch(`/api/students/profile?${params}`)
      if (!res.ok) throw new Error('Failed to fetch profile')
      return res.json()
    },
    enabled: !!phone,
  })

  // Fetch theory class dates from Zoom attendance records
  const { data: theoryClasses = [], isLoading: loadingTheory } = useQuery<TheoryClassRecord[]>({
    queryKey: ['student-theory', phone, displayName],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('phone', phone)
      if (displayName && displayName !== phone) params.set('name', displayName)
      const res = await fetch(`/api/scheduling/student-theory?${params}`)
      if (!res.ok) throw new Error('Failed to fetch theory classes')
      return res.json()
    },
    enabled: !!phone,
  })

  const [downloadingCert, setDownloadingCert] = useState<string | null>(null)

  // Build module dates from Teamup past classes (in-car) + Zoom theory classes (modules)
  const moduleDatesFromClasses = useMemo(() => {
    const dates: Record<string, string> = {}

    // 1. Theory module dates from Zoom attendance records
    for (const tc of theoryClasses) {
      const d = new Date(tc.date)
      const dateStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`
      if (tc.moduleNumber >= 1 && tc.moduleNumber <= 12) {
        dates[`module${tc.moduleNumber}Date`] = dateStr
      }
    }

    // 2. In-car session dates from Teamup events (past only)
    const now = new Date()
    const completedEvents = studentEvents
      .filter(e => new Date(e.start_dt) < now)
      .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

    for (const event of completedEvents) {
      const parsed = parseModuleFromTitle(event.title)
      if (!parsed.module) continue

      const eventDate = new Date(event.start_dt)
      const dateStr = `${(eventDate.getMonth() + 1).toString().padStart(2, '0')}/${eventDate.getDate().toString().padStart(2, '0')}/${eventDate.getFullYear()}`

      if (parsed.module.startsWith('S')) {
        const sNum = parseInt(parsed.module.slice(1))
        if (sNum >= 1 && sNum <= 15) {
          dates[`sortie${sNum}Date`] = dateStr
        }
      } else {
        // Teamup module events (if any) — Zoom data takes priority so only set if not already there
        const mNum = parseInt(parsed.module)
        if (mNum >= 1 && mNum <= 12 && !dates[`module${mNum}Date`]) {
          dates[`module${mNum}Date`] = dateStr
        }
      }
    }
    return dates
  }, [studentEvents, theoryClasses])

  const handleDownloadCertificate = async (cert: CertificateRecord) => {
    if (!profileData?.localStudent) return
    setDownloadingCert(cert.id)
    try {
      const res = await fetch('/api/certificate/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: profileData.localStudent.id,
          certificateId: cert.id,
          certificateType: cert.certificateType,
          moduleDates: moduleDatesFromClasses,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Failed to generate certificate')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const typeSuffix = cert.certificateType === 'phase1' ? 'learners' : 'full'
      a.download = `certificate-${displayName}-${typeSuffix}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Certificate download error:', error)
      alert(error instanceof Error ? error.message : 'Failed to download certificate')
    } finally {
      setDownloadingCert(null)
    }
  }

  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)

  // Split events into upcoming and past, merge theory classes into past
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

    // Add theory classes from Zoom attendance as synthetic events
    for (const tc of theoryClasses) {
      const tcDate = new Date(tc.date)
      // Don't add if already in the past list (avoid duplicates with Teamup events)
      const alreadyExists = past.some(e => {
        const parsed = parseModuleFromTitle(e.title)
        return parsed.module === String(tc.moduleNumber) &&
          Math.abs(new Date(e.start_dt).getTime() - tcDate.getTime()) < 24 * 60 * 60 * 1000
      })
      if (!alreadyExists) {
        past.push({
          id: `theory-${tc.moduleNumber}-${tc.meetingUUID}`,
          title: `M${tc.moduleNumber} - ${displayName}`,
          start_dt: tc.date,
          end_dt: tc.date,
          subcalendar_ids: [],
          notes: `Zoom Theory Class\nModule ${tc.moduleNumber}\nZoom Name: ${tc.zoomName}`,
        })
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

  const isLoading = loadingGroup || loadingEvents || loadingAttendance || loadingTheory

  // Render an event card
  const renderEventCard = (event: TeamupEvent) => {
    const parsed = parseModuleFromTitle(event.title)
    const phaseInfo = parsed.module ? getPhaseInfo(parsed.module) : null
    const isExtraHours = parseExtraHoursFromNotes(event.notes)
    const isTheoryClass = event.id.startsWith('theory-')

    return (
      <div
        key={event.id}
        onClick={() => !isTheoryClass && router.push(`/scheduling?eventId=${encodeURIComponent(event.id)}`)}
        className={`flex items-center gap-4 p-3 border rounded-lg transition-colors ${
          isTheoryClass ? '' : 'cursor-pointer hover:bg-accent/50'
        }`}
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
            {isTheoryClass && (
              <Badge variant="outline" className="text-xs border-indigo-200 text-indigo-700 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300">
                Zoom
              </Badge>
            )}
            {isExtraHours && (
              <Badge variant="outline" className="text-xs">Extra Hours</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {!isTheoryClass && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime12h(event.start_dt)} - {formatTime12h(event.end_dt)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {isTheoryClass ? 'Theory (Zoom)' : getTeacherName(event.subcalendar_ids)}
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
            <div className="flex gap-2 flex-wrap">
              <Button variant="default" size="sm" asChild>
                <Link href={`/scheduling?bookFor=${encodeURIComponent(displayName)}&phone=${encodeURIComponent(phone)}`}>
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Book Class
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/certificate?studentName=${encodeURIComponent(displayName)}&studentPhone=${encodeURIComponent(phone)}`}>
                  <Award className="h-4 w-4 mr-1" />
                  Certificate
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/invoice?studentName=${encodeURIComponent(profileData?.dbStudent?.full_name || displayName)}&studentPhone=${encodeURIComponent(phone)}${profileData?.dbStudent ? `&studentAddress=${encodeURIComponent(profileData.dbStudent.full_address || '')}&studentCity=${encodeURIComponent(profileData.dbStudent.city || '')}&studentPostalCode=${encodeURIComponent(profileData.dbStudent.postal_code || '')}&studentEmail=${encodeURIComponent(profileData.dbStudent.email || '')}` : ''}`}>
                  <Receipt className="h-4 w-4 mr-1" />
                  Invoice
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
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        >
          <Link href={`/groups/${encodeURIComponent(groupId)}`} className="p-3 border rounded-lg text-center hover:bg-accent/50 transition-colors cursor-pointer block">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Group</p>
            <p className="font-medium text-sm truncate text-primary">{groupData?.group?.name || '-'}</p>
          </Link>
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
          <div className="p-3 border rounded-lg text-center">
            <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Invoiced</p>
            <p className="font-medium text-sm">
              {loadingProfile ? '...' : `$${(profileData?.summary?.totalInvoiced || 0).toFixed(2)}`}
            </p>
          </div>
          <div className={`p-3 border rounded-lg text-center ${
            !loadingProfile && (profileData?.summary?.openBalance || 0) > 0
              ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
              : ''
          }`}>
            <CreditCard className={`h-5 w-5 mx-auto mb-1 ${
              !loadingProfile && (profileData?.summary?.openBalance || 0) > 0
                ? 'text-amber-600'
                : 'text-green-600'
            }`} />
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className={`font-medium text-sm ${
              !loadingProfile && (profileData?.summary?.openBalance || 0) > 0
                ? 'text-amber-700'
                : 'text-green-700'
            }`}>
              {loadingProfile ? '...' : (profileData?.summary?.openBalance || 0) > 0
                ? `$${(profileData?.summary?.openBalance || 0).toFixed(2)}`
                : 'Paid up'}
            </p>
          </div>
        </motion.div>
      )}

      {/* Database Profile Card */}
      {profileData?.dbStudent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5" />
                Student Profile
                <Badge variant="outline" className="ml-auto text-xs text-blue-600 border-blue-200">
                  Matched from DB
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Full Name</p>
                    <p className="font-medium">{profileData.dbStudent.full_name}</p>
                  </div>
                  {profileData.dbStudent.permit_number && (
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Permit Number</p>
                        <p className="text-sm">{profileData.dbStudent.permit_number}</p>
                      </div>
                    </div>
                  )}
                  {profileData.dbStudent.contract_number && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Contract #</p>
                        <p className="text-sm">
                          {profileData.dbStudent.user_defined_contract_number || profileData.dbStudent.contract_number}
                        </p>
                      </div>
                    </div>
                  )}
                  {profileData.dbStudent.dob && (
                    <div>
                      <p className="text-xs text-muted-foreground">Date of Birth</p>
                      <p className="text-sm">{new Date(profileData.dbStudent.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {profileData.dbStudent.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm">{profileData.dbStudent.email}</p>
                      </div>
                    </div>
                  )}
                  {(profileData.dbStudent.full_address || profileData.dbStudent.city) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Address</p>
                        <p className="text-sm">
                          {[profileData.dbStudent.full_address, profileData.dbStudent.city, profileData.dbStudent.postal_code].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}
                  {profileData.dbStudent.status && (
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Badge variant="secondary" className="text-xs mt-0.5">
                        {profileData.dbStudent.status}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Add to Database prompt (when no DB match found) */}
      {!loadingProfile && profileData && !profileData.dbStudent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
        >
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Not in database</p>
                  <p className="text-xs text-muted-foreground">This student hasn&apos;t been added to the external database yet</p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/students?prefill=true&name=${encodeURIComponent(displayName)}&phone=${encodeURIComponent(phone)}`}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add to Database
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Certificate Info */}
      {!loadingProfile && profileData?.localStudent && profileData.localStudent.certificates.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.25 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Award className="h-5 w-5" />
                Certificate Info
                <Badge variant="secondary" className="ml-auto text-xs">
                  {profileData.localStudent.certificates.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {profileData.localStudent.certificates.map((cert) => {
                  // Check if this certificate has the required dates saved
                  const ls = profileData.localStudent!
                  const hasPhase1Dates = !!(ls.module1Date || ls.module2Date || ls.module3Date || ls.module4Date || ls.module5Date || moduleDatesFromClasses.module1Date || moduleDatesFromClasses.module2Date || moduleDatesFromClasses.module3Date || moduleDatesFromClasses.module4Date || moduleDatesFromClasses.module5Date)
                  const hasFullDates = hasPhase1Dates && !!(ls.module6Date || ls.module12Date || ls.sortie1Date || ls.sortie15Date || moduleDatesFromClasses.module6Date || moduleDatesFromClasses.module12Date || moduleDatesFromClasses.sortie1Date || moduleDatesFromClasses.sortie15Date)
                  const canDownload = cert.certificateType === 'phase1' ? hasPhase1Dates : hasFullDates
                  const isDownloading = downloadingCert === cert.id

                  return (
                    <div key={cert.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          cert.certificateType === 'full'
                            ? 'bg-green-100 dark:bg-green-950'
                            : 'bg-blue-100 dark:bg-blue-950'
                        }`}>
                          <GraduationCap className={`h-4 w-4 ${
                            cert.certificateType === 'full' ? 'text-green-600' : 'text-blue-600'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {cert.certificateType === 'full' ? 'Full Certificate' : 'Learners Certificate'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(cert.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <div className="flex flex-wrap gap-x-3 mt-0.5">
                            {cert.contractNumber && (
                              <p className="text-xs">
                                <span className="text-muted-foreground">Contract: </span>
                                <span className="font-mono font-medium">{cert.contractNumber}</span>
                              </p>
                            )}
                            {cert.attestationNumber && (
                              <p className="text-xs">
                                <span className="text-muted-foreground">Attestation: </span>
                                <span className="font-mono font-medium">{cert.attestationNumber}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canDownload || isDownloading}
                        onClick={() => handleDownloadCertificate(cert)}
                        title={canDownload ? 'Download certificate' : 'No date information saved — generate the certificate first'}
                        className="flex-shrink-0"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )
                })}
                {/* Info about date sources */}
                {Object.keys(moduleDatesFromClasses).length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {Object.keys(moduleDatesFromClasses).length} dates auto-populated
                    {theoryClasses.length > 0 && ` (${theoryClasses.length} theory modules from Zoom)`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
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
      {/* Invoice History */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.25 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5" />
              Invoice History
              {(profileData?.summary?.invoiceCount || 0) > 0 && (
                <Badge variant="secondary" className="ml-auto">{profileData?.summary?.invoiceCount}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingProfile ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading invoices...</span>
              </div>
            ) : !profileData?.invoices?.length ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-3">No invoices found</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/invoice?studentName=${encodeURIComponent(displayName)}&studentPhone=${encodeURIComponent(phone)}`}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create Invoice
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Invoiced</p>
                    <p className="text-lg font-bold">${profileData.summary.totalInvoiced.toFixed(2)}</p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="text-lg font-bold text-green-700">${(profileData.summary.totalPaid || 0).toFixed(2)}</p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${
                    (profileData.summary.openBalance || 0) > 0
                      ? 'bg-amber-50 dark:bg-amber-950/30'
                      : 'bg-green-50 dark:bg-green-950/30'
                  }`}>
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className={`text-lg font-bold ${
                      (profileData.summary.openBalance || 0) > 0 ? 'text-amber-700' : 'text-green-700'
                    }`}>
                      {(profileData.summary.openBalance || 0) > 0
                        ? `$${profileData.summary.openBalance.toFixed(2)}`
                        : 'Paid up'}
                    </p>
                  </div>
                </div>

                {/* Invoice List */}
                <div className="border rounded-lg overflow-hidden">
                  {profileData.invoices.map((invoice) => {
                    const isExpanded = expandedInvoice === invoice.id
                    let lineItems: { description: string; quantity: number; unitPrice: number }[] = []
                    try {
                      lineItems = typeof invoice.lineItems === 'string' ? JSON.parse(invoice.lineItems) : invoice.lineItems
                    } catch { /* ignore parse errors */ }

                    return (
                      <div key={invoice.id} className="border-b last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setExpandedInvoice(isExpanded ? null : invoice.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-accent/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-mono text-sm font-medium">{invoice.invoiceNumber}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(invoice.invoiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {invoice.paymentStatus === 'paid' ? (
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Paid</Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 border-amber-200 text-[10px]">Unpaid</Badge>
                            )}
                            <span className="font-medium">${invoice.total.toFixed(2)}</span>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>
                        {isExpanded && lineItems.length > 0 && (
                          <div className="px-3 pb-3 border-t bg-muted/20">
                            <table className="w-full text-sm mt-2">
                              <thead>
                                <tr className="text-xs text-muted-foreground">
                                  <th className="text-left py-1">Item</th>
                                  <th className="text-center py-1">Qty</th>
                                  <th className="text-right py-1">Price</th>
                                  <th className="text-right py-1">Total</th>
                                </tr>
                              </thead>
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
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-muted">
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/invoice/${invoice.id}`}>
                                  <FileText className="h-3 w-3 mr-1" />
                                  View Invoice
                                </Link>
                              </Button>
                              <div className="text-xs text-muted-foreground space-x-4">
                                <span>Subtotal: ${invoice.subtotal.toFixed(2)}</span>
                                {invoice.gstAmount > 0 && <span>GST: ${invoice.gstAmount.toFixed(2)}</span>}
                                {invoice.qstAmount > 0 && <span>QST: ${invoice.qstAmount.toFixed(2)}</span>}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Create Invoice Button */}
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/invoice?studentName=${encodeURIComponent(profileData?.dbStudent?.full_name || displayName)}&studentPhone=${encodeURIComponent(phone)}${profileData?.dbStudent ? `&studentAddress=${encodeURIComponent(profileData.dbStudent.full_address || '')}&studentCity=${encodeURIComponent(profileData.dbStudent.city || '')}&studentPostalCode=${encodeURIComponent(profileData.dbStudent.postal_code || '')}&studentEmail=${encodeURIComponent(profileData.dbStudent.email || '')}` : ''}`}>
                      <Plus className="h-4 w-4 mr-1" />
                      Create Invoice
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  )
}
