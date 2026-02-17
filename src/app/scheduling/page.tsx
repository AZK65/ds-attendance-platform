'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Trash2,
  Phone,
  User,
  Users,
  Clock,
  Edit3,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  BookOpen,
  DollarSign,
  Clock4,
  Eye,
  Truck,
  MapPin,
  X,
  Printer,
  FileText,
  ArrowLeft,
  Settings,
  Save,
  Check,
  Download,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'
import { ContactSearchAutocomplete, type StudentGroupInfo } from '@/components/ContactSearchAutocomplete'

type ViewMode = 'day' | 'week' | 'month'

interface SubCalendar {
  id: number
  name: string
  active: boolean
  color: number
  overlap?: boolean
}

interface TeamupEvent {
  id: string
  title: string
  start_dt: string
  end_dt: string
  subcalendar_ids: number[]
  notes?: string
  all_day?: boolean
}

interface EventFormData {
  module: string
  title: string
  subcalendarId: string
  date: string
  startTime: string
  endTime: string
  studentName: string
  studentPhone: string
  group: string
  lastTheoryModule: number | null
  lastTheoryDate: string | null
  isExtraHours: boolean
  isPaid: boolean
  customNotes: string
}

const initialFormData: EventFormData = {
  module: '',
  title: '',
  subcalendarId: '',
  date: '',
  startTime: '09:00',
  endTime: '10:00',
  studentName: '',
  studentPhone: '',
  group: '',
  lastTheoryModule: null,
  lastTheoryDate: null,
  isExtraHours: false,
  isPaid: false,
  customNotes: '',
}

interface TruckClassRow {
  date: string
  startTime: string
  endTime: string
  isExam: boolean
  examLocation: string
  classNumber: number | null
}

const EXAM_LOCATIONS = ['Laval', 'Joliette', 'Saint-Jérôme', 'Longueuil']

const emptyTruckRow = (classNumber: number | null = null): TruckClassRow => ({
  date: '',
  startTime: '09:00',
  endTime: '10:00',
  isExam: false,
  examLocation: '',
  classNumber,
})

interface TruckFormData {
  studentName: string
  studentPhone: string
  transmission: 'auto' | 'manual'
  classes: TruckClassRow[]
}

// Bulk car class interfaces
interface CarClassRow {
  date: string
  startTime: string
  endTime: string
  module: string
  subcalendarId: string
}

interface CarBulkFormData {
  studentName: string
  studentPhone: string
  group: string
  lastTheoryModule: number | null
  lastTheoryDate: string | null
  isExtraHours: boolean
  isPaid: boolean
  customNotes: string
  classes: CarClassRow[]
}

const emptyCarRow = (): CarClassRow => ({
  date: '',
  startTime: '09:00',
  endTime: '10:00',
  module: '',
  subcalendarId: '',
})

const MODULE_OPTIONS = [
  { value: 'S1', label: 'Session 1 (In-Car)' },
  { value: 'S2', label: 'Session 2 (In-Car)' },
  { value: 'S3', label: 'Session 3 (In-Car)' },
  { value: 'S4', label: 'Session 4 (In-Car)' },
  { value: 'S5', label: 'Session 5 (In-Car)' },
  { value: 'S6', label: 'Session 6 (In-Car)' },
  { value: 'S7', label: 'Session 7 (In-Car)' },
  { value: 'S8', label: 'Session 8 (In-Car)' },
  { value: 'S9', label: 'Session 9 (In-Car)' },
  { value: 'S10', label: 'Session 10 (In-Car)' },
  { value: 'S11', label: 'Session 11 (In-Car)' },
  { value: 'S12', label: 'Session 12 (In-Car)' },
  { value: 'S13', label: 'Session 13 (In-Car)' },
  { value: 'S14', label: 'Session 14 (In-Car)' },
  { value: 'S15', label: 'Session 15 (In-Car)' },
]

// Teamup has 48 color IDs — comprehensive map
const TEAMUP_COLORS: Record<number, string> = {
  1: '#CC2D30', 2: '#F47B20', 3: '#F5A623', 4: '#8BC34A',
  5: '#4CAF50', 6: '#009688', 7: '#03A9F4', 8: '#2196F3',
  9: '#3F51B5', 10: '#673AB7', 11: '#9C27B0', 12: '#E91E63',
  13: '#F44336', 14: '#FF5722', 15: '#FF9800', 16: '#FFC107',
  17: '#CDDC39', 18: '#66BB6A', 19: '#26A69A', 20: '#29B6F6',
  21: '#42A5F5', 22: '#5C6BC0', 23: '#7E57C2', 24: '#AB47BC',
  25: '#EC407A', 26: '#EF5350', 27: '#FF7043', 28: '#FFA726',
  29: '#FFCA28', 30: '#D4E157', 31: '#9CCC65', 32: '#66BB6A',
  33: '#26C6DA', 34: '#29B6F6', 35: '#5C6BC0', 36: '#7E57C2',
  37: '#BA68C8', 38: '#F06292', 39: '#E57373', 40: '#FF8A65',
  41: '#FFB74D', 42: '#FFD54F', 43: '#AED581', 44: '#81C784',
  45: '#4DB6AC', 46: '#4FC3F7', 47: '#7986CB', 48: '#9575CD',
}

function getColor(colorId: number): string {
  return TEAMUP_COLORS[colorId] || '#3B82F6'
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}, ${monday.getFullYear()}`
}

function formatDayFull(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatTimeDisplay12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDateNice(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_START = 7
const HOUR_END = 21
const HOUR_HEIGHT = 60 // px per hour

export default function SchedulingPage() {
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedTeacher, setSelectedTeacher] = useState<number | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createMode, setCreateMode] = useState<'single' | 'bulk'>('single')
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showEventDetail, setShowEventDetail] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<TeamupEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<TeamupEvent | null>(null)
  const [formData, setFormData] = useState<EventFormData>(initialFormData)
  const [notifyStatus, setNotifyStatus] = useState<null | 'sending' | 'sent' | 'failed'>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [theoryGroupId, setTheoryGroupId] = useState<string | null>(null)

  // Truck class dialog state
  const [showTruckDialog, setShowTruckDialog] = useState(false)
  const [truckForm, setTruckForm] = useState<TruckFormData>({
    studentName: '',
    studentPhone: '',
    transmission: 'manual',
    classes: [emptyTruckRow(1)],
  })
  const [truckCreating, setTruckCreating] = useState(false)
  const [truckNotifyStatus, setTruckNotifyStatus] = useState<null | 'sending' | 'sent' | 'failed'>(null)
  const [truckStep, setTruckStep] = useState<'form' | 'preview'>('form')
  const [truckDuplicateError, setTruckDuplicateError] = useState<string[] | null>(null)

  // Truck schedule viewer (from event detail)
  const [showTruckSchedule, setShowTruckSchedule] = useState(false)
  const [truckScheduleData, setTruckScheduleData] = useState<{ studentName: string; studentPhone: string; classes: TruckClassRow[] } | null>(null)

  // Bulk car class state
  const [carBulkForm, setCarBulkForm] = useState<CarBulkFormData>({
    studentName: '', studentPhone: '', group: '', lastTheoryModule: null, lastTheoryDate: null,
    isExtraHours: false, isPaid: false, customNotes: '', classes: [emptyCarRow()],
  })
  const [carBulkStep, setCarBulkStep] = useState<'form' | 'preview'>('form')
  const [carBulkCreating, setCarBulkCreating] = useState(false)

  // Teacher phone management
  const [showTeacherSettings, setShowTeacherSettings] = useState(false)
  const [teacherPhones, setTeacherPhones] = useState<Record<number, string>>({})
  const [savingTeacherPhones, setSavingTeacherPhones] = useState(false)

  // Export dialog
  type ExportView = 'day' | 'week' | 'month'
  type ExportMode = 'schedule' | 'attendance'
  type ExportFormat = 'pdf' | 'csv'
  type ExportClassType = 'all' | 'car' | 'truck'
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportTeacher, setExportTeacher] = useState<string>('all')
  const [exportView, setExportView] = useState<ExportView>('day')
  const [exportMode, setExportMode] = useState<ExportMode>('schedule')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf')
  const [exportClassType, setExportClassType] = useState<ExportClassType>('all')
  const [exportDate, setExportDate] = useState('')

  // Inline student info edit (in event detail)
  const [editingStudentInfo, setEditingStudentInfo] = useState(false)
  const [editStudentName, setEditStudentName] = useState('')
  const [editStudentPhone, setEditStudentPhone] = useState('')

  // Compute date range based on view mode
  const { startDate, endDate } = useMemo(() => {
    if (viewMode === 'day') {
      return { startDate: new Date(currentDate), endDate: new Date(currentDate) }
    } else if (viewMode === 'week') {
      const monday = getMonday(currentDate)
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      return { startDate: monday, endDate: sunday }
    } else {
      // Month: first day to last day of month
      const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      return { startDate: first, endDate: last }
    }
  }, [viewMode, currentDate])

  // Navigation functions
  const goToPrev = () => {
    const d = new Date(currentDate)
    if (viewMode === 'day') d.setDate(d.getDate() - 1)
    else if (viewMode === 'week') d.setDate(d.getDate() - 7)
    else d.setMonth(d.getMonth() - 1)
    setCurrentDate(d)
  }

  const goToNext = () => {
    const d = new Date(currentDate)
    if (viewMode === 'day') d.setDate(d.getDate() + 1)
    else if (viewMode === 'week') d.setDate(d.getDate() + 7)
    else d.setMonth(d.getMonth() + 1)
    setCurrentDate(d)
  }

  const goToToday = () => setCurrentDate(new Date())

  // Date label for navigation
  const dateLabel = useMemo(() => {
    if (viewMode === 'day') return formatDayFull(currentDate)
    if (viewMode === 'week') return formatWeekRange(getMonday(currentDate))
    return formatMonthYear(currentDate)
  }, [viewMode, currentDate])

  // Fetch sub-calendars (teachers)
  const { data: subcalendars = [], isLoading: loadingTeachers, isError: teachersError } = useQuery<SubCalendar[]>({
    queryKey: ['subcalendars'],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/subcalendars')
      if (!res.ok) throw new Error('Failed to fetch teachers')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const activeTeachers = subcalendars.filter(s => s.active)

  // Fetch events for current date range
  const { data: events = [], isLoading: loadingEvents } = useQuery<TeamupEvent[]>({
    queryKey: ['scheduling-events', formatDate(startDate), formatDate(endDate), selectedTeacher],
    queryFn: async () => {
      let url = `/api/scheduling/events?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`
      if (selectedTeacher) {
        url += `&subcalendarId=${selectedTeacher}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch events')
      return res.json()
    },
  })

  // Fetch attendance data for current events
  const { data: attendanceMap = {} } = useQuery<Record<string, boolean>>({
    queryKey: ['class-attendance', events.map(e => e.id).join(',')],
    queryFn: async () => {
      if (events.length === 0) return {}
      const ids = events.map(e => e.id).join(',')
      const res = await fetch(`/api/scheduling/attendance?eventIds=${ids}`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: events.length > 0,
  })

  // Check if an event is marked present
  const isEventPresent = (eventId: string) => !!attendanceMap[eventId]

  // Fetch teacher phone numbers
  const { data: teacherPhoneData } = useQuery<{ teachers: { subcalendarId: number; name: string; phone: string }[] }>({
    queryKey: ['teacher-phones'],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/teacher-phones')
      if (!res.ok) throw new Error('Failed to fetch teacher phones')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Initialize teacher phones when data loads
  useEffect(() => {
    if (teacherPhoneData?.teachers) {
      const phoneMap: Record<number, string> = {}
      teacherPhoneData.teachers.forEach(t => { phoneMap[t.subcalendarId] = t.phone })
      setTeacherPhones(phoneMap)
    }
  }, [teacherPhoneData])

  // Save teacher phones
  const handleSaveTeacherPhones = async () => {
    setSavingTeacherPhones(true)
    try {
      for (const teacher of activeTeachers) {
        const phone = teacherPhones[teacher.id]
        if (phone) {
          await fetch('/api/scheduling/teacher-phones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subcalendarId: teacher.id, name: teacher.name, phone }),
          })
        }
      }
      queryClient.invalidateQueries({ queryKey: ['teacher-phones'] })
    } catch (err) {
      console.error('Failed to save teacher phones:', err)
    } finally {
      setSavingTeacherPhones(false)
      setShowTeacherSettings(false)
    }
  }

  // Notify teacher about class change (fire-and-forget)
  const notifyTeacher = (subcalendarId: string, type: 'created' | 'updated' | 'deleted', data: EventFormData) => {
    const moduleLabel = data.module ? getModuleLabel(data.module) : data.title || 'Class'
    fetch('/api/scheduling/teacher-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subcalendarId,
        type,
        studentName: data.studentName,
        module: moduleLabel,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
      }),
    }).catch(() => {}) // fire-and-forget
  }

  // Build notes string with phone
  const buildNotes = (data: EventFormData, originalNotes?: string) => {
    const noteLines = []
    // Preserve truck-specific fields from original notes when editing truck classes
    if (originalNotes) {
      const clean = stripHtml(originalNotes)
      const lines = clean.split('\n').map(l => l.trim())
      for (const line of lines) {
        if (/^TruckClass:/i.test(line)) noteLines.push(line)
        else if (/^Transmission:/i.test(line)) noteLines.push(line)
        else if (/^ClassNumber:/i.test(line)) noteLines.push(line)
        else if (/^Exam:/i.test(line)) noteLines.push(line)
      }
    }
    if (data.isExtraHours) noteLines.push('ExtraHours: yes')
    if (data.isExtraHours) noteLines.push(`Paid: ${data.isPaid ? 'yes' : 'no'}`)
    if (data.studentName) noteLines.push(`Student: ${data.studentName}`)
    if (data.studentPhone) noteLines.push(`Phone: ${data.studentPhone}`)
    if (data.group) noteLines.push(`Group: ${data.group}`)
    if (data.lastTheoryModule) {
      const dateStr = data.lastTheoryDate
        ? new Date(data.lastTheoryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : ''
      noteLines.push(`LastTheory: ${data.lastTheoryModule}${dateStr ? ` (${dateStr})` : ''}`)
    }
    if (data.customNotes) noteLines.push(`Notes: ${data.customNotes}`)
    return noteLines.join('\n')
  }

  // Build title from form data
  const buildTitle = (data: EventFormData) => {
    const moduleLabel = data.module ? (data.module.startsWith('S') ? `Session ${data.module.slice(1)}` : `M${data.module}`) : ''
    const parts = [moduleLabel, data.title, data.studentName, data.group].filter(Boolean)
    return parts.join(' - ')
  }

  // Get module display label
  const getModuleLabel = (moduleVal: string) => {
    if (!moduleVal) return ''
    // Check in-car session options
    const opt = MODULE_OPTIONS.find(o => o.value === moduleVal)
    if (opt) return opt.label
    // Theory module label
    if (!moduleVal.startsWith('S')) {
      const num = parseInt(moduleVal)
      if (!isNaN(num)) return `Module ${num}`
    }
    return moduleVal
  }

  // Derive phase from module value (theory modules or in-car sessions)
  const getPhaseInfo = (moduleVal: string): { phase: number; label: string; color: string } | null => {
    if (!moduleVal) return null
    // In-car sessions: S1-S4 = Phase 2, S5-S10 = Phase 3, S11-S15 = Phase 4
    if (moduleVal.startsWith('S')) {
      const sNum = parseInt(moduleVal.slice(1))
      if (isNaN(sNum)) return null
      if (sNum >= 1 && sNum <= 4) return { phase: 2, label: 'Phase 2', color: 'bg-green-100 text-green-800' }
      if (sNum >= 5 && sNum <= 10) return { phase: 3, label: 'Phase 3', color: 'bg-blue-100 text-blue-800' }
      if (sNum >= 11 && sNum <= 15) return { phase: 4, label: 'Phase 4', color: 'bg-purple-100 text-purple-800' }
      return null
    }
    // Theory modules: 1-5 = Phase 1, 6-7 = Phase 2, 8-10 = Phase 3, 11-12 = Phase 4
    const num = parseInt(moduleVal)
    if (isNaN(num)) return null
    if (num >= 1 && num <= 5) return { phase: 1, label: 'Phase 1', color: 'bg-yellow-100 text-yellow-800' }
    if (num >= 6 && num <= 7) return { phase: 2, label: 'Phase 2', color: 'bg-green-100 text-green-800' }
    if (num >= 8 && num <= 10) return { phase: 3, label: 'Phase 3', color: 'bg-blue-100 text-blue-800' }
    if (num >= 11 && num <= 12) return { phase: 4, label: 'Phase 4', color: 'bg-purple-100 text-purple-800' }
    return null
  }

  // Send WhatsApp notification
  const [notifyError, setNotifyError] = useState<string | null>(null)

  const sendNotification = async (data: EventFormData) => {
    if (!data.studentPhone) return
    setNotifyStatus('sending')
    setNotifyError(null)
    try {
      const teacher = activeTeachers.find(t => t.id.toString() === data.subcalendarId)
      const moduleLabel = getModuleLabel(data.module)
      // Parse date parts directly to avoid timezone shift (new Date("2026-02-15") creates UTC midnight which shifts back a day in local time)
      const [year, month, day] = data.date.split('-').map(Number)
      const dateObj = new Date(year, month - 1, day)
      const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      const res = await fetch('/api/scheduling/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: data.studentPhone,
          studentName: data.studentName,
          module: moduleLabel,
          teacherName: teacher?.name?.split(' ')[0] || '',
          date: dateStr,
          classDateISO: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
        }),
      })
      if (res.ok) {
        setNotifyStatus('sent')
      } else {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setNotifyError(errData.error || `HTTP ${res.status}`)
        setNotifyStatus('failed')
        console.error('[Scheduling] Notification failed:', errData.error)
      }
    } catch (err) {
      setNotifyError('Network error')
      setNotifyStatus('failed')
      console.error('[Scheduling] Notification error:', err)
    }
    setTimeout(() => { setNotifyStatus(null); setNotifyError(null) }, 6000)
  }

  // Create event mutation
  const createMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      const title = buildTitle(data)
      const res = await fetch('/api/scheduling/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          startDate: `${data.date}T${data.startTime}:00`,
          endDate: `${data.date}T${data.endTime}:00`,
          subcalendarIds: [parseInt(data.subcalendarId)],
          notes: buildNotes(data),
        }),
      })
      if (!res.ok) throw new Error('Failed to create event')
      return res.json()
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
      setShowCreateDialog(false)
      if (data.studentPhone) sendNotification(data)
      if (data.subcalendarId) notifyTeacher(data.subcalendarId, 'created', data)
      setFormData(initialFormData)
    },
  })

  // Update event mutation
  const updateMutation = useMutation({
    mutationFn: async ({ eventId, data, originalNotes, originalTitle }: { eventId: string; data: EventFormData; originalNotes?: string; originalTitle?: string }) => {
      // For truck classes, preserve the original title (Truck Class X (Auto) - Name)
      // since buildTitle() generates car-class format which mangles truck titles
      const isTruck = originalNotes && /TruckClass:\s*yes/i.test(originalNotes.replace(/<[^>]+>/g, ''))
      const title = isTruck && originalTitle ? originalTitle : buildTitle(data)
      const subCalId = parseInt(data.subcalendarId)
      const res = await fetch(`/api/scheduling/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          startDate: `${data.date}T${data.startTime}:00`,
          endDate: `${data.date}T${data.endTime}:00`,
          ...(isNaN(subCalId) ? {} : { subcalendarIds: [subCalId] }),
          notes: buildNotes(data, originalNotes),
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Failed to update event: ${errText}`)
      }
      return res.json()
    },
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
      setShowEditDialog(false)
      if (data.subcalendarId) notifyTeacher(data.subcalendarId, 'updated', data)
      setEditingEvent(null)
      setFormData(initialFormData)
    },
  })

  // Delete event mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ eventId, data }: { eventId: string; data: EventFormData }) => {
      const res = await fetch(`/api/scheduling/events/${eventId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete event')
      return res.json()
    },
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
      setShowEditDialog(false)
      if (data.subcalendarId) notifyTeacher(data.subcalendarId, 'deleted', data)
      setEditingEvent(null)
    },
  })

  // Update student info inline (from event detail)
  const updateStudentInfoMutation = useMutation({
    mutationFn: async ({ eventId, name, phone: newPhone }: { eventId: string; name: string; phone: string }) => {
      const event = selectedEvent!
      const parsed = parseModuleFromTitle(event.title)
      const groupFromNotes = parseGroupFromNotes(event.notes)
      const lastTheory = parseLastTheoryFromNotes(event.notes)

      const updatedData: EventFormData = {
        module: parsed.module,
        title: parsed.title,
        subcalendarId: event.subcalendar_ids[0]?.toString() || '',
        date: event.start_dt.split('T')[0],
        startTime: new Date(event.start_dt).toTimeString().slice(0, 5),
        endTime: new Date(event.end_dt).toTimeString().slice(0, 5),
        studentName: name,
        studentPhone: newPhone,
        group: groupFromNotes || parsed.group,
        lastTheoryModule: lastTheory.module,
        lastTheoryDate: lastTheory.date,
        isExtraHours: parseExtraHoursFromNotes(event.notes),
        isPaid: parsePaidFromNotes(event.notes),
        customNotes: parseCustomNotesFromNotes(event.notes),
      }

      const res = await fetch(`/api/scheduling/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: buildTitle(updatedData),
          startDate: event.start_dt,
          endDate: event.end_dt,
          subcalendarIds: event.subcalendar_ids,
          notes: buildNotes(updatedData, event.notes),
        }),
      })
      if (!res.ok) throw new Error('Failed to update event')

      // Also update the local contact database so the name shows correctly in search
      if (newPhone) {
        const jid = newPhone + '@c.us'
        try {
          await fetch('/api/contacts/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: jid, phone: newPhone, name }),
          })
        } catch {
          // Non-critical, continue
        }
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
      queryClient.invalidateQueries({ queryKey: ['contact-search'] })
      setEditingStudentInfo(false)
      setShowEventDetail(false)
      setSelectedEvent(null)
    },
  })

  // Toggle present status on an event
  const togglePresentMutation = useMutation({
    mutationFn: async ({ eventId, present }: { eventId: string; present: boolean }) => {
      const res = await fetch('/api/scheduling/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, present }),
      })
      if (!res.ok) throw new Error('Failed to update attendance')
      return { eventId, present }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-attendance'] })
    },
  })

  // Open create dialog pre-filled with day/time
  const handleSlotClick = (date: Date, hour: number) => {
    // If user already has form data (student, module), preserve it and only update date/time
    if (formData.studentName || formData.module) {
      setFormData(prev => ({
        ...prev,
        date: formatDate(date),
        startTime: `${hour.toString().padStart(2, '0')}:00`,
        endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
        subcalendarId: selectedTeacher ? selectedTeacher.toString() : prev.subcalendarId,
      }))
    } else {
      setFormData({
        ...initialFormData,
        date: formatDate(date),
        startTime: `${hour.toString().padStart(2, '0')}:00`,
        endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
        subcalendarId: selectedTeacher ? selectedTeacher.toString() : '',
      })
    }
    setDuplicateError(null)
    setShowCreateDialog(true)
  }

  // Parse module from title like "M3 - ..." or "Session 5 - ..." or "Module 8 - ..."
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

  // Strip HTML tags from Teamup notes
  const stripHtml = (html: string) => {
    return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, '').trim()
  }

  const parsePhoneFromNotes = (notes?: string) => {
    if (!notes) return ''
    const clean = stripHtml(notes)
    const phoneMatch = clean.match(/Phone:\s*(\S+)/)
    return phoneMatch?.[1] || ''
  }

  const parseStudentFromNotes = (notes?: string) => {
    if (!notes) return ''
    const clean = stripHtml(notes)
    const match = clean.match(/Student:\s*(.+)/)
    return match?.[1]?.trim() || ''
  }

  const parseGroupFromNotes = (notes?: string) => {
    if (!notes) return ''
    const clean = stripHtml(notes)
    const match = clean.match(/Group:\s*(.+)/)
    return match?.[1]?.trim() || ''
  }

  const parseExtraHoursFromNotes = (notes?: string) => {
    if (!notes) return false
    return /ExtraHours:\s*yes/i.test(stripHtml(notes))
  }

  const parsePaidFromNotes = (notes?: string) => {
    if (!notes) return false
    return /Paid:\s*yes/i.test(stripHtml(notes))
  }

  // parsePresentFromNotes removed — attendance is now stored locally in ClassAttendance table

  const parseLastTheoryFromNotes = (notes?: string): { module: number | null; date: string | null } => {
    if (!notes) return { module: null, date: null }
    const match = stripHtml(notes).match(/LastTheory:\s*(\d+)(?:\s*\((.+?)\))?/)
    if (!match) return { module: null, date: null }
    return { module: parseInt(match[1]), date: match[2] || null }
  }

  const parseCustomNotesFromNotes = (notes?: string) => {
    if (!notes) return ''
    const match = stripHtml(notes).match(/Notes:\s*(.+)/)
    return match?.[1]?.trim() || ''
  }

  // Check if event is a theory class (not in-car session)
  const isTheoryEvent = (event: TeamupEvent) => {
    const titleMatch = event.title.match(/^Module\s+\d+\s+-/)
    const notesMatch = event.notes && stripHtml(event.notes).toLowerCase().includes('theory class')
    return !!(titleMatch || notesMatch)
  }

  // Get theory group name from event
  const getTheoryGroupName = (event: TeamupEvent) => {
    const fromNotes = parseGroupFromNotes(event.notes)
    if (fromNotes) return fromNotes
    // Fallback: parse from title "Module 8 - GroupName"
    const parts = event.title.split(' - ')
    return parts[1]?.trim() || ''
  }

  // Check if event is a truck class
  const isTruckClass = (event: TeamupEvent) => {
    if (!event.notes) return false
    return /TruckClass:\s*yes/i.test(stripHtml(event.notes))
  }

  // Check if event is a truck exam
  const isTruckExam = (event: TeamupEvent) => {
    if (!event.notes) return false
    const clean = stripHtml(event.notes)
    return /TruckClass:\s*yes/i.test(clean) && /Exam:\s*.+/i.test(clean)
  }

  // Parse exam location from notes
  const parseExamLocationFromNotes = (notes?: string) => {
    if (!notes) return ''
    const match = stripHtml(notes).match(/Exam:\s*(.+)/)
    return match?.[1]?.trim() || ''
  }

  // Parse truck class number from notes
  const parseTruckClassNumberFromNotes = (notes?: string) => {
    if (!notes) return null
    const match = stripHtml(notes).match(/ClassNumber:\s*(\d+)/)
    return match ? parseInt(match[1]) : null
  }

  // Truck form helpers
  const updateTruckClass = (index: number, updates: Partial<TruckClassRow>) => {
    setTruckForm(prev => ({
      ...prev,
      classes: prev.classes.map((cls, i) => i === index ? { ...cls, ...updates } : cls),
    }))
  }

  const removeTruckClass = (index: number) => {
    setTruckForm(prev => ({
      ...prev,
      classes: prev.classes.filter((_, i) => i !== index),
    }))
  }

  const addTruckClass = () => {
    setTruckForm(prev => {
      const lastClass = prev.classes[prev.classes.length - 1]
      // Find the highest class number to auto-increment
      const lastNum = prev.classes.filter(c => !c.isExam && c.classNumber != null).reduce((max, c) => Math.max(max, c.classNumber!), 0)
      const newRow: TruckClassRow = {
        date: lastClass ? (() => {
          if (!lastClass.date) return ''
          const d = new Date(lastClass.date + 'T12:00:00')
          d.setDate(d.getDate() + 1)
          return formatDate(d)
        })() : '',
        startTime: lastClass?.startTime || '09:00',
        endTime: lastClass?.endTime || '10:00',
        isExam: false,
        examLocation: '',
        classNumber: lastNum + 1,
      }
      return { ...prev, classes: [...prev.classes, newRow] }
    })
  }

  // Bulk car class helpers
  const updateCarClass = (index: number, updates: Partial<CarClassRow>) => {
    setCarBulkForm(prev => ({
      ...prev,
      classes: prev.classes.map((cls, i) => i === index ? { ...cls, ...updates } : cls),
    }))
  }

  const removeCarClass = (index: number) => {
    setCarBulkForm(prev => ({
      ...prev,
      classes: prev.classes.filter((_, i) => i !== index),
    }))
  }

  const addCarClass = () => {
    setCarBulkForm(prev => {
      const lastClass = prev.classes[prev.classes.length - 1]
      // Auto-increment session number
      let nextModule = ''
      if (lastClass?.module?.startsWith('S')) {
        const num = parseInt(lastClass.module.slice(1))
        if (!isNaN(num) && num < 15) nextModule = `S${num + 1}`
      }
      const newRow: CarClassRow = {
        date: lastClass ? (() => {
          if (!lastClass.date) return ''
          const d = new Date(lastClass.date + 'T12:00:00')
          d.setDate(d.getDate() + 1)
          return formatDate(d)
        })() : '',
        startTime: lastClass?.startTime || '09:00',
        endTime: lastClass?.endTime || '10:00',
        module: nextModule,
        subcalendarId: lastClass?.subcalendarId || '',
      }
      return { ...prev, classes: [...prev.classes, newRow] }
    })
  }

  const handleCarBulkSubmit = async () => {
    if (!carBulkForm.studentName || carBulkForm.classes.length === 0) return
    if (carBulkForm.classes.some(c => !c.date || !c.subcalendarId)) return

    setCarBulkCreating(true)
    let created = 0
    const errors: string[] = []

    try {
      for (const cls of carBulkForm.classes) {
        const classData: EventFormData = {
          module: cls.module,
          title: '',
          subcalendarId: cls.subcalendarId,
          date: cls.date,
          startTime: cls.startTime,
          endTime: cls.endTime,
          studentName: carBulkForm.studentName,
          studentPhone: carBulkForm.studentPhone,
          group: carBulkForm.group,
          lastTheoryModule: carBulkForm.lastTheoryModule,
          lastTheoryDate: carBulkForm.lastTheoryDate,
          isExtraHours: carBulkForm.isExtraHours,
          isPaid: carBulkForm.isPaid,
          customNotes: carBulkForm.customNotes,
        }

        try {
          const title = buildTitle(classData)
          const res = await fetch('/api/scheduling/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              startDate: `${cls.date}T${cls.startTime}:00`,
              endDate: `${cls.date}T${cls.endTime}:00`,
              subcalendarIds: [parseInt(cls.subcalendarId)],
              notes: buildNotes(classData),
            }),
          })

          if (res.ok) {
            created++
            // Send notification + schedule reminder per class
            if (classData.studentPhone) sendNotification(classData)
            if (classData.subcalendarId) notifyTeacher(classData.subcalendarId, 'created', classData)
          } else {
            const text = await res.text()
            errors.push(`Class on ${cls.date}: ${text}`)
          }
        } catch (err) {
          errors.push(`Class on ${cls.date}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }

        // Small delay between API calls
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
      setShowCreateDialog(false)
      setCarBulkStep('form')
      setCreateMode('single')
      setCarBulkForm({
        studentName: '', studentPhone: '', group: '', lastTheoryModule: null, lastTheoryDate: null,
        isExtraHours: false, isPaid: false, customNotes: '', classes: [emptyCarRow()],
      })
      console.log(`Bulk car classes created: ${created}/${carBulkForm.classes.length}${errors.length > 0 ? `, errors: ${errors.length}` : ''}`)
    } catch {
      console.error('Bulk car class creation failed')
    } finally {
      setCarBulkCreating(false)
    }
  }

  const handleTruckSubmit = async () => {
    if (!truckForm.studentName || !truckForm.studentPhone || truckForm.classes.length === 0) return
    // Validate all classes have dates
    if (truckForm.classes.some(c => !c.date)) return

    setTruckCreating(true)
    setTruckNotifyStatus('sending')
    setTruckDuplicateError(null)
    try {
      const res = await fetch('/api/scheduling/truck-classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: truckForm.studentName,
          studentPhone: truckForm.studentPhone,
          transmission: truckForm.transmission,
          classes: truckForm.classes.map(c => ({
            date: c.date,
            startTime: c.startTime,
            endTime: c.endTime,
            isExam: c.isExam,
            examLocation: c.isExam ? c.examLocation : null,
            classNumber: c.isExam ? null : c.classNumber,
          })),
        }),
      })

      if (res.ok) {
        const result = await res.json()
        queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
        setShowTruckDialog(false)
        setTruckStep('form')
        setTruckForm({ studentName: '', studentPhone: '', transmission: 'manual', classes: [emptyTruckRow(1)] })
        setTruckNotifyStatus('sent')
        console.log(`Truck classes created: ${result.eventsCreated}, reminders: ${result.remindersScheduled}`)
      } else if (res.status === 409) {
        const data = await res.json()
        setTruckDuplicateError(data.duplicates || ['Duplicate classes detected'])
        setTruckNotifyStatus(null)
      } else {
        setTruckNotifyStatus('failed')
      }
    } catch {
      setTruckNotifyStatus('failed')
    } finally {
      setTruckCreating(false)
      setTimeout(() => setTruckNotifyStatus(null), 4000)
    }
  }

  // Print truck schedule as PDF
  const handlePrintTruckSchedule = async (data: { studentName: string; studentPhone: string; classes: TruckClassRow[] }) => {
    try {
      const res = await fetch('/api/scheduling/truck-schedule-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: data.studentName,
          studentPhone: data.studentPhone,
          classes: data.classes.map(c => ({
            date: c.date,
            startTime: c.startTime,
            endTime: c.endTime,
            isExam: c.isExam,
            examLocation: c.isExam ? c.examLocation : null,
          })),
        }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
      }
    } catch (err) {
      console.error('Failed to generate truck schedule PDF:', err)
    }
  }

  // View truck schedule from event detail (gather all truck events for the student)
  const handleViewTruckSchedule = async (event: TeamupEvent) => {
    const studentName = parseStudentFromNotes(event.notes)
    const studentPhone = parsePhoneFromNotes(event.notes)
    if (!studentName) return

    // Fetch all truck events for this student from Teamup (not just loaded view)
    try {
      const res = await fetch(`/api/scheduling/student-events?studentName=${encodeURIComponent(studentName)}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const allEvents: TeamupEvent[] = await res.json()

      const truckEvents = allEvents
        .filter(ev => isTruckClass(ev))
        .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

      const scheduleClasses: TruckClassRow[] = truckEvents.map(ev => {
        const startDt = new Date(ev.start_dt)
        const endDt = new Date(ev.end_dt)
        const isExam = isTruckExam(ev)
        const examLoc = parseExamLocationFromNotes(ev.notes)
        const classNum = parseTruckClassNumberFromNotes(ev.notes)
        return {
          date: formatDate(startDt),
          startTime: startDt.toTimeString().slice(0, 5),
          endTime: endDt.toTimeString().slice(0, 5),
          isExam,
          examLocation: examLoc,
          classNumber: isExam ? null : classNum,
        }
      })

      setTruckScheduleData({ studentName, studentPhone, classes: scheduleClasses })
      setShowEventDetail(false)
      setShowTruckSchedule(true)
    } catch (err) {
      console.error('Failed to fetch truck schedule:', err)
      // Fallback to loaded events
      const truckEvents = events
        .filter(ev => isTruckClass(ev) && parseStudentFromNotes(ev.notes) === studentName)
        .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

      const scheduleClasses: TruckClassRow[] = truckEvents.map(ev => {
        const startDt = new Date(ev.start_dt)
        const endDt = new Date(ev.end_dt)
        const isExam = isTruckExam(ev)
        const examLoc = parseExamLocationFromNotes(ev.notes)
        const classNum = parseTruckClassNumberFromNotes(ev.notes)
        return {
          date: formatDate(startDt),
          startTime: startDt.toTimeString().slice(0, 5),
          endTime: endDt.toTimeString().slice(0, 5),
          isExam,
          examLocation: examLoc,
          classNumber: isExam ? null : classNum,
        }
      })

      setTruckScheduleData({ studentName, studentPhone, classes: scheduleClasses })
      setShowEventDetail(false)
      setShowTruckSchedule(true)
    }
  }

  // Fill form from event data
  const fillFormFromEvent = (event: TeamupEvent) => {
    const startDt = new Date(event.start_dt)
    const parsed = parseModuleFromTitle(event.title)
    const phone = parsePhoneFromNotes(event.notes)
    const studentFromNotes = parseStudentFromNotes(event.notes)
    const groupFromNotes = parseGroupFromNotes(event.notes)
    const lastTheory = parseLastTheoryFromNotes(event.notes)
    const isExtra = parseExtraHoursFromNotes(event.notes)
    const paid = parsePaidFromNotes(event.notes)
    const customNotes = parseCustomNotesFromNotes(event.notes)

    setFormData({
      module: parsed.module,
      title: parsed.title,
      subcalendarId: event.subcalendar_ids[0]?.toString() || '',
      date: formatDate(startDt),
      startTime: startDt.toTimeString().slice(0, 5),
      endTime: new Date(event.end_dt).toTimeString().slice(0, 5),
      studentName: studentFromNotes || parsed.studentName,
      studentPhone: phone,
      group: groupFromNotes || parsed.group,
      lastTheoryModule: lastTheory.module,
      lastTheoryDate: lastTheory.date,
      isExtraHours: isExtra,
      isPaid: paid,
      customNotes,
    })
  }

  // Open event detail view
  const handleEventClick = (event: TeamupEvent, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedEvent(event)
    setTheoryGroupId(null)
    setShowEventDetail(true)
  }

  // Look up theory group ID when event detail opens
  useEffect(() => {
    if (!showEventDetail || !selectedEvent || !isTheoryEvent(selectedEvent)) {
      setTheoryGroupId(null)
      return
    }
    const groupName = getTheoryGroupName(selectedEvent)
    if (!groupName) return

    fetch(`/api/scheduling/group-lookup?name=${encodeURIComponent(groupName)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.groupId) setTheoryGroupId(data.groupId)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEventDetail, selectedEvent])

  // Open edit dialog from detail view
  const handleEditFromDetail = () => {
    if (!selectedEvent) return
    fillFormFromEvent(selectedEvent)
    setEditingEvent(selectedEvent)
    setShowEventDetail(false)
    setShowEditDialog(true)
  }

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dayStr = formatDate(date)
    return events.filter(ev => ev.start_dt.split('T')[0] === dayStr)
  }

  // Calculate event position and height in the grid
  const getEventStyle = (event: TeamupEvent) => {
    const start = new Date(event.start_dt)
    const end = new Date(event.end_dt)
    const startHour = start.getHours() + start.getMinutes() / 60
    const endHour = end.getHours() + end.getMinutes() / 60
    const top = (startHour - HOUR_START) * HOUR_HEIGHT
    const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 24)
    return { top, height }
  }

  // Get teacher color for an event
  const getEventColor = (event: TeamupEvent) => {
    const subCalId = event.subcalendar_ids[0]
    const teacher = activeTeachers.find(t => t.id === subCalId)
    return teacher ? getColor(teacher.color) : '#3B82F6'
  }

  const getTeacherName = (event: TeamupEvent) => {
    const subCalId = event.subcalendar_ids[0]
    const teacher = activeTeachers.find(t => t.id === subCalId)
    return teacher?.name || ''
  }

  const isTodayDate = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  // Check for duplicate
  const checkDuplicate = (data: EventFormData): string | null => {
    if (!data.studentName || !data.date || !data.subcalendarId) return null
    const duplicate = events.find(ev => {
      const evDate = ev.start_dt.split('T')[0]
      const evTime = ev.start_dt.slice(11, 16)
      const evTeacher = ev.subcalendar_ids[0]?.toString()
      const evStudent = parseStudentFromNotes(ev.notes) || parseModuleFromTitle(ev.title).studentName
      if (evStudent.toLowerCase() === data.studentName.toLowerCase() &&
          evDate === data.date && evTime === data.startTime && evTeacher === data.subcalendarId) {
        return true
      }
      if (data.module && evStudent.toLowerCase() === data.studentName.toLowerCase() && evDate === data.date) {
        const evParsed = parseModuleFromTitle(ev.title)
        if (evParsed.module === data.module) return true
      }
      return false
    })
    if (duplicate) {
      const teacher = activeTeachers.find(t => t.id === duplicate.subcalendar_ids[0])
      return `${data.studentName} already has a class scheduled on ${data.date} (${duplicate.title} with ${teacher?.name || 'teacher'})`
    }
    return null
  }

  const handleCreate = () => {
    if ((!formData.module && !formData.title) || !formData.date || !formData.subcalendarId) return
    setDuplicateError(null)
    const dup = checkDuplicate(formData)
    if (dup) { setDuplicateError(dup); return }
    createMutation.mutate(formData)
  }

  const handleUpdate = () => {
    if (!editingEvent || !formData.date) return
    // For truck classes, use original subcalendar if not set in form
    const data = { ...formData }
    if (!data.subcalendarId && editingEvent.subcalendar_ids[0]) {
      data.subcalendarId = editingEvent.subcalendar_ids[0].toString()
    }
    updateMutation.mutate({ eventId: editingEvent.id, data, originalNotes: editingEvent.notes, originalTitle: editingEvent.title })
  }

  const handleDelete = () => {
    if (!editingEvent) return
    deleteMutation.mutate({ eventId: editingEvent.id, data: formData })
  }

  // Gather export data (shared between CSV and PDF)
  const getExportData = () => {
    const expDate = exportDate ? new Date(exportDate + 'T12:00:00') : currentDate
    let rangeStart: Date
    let rangeEnd: Date
    let filenameDatePart: string
    let dateRangeLabel: string

    if (exportView === 'day') {
      rangeStart = new Date(expDate)
      rangeEnd = new Date(expDate)
      filenameDatePart = formatDate(expDate)
      dateRangeLabel = expDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    } else if (exportView === 'week') {
      rangeStart = getMonday(expDate)
      rangeEnd = new Date(rangeStart)
      rangeEnd.setDate(rangeEnd.getDate() + 6)
      filenameDatePart = `${formatDate(rangeStart)}_to_${formatDate(rangeEnd)}`
      dateRangeLabel = `${rangeStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    } else {
      rangeStart = new Date(expDate.getFullYear(), expDate.getMonth(), 1)
      rangeEnd = new Date(expDate.getFullYear(), expDate.getMonth() + 1, 0)
      filenameDatePart = `${expDate.getFullYear()}-${(expDate.getMonth() + 1).toString().padStart(2, '0')}`
      dateRangeLabel = expDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }

    const rangeStartStr = formatDate(rangeStart)
    const rangeEndStr = formatDate(rangeEnd)
    let filteredEvents = events.filter(ev => {
      const evDate = ev.start_dt.split('T')[0]
      return evDate >= rangeStartStr && evDate <= rangeEndStr
    })

    if (exportTeacher !== 'all') {
      const teacherId = parseInt(exportTeacher)
      filteredEvents = filteredEvents.filter(ev => ev.subcalendar_ids.includes(teacherId))
    }

    // Filter by class type (car vs truck)
    if (exportClassType === 'truck') {
      filteredEvents = filteredEvents.filter(ev => isTruckClass(ev))
    } else if (exportClassType === 'car') {
      filteredEvents = filteredEvents.filter(ev => !isTruckClass(ev))
    }

    filteredEvents.sort((a, b) => a.start_dt.localeCompare(b.start_dt))

    const teacherLabel = exportTeacher === 'all' ? 'All Teachers' : (activeTeachers.find(t => t.id === parseInt(exportTeacher))?.name || 'Teacher')
    const teacherFilename = teacherLabel.replace(/\s+/g, '-')

    return { filteredEvents, teacherLabel, teacherFilename, filenameDatePart, dateRangeLabel }
  }

  // Build row data for export
  const buildExportRows = (filteredEvents: TeamupEvent[]) => {
    if (exportMode === 'attendance') {
      const headers = ['Date', 'Time', 'Class', 'Student', 'Teacher', 'Status']
      const rows: string[][] = []

      for (const ev of filteredEvents) {
        const startDt = new Date(ev.start_dt)
        const endDt = new Date(ev.end_dt)
        const dateStr = startDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        const timeStr = `${startDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
        const parsed = parseModuleFromTitle(ev.title)
        const classLabel = parsed.module ? getModuleLabel(parsed.module) : ev.title
        const studentName = parseStudentFromNotes(ev.notes) || parsed.studentName || '-'
        const teacher = activeTeachers.find(t => t.id === ev.subcalendar_ids[0])
        const isPresent = isEventPresent(ev.id)

        rows.push([dateStr, timeStr, classLabel, studentName, teacher?.name || '-', isPresent ? 'Present' : 'Absent'])
      }

      const totalClasses = filteredEvents.length
      const presentCount = filteredEvents.filter(ev => isEventPresent(ev.id)).length
      const absentCount = totalClasses - presentCount
      const rate = totalClasses > 0 ? `${Math.round((presentCount / totalClasses) * 100)}%` : 'N/A'

      return { headers, rows, summary: { totalClasses, presentCount, absentCount, rate } }
    } else {
      const headers = ['Date', 'Start', 'End', 'Class', 'Student', 'Phone', 'Teacher', 'Present', 'Extra Hours', 'Paid']
      const rows: string[][] = []

      for (const ev of filteredEvents) {
        const startDt = new Date(ev.start_dt)
        const endDt = new Date(ev.end_dt)
        const dateStr = startDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        const startTimeStr = startDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        const endTimeStr = endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        const parsed = parseModuleFromTitle(ev.title)
        const classLabel = parsed.module ? getModuleLabel(parsed.module) : ev.title
        const studentName = parseStudentFromNotes(ev.notes) || parsed.studentName || '-'
        const phone = parsePhoneFromNotes(ev.notes) || '-'
        const teacher = activeTeachers.find(t => t.id === ev.subcalendar_ids[0])
        const isPresent = isEventPresent(ev.id)
        const isExtra = parseExtraHoursFromNotes(ev.notes)
        const isPaid = parsePaidFromNotes(ev.notes)

        rows.push([
          dateStr, startTimeStr, endTimeStr, classLabel, studentName, phone,
          teacher?.name || '-', isPresent ? 'Yes' : 'No', isExtra ? 'Yes' : 'No',
          isExtra ? (isPaid ? 'Yes' : 'No') : '-',
        ])
      }

      return { headers, rows, summary: null }
    }
  }

  // Export handler
  const handleExport = async () => {
    const { filteredEvents, teacherLabel, teacherFilename, filenameDatePart, dateRangeLabel } = getExportData()
    const { headers, rows, summary } = buildExportRows(filteredEvents)
    const prefix = exportMode === 'attendance' ? 'attendance' : 'schedule'
    const classTypeSuffix = exportClassType === 'all' ? '' : `-${exportClassType}`
    const classTypeLabel = exportClassType === 'car' ? ' (Car Classes)' : exportClassType === 'truck' ? ' (Truck Classes)' : ''

    if (exportFormat === 'csv') {
      const csvRows: string[][] = [headers, ...rows]
      if (summary) {
        csvRows.push([])
        csvRows.push(['Summary'])
        csvRows.push(['Total Classes', summary.totalClasses.toString()])
        csvRows.push(['Present', summary.presentCount.toString()])
        csvRows.push(['Absent', summary.absentCount.toString()])
        csvRows.push(['Attendance Rate', summary.rate])
      }
      downloadCSV(csvRows, `${prefix}${classTypeSuffix}-${teacherFilename}-${filenameDatePart}.csv`)
    } else {
      await downloadPDF(headers, rows, summary, {
        title: (exportMode === 'attendance' ? 'Attendance Summary' : 'Class Schedule') + classTypeLabel,
        subtitle: `${teacherLabel} — ${dateRangeLabel}`,
        filename: `${prefix}${classTypeSuffix}-${teacherFilename}-${filenameDatePart}`,
      })
    }

    setShowExportDialog(false)
  }

  // Helper: download CSV
  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map(row =>
      row.map(cell => {
        const escaped = cell.replace(/"/g, '""')
        return /[",\n]/.test(cell) ? `"${escaped}"` : escaped
      }).join(',')
    ).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Helper: convert image to base64 data URL
  const imageToBase64 = (src: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => resolve('')
      img.src = src
    })
  }

  // Helper: download PDF via print
  const downloadPDF = async (
    headers: string[],
    rows: string[][],
    _summary: { totalClasses: number; presentCount: number; absentCount: number; rate: string } | null,
    meta: { title: string; subtitle: string; filename: string }
  ) => {
    // Load logo as base64
    const logoBase64 = await imageToBase64('/qazi-logo.png')

    const statusColIdx = headers.indexOf('Status')
    const presentColIdx = headers.indexOf('Present')

    const tableRows = rows.map(row => {
      const cells = row.map((cell, i) => {
        let style = ''
        if (i === statusColIdx) {
          style = cell === 'Present'
            ? 'color:#16a34a;font-weight:600;'
            : 'color:#dc2626;font-weight:600;'
        }
        if (i === presentColIdx) {
          style = cell === 'Yes'
            ? 'color:#16a34a;font-weight:600;'
            : cell === 'No' ? 'color:#dc2626;font-weight:600;' : ''
        }
        return `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;${style}">${cell}</td>`
      }).join('')
      return `<tr>${cells}</tr>`
    }).join('')

    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" style="height:50px;object-fit:contain;" />`
      : `<div style="font-size:18px;font-weight:700;">Qazi Driving School</div>`

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${meta.title}</title>
        <style>
          @page { margin: 40px; size: ${exportMode === 'schedule' ? 'landscape' : 'portrait'}; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; color: #1e293b; }
          .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
          .header-left { display: flex; align-items: center; gap: 16px; }
          .header-text h1 { font-size: 18px; margin: 0 0 2px 0; }
          .header-text .subtitle { font-size: 12px; color: #64748b; margin: 0; }
          .count-badge { background: #f1f5f9; border-radius: 6px; padding: 4px 12px; font-size: 12px; color: #475569; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; padding: 8px 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }
          tr:nth-child(even) td { background: #f8fafc; }
          .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            ${logoHtml}
            <div class="header-text">
              <h1>${meta.title}</h1>
              <div class="subtitle">${meta.subtitle}</div>
            </div>
          </div>
          <div class="count-badge">${rows.length} class${rows.length !== 1 ? 'es' : ''}</div>
        </div>
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="footer">
          <span>Qazi Driving School</span>
          <span>Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    // Wait for logo image to load before printing
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  // Render an event block (shared between day and week views)
  const renderEventBlock = (event: TeamupEvent, top: number, height: number, wide?: boolean) => {
    const color = getEventColor(event)
    const teacherName = getTeacherName(event)
    const isExtra = parseExtraHoursFromNotes(event.notes)
    const isPaid = parsePaidFromNotes(event.notes)
    const isPresent = isEventPresent(event.id)
    const startTime = new Date(event.start_dt).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
    const studentName = parseStudentFromNotes(event.notes) || parseModuleFromTitle(event.title).studentName

    return (
      <div
        key={event.id}
        className={`absolute left-1 right-1 rounded px-1.5 py-0.5 cursor-pointer overflow-hidden text-xs leading-tight shadow-sm hover:shadow-md transition-shadow ${
          isExtra ? 'text-black border-2' : 'text-white'
        }`}
        style={{
          top, height,
          backgroundColor: isExtra ? (isPaid ? '#FDE68A' : '#FCA5A5') : color,
          borderColor: isExtra ? (isPaid ? '#D97706' : '#DC2626') : undefined,
          minHeight: 22,
        }}
        onClick={(e) => handleEventClick(event, e)}
        title={`${event.title}\n${teacherName}\n${startTime}${isPresent ? '\n✓ Present' : ''}`}
      >
        <div className="font-medium truncate flex items-center gap-1">
          {isPresent && <Check className="h-3 w-3 flex-shrink-0" />}
          <span className="truncate">{event.title}</span>
        </div>
        {height > 36 && <div className="opacity-80 truncate">{teacherName}</div>}
        {height > 50 && <div className="opacity-70 truncate">{startTime}</div>}
        {wide && height > 64 && studentName && <div className="opacity-70 truncate">{studentName}</div>}
      </div>
    )
  }

  // Hour rows for day/week views
  const renderHourLabels = () => (
    <div>
      {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
        <div
          key={i}
          className="border-b text-xs text-muted-foreground text-right pr-2 flex items-start justify-end"
          style={{ height: HOUR_HEIGHT }}
        >
          <span className="relative -top-2">
            {(HOUR_START + i) % 12 === 0 ? 12 : (HOUR_START + i) % 12}
            {HOUR_START + i < 12 ? 'am' : 'pm'}
          </span>
        </div>
      ))}
    </div>
  )

  // Render a day column with hour slots and events
  const renderDayColumn = (date: Date, highlight: boolean) => {
    const dayEvents = getEventsForDate(date)
    return (
      <div className={`border-l relative ${highlight ? 'bg-primary/5' : ''}`}>
        {Array.from({ length: HOUR_END - HOUR_START }, (_, hourIdx) => (
          <div
            key={hourIdx}
            className="border-b cursor-pointer hover:bg-muted/30 transition-colors"
            style={{ height: HOUR_HEIGHT }}
            onClick={() => handleSlotClick(date, HOUR_START + hourIdx)}
          />
        ))}
        {dayEvents.map(event => {
          const { top, height } = getEventStyle(event)
          return renderEventBlock(event, top, height, viewMode === 'day')
        })}
      </div>
    )
  }

  // === WEEK VIEW ===
  const weekMonday = useMemo(() => getMonday(currentDate), [currentDate])

  const renderWeekView = () => (
    <div className="border rounded-lg overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/30">
          <div className="p-2 text-xs text-muted-foreground" />
          {DAY_NAMES.map((day, i) => {
            const d = new Date(weekMonday)
            d.setDate(d.getDate() + i)
            return (
              <div
                key={day}
                className={`p-2 text-center border-l cursor-pointer hover:bg-muted/50 ${isTodayDate(d) ? 'bg-primary/10' : ''}`}
                onClick={() => { setCurrentDate(d); setViewMode('day') }}
              >
                <div className="text-xs text-muted-foreground">{day}</div>
                <div className={`text-sm font-medium ${isTodayDate(d) ? 'text-primary' : ''}`}>{d.getDate()}</div>
              </div>
            )
          })}
        </div>
        {/* Time grid */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
          {renderHourLabels()}
          {DAY_NAMES.map((_, dayIndex) => {
            const d = new Date(weekMonday)
            d.setDate(d.getDate() + dayIndex)
            return <div key={dayIndex}>{renderDayColumn(d, isTodayDate(d))}</div>
          })}
        </div>
      </div>
    </div>
  )

  // === DAY VIEW ===
  const renderDayView = () => (
    <div className="border rounded-lg overflow-x-auto">
      <div className="min-w-[300px]">
        {/* Day header */}
        <div className="grid grid-cols-[60px_1fr] border-b bg-muted/30">
          <div className="p-2 text-xs text-muted-foreground" />
          <div className={`p-2 text-center border-l ${isTodayDate(currentDate) ? 'bg-primary/10' : ''}`}>
            <div className="text-xs text-muted-foreground">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className={`text-sm font-medium ${isTodayDate(currentDate) ? 'text-primary' : ''}`}>
              {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
        {/* Time grid */}
        <div className="grid grid-cols-[60px_1fr] relative">
          {renderHourLabels()}
          {renderDayColumn(currentDate, isTodayDate(currentDate))}
        </div>
      </div>
    </div>
  )

  // === MONTH VIEW ===
  const monthGridDates = useMemo(() => {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const startMonday = getMonday(first)
    const dates: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(startMonday)
      d.setDate(d.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [currentDate])

  const renderMonthView = () => (
    <div className="border rounded-lg">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DAY_NAMES.map(day => (
          <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground border-l first:border-l-0">
            {day}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7">
        {monthGridDates.map((date, idx) => {
          const isCurrentMonth = date.getMonth() === currentDate.getMonth()
          const today = isTodayDate(date)
          const dayEvents = getEventsForDate(date)
          const maxShow = 3

          return (
            <div
              key={idx}
              className={`min-h-[90px] border-l border-b first:border-l-0 p-1 cursor-pointer hover:bg-muted/30 transition-colors ${
                !isCurrentMonth ? 'opacity-40' : ''
              } ${today ? 'bg-primary/5' : ''}`}
              onClick={() => { setCurrentDate(date); setViewMode('day') }}
            >
              <div className={`text-xs font-medium mb-1 ${today ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                {date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, maxShow).map(event => {
                  const isExtra = parseExtraHoursFromNotes(event.notes)
                  const isPaid = parsePaidFromNotes(event.notes)
                  const isPresent = isEventPresent(event.id)
                  const color = getEventColor(event)
                  return (
                    <div
                      key={event.id}
                      className="text-[10px] leading-tight truncate rounded px-1 py-0.5 cursor-pointer flex items-center gap-0.5"
                      style={{
                        backgroundColor: isExtra ? (isPaid ? '#FDE68A' : '#FCA5A5') : color,
                        color: isExtra ? '#000' : '#fff',
                      }}
                      onClick={(e) => handleEventClick(event, e)}
                    >
                      {isPresent && <Check className="h-2.5 w-2.5 flex-shrink-0" />}
                      <span className="truncate">{event.title}</span>
                    </div>
                  )
                })}
                {dayEvents.length > maxShow && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - maxShow} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const eventForm = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Teacher</Label>
          <Select
            value={formData.subcalendarId}
            onValueChange={(val) => setFormData(prev => ({ ...prev, subcalendarId: val }))}
          >
            <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
            <SelectContent>
              {activeTeachers.map(t => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(t.color) }} />
                    {t.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>In-Car Session</Label>
          <Select
            value={formData.module}
            onValueChange={(val) => setFormData(prev => ({ ...prev, module: val }))}
          >
            <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
            <SelectContent>
              {MODULE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Title (optional)</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          placeholder="Custom title or notes"
        />
      </div>
      {/* Extra Hours Toggle */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={formData.isExtraHours ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFormData(prev => ({
            ...prev, isExtraHours: !prev.isExtraHours, isPaid: false,
          }))}
          className={formData.isExtraHours ? 'bg-amber-600 hover:bg-amber-700' : ''}
        >
          <Clock4 className="h-4 w-4 mr-1" />Extra Hours
        </Button>
        {formData.isExtraHours && (
          <Button
            type="button"
            variant={formData.isPaid ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFormData(prev => ({ ...prev, isPaid: !prev.isPaid }))}
            className={formData.isPaid ? 'bg-green-600 hover:bg-green-700' : 'border-red-300 text-red-600 hover:bg-red-50'}
          >
            <DollarSign className="h-4 w-4 mr-1" />{formData.isPaid ? 'Paid' : 'Not Paid'}
          </Button>
        )}
      </div>
      {/* Student Name */}
      <div>
        <Label>Student Name</Label>
        {formData.isExtraHours ? (
          <Input
            value={formData.studentName}
            onChange={(e) => setFormData(prev => ({ ...prev, studentName: e.target.value }))}
            placeholder="Enter student name"
          />
        ) : (
          <ContactSearchAutocomplete
            value={formData.studentName}
            phone={formData.studentPhone}
            group={formData.group}
            onSelect={(name, phone, groupInfo) => setFormData(prev => ({
              ...prev, studentName: name, studentPhone: phone, group: groupInfo.groupName,
              lastTheoryModule: groupInfo.lastTheoryModule, lastTheoryDate: groupInfo.lastTheoryDate,
            }))}
            onChange={(name) => setFormData(prev => ({ ...prev, studentName: name, studentPhone: '', group: '', lastTheoryModule: null, lastTheoryDate: null }))}
          />
        )}
      </div>
      {formData.isExtraHours && (
        <div>
          <Label>Phone Number</Label>
          <Input
            value={formData.studentPhone}
            onChange={(e) => setFormData(prev => ({ ...prev, studentPhone: e.target.value }))}
            placeholder="e.g. 15145551234"
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label>Date</Label>
          <Input type="date" value={formData.date} onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))} />
        </div>
        <div>
          <Label>Start Time</Label>
          <Input type="time" value={formData.startTime} onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))} />
        </div>
        <div>
          <Label>End Time</Label>
          <Input type="time" value={formData.endTime} onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label>Notes (optional)</Label>
        <textarea
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] resize-y"
          value={formData.customNotes || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, customNotes: e.target.value }))}
          placeholder="Add notes about this class..."
          rows={2}
        />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-4">
        {/* Teacher Tabs */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
          <button
            className={`relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              selectedTeacher === null ? 'text-primary-foreground' : 'text-foreground hover:bg-muted'
            }`}
            onClick={() => setSelectedTeacher(null)}
          >
            {selectedTeacher === null && (
              <motion.div
                layoutId="activeTeacherTab"
                className="absolute inset-0 bg-primary rounded-md"
                transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10">All Teachers</span>
          </button>
          {loadingTeachers ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : teachersError ? (
            <Badge variant="destructive">Failed to load teachers</Badge>
          ) : (
            activeTeachers.map(t => (
              <button
                key={t.id}
                className={`relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  selectedTeacher === t.id ? 'text-primary-foreground' : 'text-foreground hover:bg-muted'
                }`}
                onClick={() => setSelectedTeacher(t.id)}
              >
                {selectedTeacher === t.id && (
                  <motion.div
                    layoutId="activeTeacherTab"
                    className="absolute inset-0 bg-primary rounded-md"
                    transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(t.color) }} />
                  {t.name}
                </span>
              </button>
            ))
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setShowTeacherSettings(true)}
            title="Teacher Phone Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* View Switcher + Date Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            {/* View Switcher */}
            <div className="inline-flex rounded-lg border bg-muted p-1">
              {(['day', 'week', 'month'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`relative px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    viewMode === mode
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {viewMode === mode && (
                    <motion.div
                      layoutId="activeViewMode"
                      className="absolute inset-0 bg-background rounded-md shadow-sm"
                      transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                    />
                  )}
                  <span className="relative z-10">{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                </button>
              ))}
            </div>

            {/* Date Navigation */}
            <Button variant="outline" size="icon" onClick={goToPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center truncate">
              {dateLabel}
            </span>
            <Button variant="outline" size="icon" onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => {
              // Only reset form if no student data entered (preserve data on accidental close)
              if (!formData.studentName && !formData.module) {
                setFormData({
                  ...initialFormData,
                  date: formatDate(currentDate),
                  subcalendarId: selectedTeacher ? selectedTeacher.toString() : '',
                })
              }
              setDuplicateError(null)
              setShowCreateDialog(true)
            }}>
              <Plus className="h-4 w-4 mr-1" />
              New Class
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              // Only reset truck form if no student data entered (preserve data on accidental close)
              if (!truckForm.studentName && !truckForm.studentPhone) {
                setTruckForm({ studentName: '', studentPhone: '', transmission: 'manual', classes: [emptyTruckRow(1)] })
              }
              setTruckStep('form')
              setShowTruckDialog(true)
            }} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <Truck className="h-4 w-4 mr-1" />
              Truck Class
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setExportDate(formatDate(currentDate))
              setExportView(viewMode)
              setExportTeacher(selectedTeacher ? selectedTeacher.toString() : 'all')
              setExportMode('schedule')
              setExportFormat('pdf')
              setExportClassType('all')
              setShowExportDialog(true)
            }}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>

        {/* Calendar View */}
        {loadingEvents ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {viewMode === 'day' && renderDayView()}
            {viewMode === 'week' && renderWeekView()}
            {viewMode === 'month' && renderMonthView()}
          </>
        )}
      </main>

      {/* Create Event Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open)
        if (!open) { setCarBulkStep('form'); setCreateMode('single') }
      }}>
        <DialogContent className={`w-[95vw] ${createMode === 'bulk' ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[90vh] overflow-y-auto`}>
          {/* Single/Bulk Toggle */}
          {carBulkStep === 'form' && (
            <>
              <DialogHeader>
                <DialogTitle>New Class</DialogTitle>
                <DialogDescription>Schedule {createMode === 'bulk' ? 'multiple classes' : 'a new class'} for a teacher.</DialogDescription>
              </DialogHeader>

              <div className="inline-flex rounded-lg border bg-muted p-1 mb-2">
                <button
                  onClick={() => setCreateMode('single')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    createMode === 'single' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Single
                </button>
                <button
                  onClick={() => setCreateMode('bulk')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    createMode === 'bulk' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Bulk
                </button>
              </div>

              {createMode === 'single' ? (
                <>
                  {eventForm}
                  {duplicateError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>{duplicateError}</span>
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                    <Button
                      onClick={handleCreate}
                      disabled={createMutation.isPending || (!formData.module && !formData.title) || !formData.subcalendarId || !formData.date}
                    >
                      {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Create
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <div className="space-y-4">
                    {/* Student Info */}
                    <div>
                      <Label>Student Name</Label>
                      {carBulkForm.isExtraHours ? (
                        <Input
                          value={carBulkForm.studentName}
                          onChange={(e) => setCarBulkForm(prev => ({ ...prev, studentName: e.target.value }))}
                          placeholder="Enter student name"
                        />
                      ) : (
                        <ContactSearchAutocomplete
                          value={carBulkForm.studentName}
                          phone={carBulkForm.studentPhone}
                          group={carBulkForm.group}
                          onSelect={(name, phone, groupInfo) => setCarBulkForm(prev => ({
                            ...prev, studentName: name, studentPhone: phone, group: groupInfo.groupName,
                            lastTheoryModule: groupInfo.lastTheoryModule, lastTheoryDate: groupInfo.lastTheoryDate,
                          }))}
                          onChange={(name) => setCarBulkForm(prev => ({ ...prev, studentName: name, studentPhone: '', group: '', lastTheoryModule: null, lastTheoryDate: null }))}
                        />
                      )}
                    </div>
                    {carBulkForm.isExtraHours && (
                      <div>
                        <Label>Phone Number</Label>
                        <Input
                          value={carBulkForm.studentPhone}
                          onChange={(e) => setCarBulkForm(prev => ({ ...prev, studentPhone: e.target.value }))}
                          placeholder="e.g. 15145551234"
                        />
                      </div>
                    )}

                    {/* Extra Hours */}
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant={carBulkForm.isExtraHours ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCarBulkForm(prev => ({ ...prev, isExtraHours: !prev.isExtraHours, isPaid: false }))}
                        className={carBulkForm.isExtraHours ? 'bg-amber-600 hover:bg-amber-700' : ''}
                      >
                        <Clock4 className="h-4 w-4 mr-1" />Extra Hours
                      </Button>
                      {carBulkForm.isExtraHours && (
                        <Button
                          type="button"
                          variant={carBulkForm.isPaid ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCarBulkForm(prev => ({ ...prev, isPaid: !prev.isPaid }))}
                          className={carBulkForm.isPaid ? 'bg-green-600 hover:bg-green-700' : 'border-red-300 text-red-600 hover:bg-red-50'}
                        >
                          <DollarSign className="h-4 w-4 mr-1" />{carBulkForm.isPaid ? 'Paid' : 'Not Paid'}
                        </Button>
                      )}
                    </div>

                    {/* Class Rows */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-base font-semibold">Classes ({carBulkForm.classes.length})</Label>
                        <Button type="button" size="sm" variant="outline" onClick={addCarClass}>
                          <Plus className="h-3 w-3 mr-1" />Add Class
                        </Button>
                      </div>

                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                        {carBulkForm.classes.map((cls, idx) => (
                          <div key={idx} className="p-3 rounded-lg border border-border bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                                #{idx + 1}
                              </span>
                              {carBulkForm.classes.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 ml-auto text-muted-foreground hover:text-red-600"
                                  onClick={() => removeCarClass(idx)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                              <div>
                                <Select
                                  value={cls.subcalendarId}
                                  onValueChange={(val) => updateCarClass(idx, { subcalendarId: val })}
                                >
                                  <SelectTrigger className="text-xs h-8">
                                    <SelectValue placeholder="Teacher" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {activeTeachers.map(t => (
                                      <SelectItem key={t.id} value={t.id.toString()}>
                                        <div className="flex items-center gap-1">
                                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(t.color) }} />
                                          <span className="text-xs">{t.name}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Select
                                  value={cls.module}
                                  onValueChange={(val) => updateCarClass(idx, { module: val })}
                                >
                                  <SelectTrigger className="text-xs h-8">
                                    <SelectValue placeholder="Session" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MODULE_OPTIONS.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        <span className="text-xs">{opt.label.replace(' (In-Car)', '')}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Input
                                  type="date"
                                  value={cls.date}
                                  onChange={(e) => updateCarClass(idx, { date: e.target.value })}
                                  className="text-xs h-8"
                                />
                              </div>
                              <div>
                                <Input
                                  type="time"
                                  value={cls.startTime}
                                  onChange={(e) => updateCarClass(idx, { startTime: e.target.value })}
                                  className="text-xs h-8"
                                />
                              </div>
                              <div>
                                <Input
                                  type="time"
                                  value={cls.endTime}
                                  onChange={(e) => updateCarClass(idx, { endTime: e.target.value })}
                                  className="text-xs h-8"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <Label>Notes (optional)</Label>
                      <textarea
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[50px] resize-y"
                        value={carBulkForm.customNotes}
                        onChange={(e) => setCarBulkForm(prev => ({ ...prev, customNotes: e.target.value }))}
                        placeholder="Add notes..."
                        rows={2}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                    <Button
                      onClick={() => setCarBulkStep('preview')}
                      disabled={!carBulkForm.studentName || carBulkForm.classes.some(c => !c.date || !c.subcalendarId)}
                    >
                      Review Schedule
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}

          {/* Bulk Preview Step */}
          {carBulkStep === 'preview' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Schedule Preview
                </DialogTitle>
                <DialogDescription>Review the schedule before creating classes.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Student Info Summary */}
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                  <div>
                    <p className="text-sm text-muted-foreground">Student</p>
                    <p className="font-semibold">{carBulkForm.studentName}</p>
                  </div>
                  {carBulkForm.group && (
                    <div>
                      <p className="text-sm text-muted-foreground">Group</p>
                      <p className="font-medium">{carBulkForm.group}</p>
                    </div>
                  )}
                  {carBulkForm.studentPhone && (
                    <div className="ml-auto">
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">+{carBulkForm.studentPhone}</p>
                    </div>
                  )}
                </div>

                {carBulkForm.isExtraHours && (
                  <div className={`flex items-center gap-2 p-2 rounded-lg border ${carBulkForm.isPaid ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300'}`}>
                    <Clock4 className="h-4 w-4" />
                    <span className="text-sm font-medium">Extra Hours</span>
                    <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded ${carBulkForm.isPaid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {carBulkForm.isPaid ? 'Paid' : 'Not Paid'}
                    </span>
                  </div>
                )}

                {/* Schedule Table */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary text-primary-foreground">
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Date</th>
                        <th className="text-left px-3 py-2 font-medium">Time</th>
                        <th className="text-left px-3 py-2 font-medium">Session</th>
                        <th className="text-left px-3 py-2 font-medium">Teacher</th>
                      </tr>
                    </thead>
                    <tbody>
                      {carBulkForm.classes.map((cls, idx) => {
                        const teacher = activeTeachers.find(t => t.id.toString() === cls.subcalendarId)
                        const moduleOpt = MODULE_OPTIONS.find(o => o.value === cls.module)
                        return (
                          <tr key={idx} className={`border-t ${idx % 2 === 1 ? 'bg-muted/30' : ''}`}>
                            <td className="px-3 py-2">
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">#{idx + 1}</span>
                            </td>
                            <td className="px-3 py-2 font-medium">{formatDateNice(cls.date)}</td>
                            <td className="px-3 py-2">{formatTimeDisplay12h(cls.startTime)} – {formatTimeDisplay12h(cls.endTime)}</td>
                            <td className="px-3 py-2 text-primary font-medium">{moduleOpt ? moduleOpt.label.replace(' (In-Car)', '') : cls.module || '—'}</td>
                            <td className="px-3 py-2">
                              {teacher ? (
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getColor(teacher.color) }} />
                                  <span className="text-xs">{teacher.name}</span>
                                </div>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{carBulkForm.classes.length} class{carBulkForm.classes.length !== 1 ? 'es' : ''}</span>
                  <span>•</span>
                  <span>Reminders 1h before each class</span>
                </div>
              </div>

              <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setCarBulkStep('form')} className="sm:mr-auto">
                  <ArrowLeft className="h-4 w-4 mr-1" />Back
                </Button>
                <Button
                  onClick={handleCarBulkSubmit}
                  disabled={carBulkCreating}
                >
                  {carBulkCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Create All ({carBulkForm.classes.length})
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditingEvent(null) } }}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
            <DialogDescription>Modify or delete this class.</DialogDescription>
          </DialogHeader>
          {eventForm}
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending || !formData.date}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <Dialog open={showEventDetail} onOpenChange={(open) => { if (!open) { setShowEventDetail(false); setSelectedEvent(null); setTheoryGroupId(null); setEditingStudentInfo(false) } }}>
        <DialogContent className="w-[95vw] sm:max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Class Details</DialogTitle>
            <DialogDescription>View class information</DialogDescription>
          </DialogHeader>
          {selectedEvent && (() => {
            const parsed = parseModuleFromTitle(selectedEvent.title)
            const phone = parsePhoneFromNotes(selectedEvent.notes)
            const studentFromNotes = parseStudentFromNotes(selectedEvent.notes)
            const groupFromNotes = parseGroupFromNotes(selectedEvent.notes)
            const lastTheory = parseLastTheoryFromNotes(selectedEvent.notes)
            const isExtra = parseExtraHoursFromNotes(selectedEvent.notes)
            const isPaid = parsePaidFromNotes(selectedEvent.notes)
            const teacher = activeTeachers.find(t => t.id === selectedEvent.subcalendar_ids[0])
            const startDt = new Date(selectedEvent.start_dt)
            const endDt = new Date(selectedEvent.end_dt)
            const dateStr = startDt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            const startTimeStr = startDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            const endTimeStr = endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            const moduleLabel = parsed.module ? getModuleLabel(parsed.module) : ''
            // Get phase from class module, fall back to group's last theory module from notes
            const phaseInfo = parsed.module
              ? getPhaseInfo(parsed.module)
              : (lastTheory.module ? getPhaseInfo(String(lastTheory.module)) : null)
            const studentName = studentFromNotes || parsed.studentName
            const group = groupFromNotes || parsed.group
            const isTheory = isTheoryEvent(selectedEvent)
            const isTruck = isTruckClass(selectedEvent)
            const isExam = isTruckExam(selectedEvent)
            const examLocation = parseExamLocationFromNotes(selectedEvent.notes)
            const truckClassNum = parseTruckClassNumberFromNotes(selectedEvent.notes)

            return (
              <div className="space-y-4">
                {/* Extra Hours Badge */}
                {isExtra && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg border-2 ${isPaid ? 'bg-amber-50 border-amber-400' : 'bg-red-50 border-red-400'}`}>
                    <Clock4 className={`h-5 w-5 ${isPaid ? 'text-amber-600' : 'text-red-600'}`} />
                    <span className="font-medium">Extra Hours</span>
                    <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium ${isPaid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      <DollarSign className="h-3.5 w-3.5" />
                      {isPaid ? 'Paid' : 'Not Paid'}
                    </span>
                  </div>
                )}

                {/* Truck Class Badge */}
                {isTruck && !isExam && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border-2 bg-emerald-50 border-emerald-400">
                    <Truck className="h-5 w-5 text-emerald-600" />
                    <span className="font-medium text-emerald-800">Truck Class{truckClassNum ? ` #${truckClassNum}` : ''}</span>
                  </div>
                )}

                {/* Truck Exam Badge */}
                {isExam && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border-2 bg-red-50 border-red-400">
                    <Truck className="h-5 w-5 text-red-600" />
                    <span className="font-medium text-red-800">Truck Exam</span>
                    {examLocation && (
                      <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium bg-red-100 text-red-800">
                        <MapPin className="h-3.5 w-3.5" />
                        {examLocation}
                      </span>
                    )}
                  </div>
                )}

                {/* Class Info & Phase */}
                {(moduleLabel || phaseInfo) && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3 overflow-hidden">
                    <div className="flex items-center justify-between gap-3">
                      {moduleLabel && (
                        <div className="flex items-center gap-3 min-w-0">
                          <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-muted-foreground">Class</p>
                            <p className="font-medium truncate">{moduleLabel}</p>
                          </div>
                        </div>
                      )}
                      {phaseInfo && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <GraduationCap className="h-5 w-5 text-primary" />
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${phaseInfo.color}`}>
                            {phaseInfo.label}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Student Info */}
                {(studentName || phone) && (
                  <div className="p-3 border rounded-lg space-y-3 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Student Info</span>
                      {!editingStudentInfo ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            setEditStudentName(studentName)
                            setEditStudentPhone(phone)
                            setEditingStudentInfo(true)
                            updateStudentInfoMutation.reset()
                          }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingStudentInfo(false)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {editingStudentInfo ? (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input value={editStudentName} onChange={e => setEditStudentName(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Phone</Label>
                          <Input value={editStudentPhone} onChange={e => setEditStudentPhone(e.target.value)} className="h-8 text-sm" />
                        </div>
                        {updateStudentInfoMutation.isError && (
                          <p className="text-xs text-destructive">{updateStudentInfoMutation.error?.message || 'Failed to update'}</p>
                        )}
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={updateStudentInfoMutation.isPending}
                          onClick={() => {
                            if (!selectedEvent) return
                            updateStudentInfoMutation.mutate({
                              eventId: selectedEvent.id,
                              name: editStudentName,
                              phone: editStudentPhone,
                            })
                          }}
                        >
                          {updateStudentInfoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                          Save
                        </Button>
                      </div>
                    ) : (
                      <>
                        {studentName && (
                          <div className="flex items-center gap-3 min-w-0">
                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm text-muted-foreground">Student</p>
                              <p className="font-medium truncate">{studentName}</p>
                            </div>
                          </div>
                        )}
                        {phone && (
                          <div className="flex items-center gap-3 min-w-0">
                            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm text-muted-foreground">Phone</p>
                              <a href={`tel:+${phone}`} className="font-medium text-primary hover:underline truncate block">+{phone}</a>
                            </div>
                          </div>
                        )}
                        {group && (
                          <div className="flex items-center gap-3 min-w-0">
                            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm text-muted-foreground">Group</p>
                              <p className="font-medium truncate">{group}</p>
                            </div>
                          </div>
                        )}
                        {lastTheory.module && (
                          <div className="flex items-center gap-3 min-w-0">
                            <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm text-muted-foreground">Last Theory Class</p>
                              <p className="font-medium truncate">
                                Module {lastTheory.module}
                                {lastTheory.date && <span className="text-sm text-muted-foreground ml-1">— {lastTheory.date}</span>}
                              </p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Teacher */}
                {teacher && (
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(teacher.color) }} />
                    <div>
                      <p className="text-sm text-muted-foreground">Teacher</p>
                      <p className="font-medium">{teacher.name}</p>
                    </div>
                  </div>
                )}

                {/* Date & Time */}
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Date & Time</p>
                    <p className="font-medium">{dateStr}</p>
                    <p className="text-sm">{startTimeStr} - {endTimeStr}</p>
                  </div>
                </div>

                {/* Custom title / notes */}
                {(parsed.title || parseCustomNotesFromNotes(selectedEvent.notes)) && (
                  <div className="flex items-center gap-3">
                    <Edit3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Notes</p>
                      {parsed.title && <p className="font-medium">{parsed.title}</p>}
                      {parseCustomNotesFromNotes(selectedEvent.notes) && (
                        <p className="text-sm text-muted-foreground">{parseCustomNotesFromNotes(selectedEvent.notes)}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            {/* Left side buttons */}
            <div className="flex gap-2">
              {/* Present toggle */}
              {selectedEvent && (() => {
                const isPresent = isEventPresent(selectedEvent.id)
                return (
                  <Button
                    variant={isPresent ? 'default' : 'outline'}
                    className={isPresent ? 'bg-green-600 hover:bg-green-700' : ''}
                    disabled={togglePresentMutation.isPending}
                    onClick={() => togglePresentMutation.mutate({ eventId: selectedEvent.id, present: !isPresent })}
                  >
                    {togglePresentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    {isPresent ? 'Present' : 'Mark Present'}
                  </Button>
                )
              })()}
              {/* View Theory Class button */}
              {selectedEvent && isTheoryEvent(selectedEvent) && theoryGroupId && (
                <Link href={`/groups/${encodeURIComponent(theoryGroupId)}`}>
                  <Button variant="outline" className="w-full sm:w-auto">
                    <Eye className="h-4 w-4 mr-2" />
                    View Theory Class
                  </Button>
                </Link>
              )}
              {/* View Truck Schedule button */}
              {selectedEvent && isTruckClass(selectedEvent) && (
                <Button variant="outline" onClick={() => handleViewTruckSchedule(selectedEvent)}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Schedule
                </Button>
              )}
            </div>
            {/* Right side buttons */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEventDetail(false)}>Close</Button>
              <Button onClick={handleEditFromDetail}>
                <Edit3 className="h-4 w-4 mr-2" />Edit
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Truck Class Dialog (Form + Preview steps) */}
      <Dialog open={showTruckDialog} onOpenChange={(open) => {
        if (!open) { setShowTruckDialog(false); setTruckStep('form') }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {truckStep === 'form' ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-emerald-600" />
                  Create Truck Classes
                </DialogTitle>
                <DialogDescription>Schedule multiple truck training classes for a student.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Student Info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>Student Name</Label>
                    <Input
                      value={truckForm.studentName}
                      onChange={(e) => setTruckForm(prev => ({ ...prev, studentName: e.target.value }))}
                      placeholder="Enter student name"
                    />
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <Input
                      value={truckForm.studentPhone}
                      onChange={(e) => setTruckForm(prev => ({ ...prev, studentPhone: e.target.value }))}
                      placeholder="e.g. 15145551234"
                    />
                  </div>
                  <div>
                    <Label>Transmission</Label>
                    <div className="flex gap-1 mt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={truckForm.transmission === 'manual' ? 'default' : 'outline'}
                        className={`flex-1 ${truckForm.transmission === 'manual' ? '' : 'text-muted-foreground'}`}
                        onClick={() => setTruckForm(prev => ({ ...prev, transmission: 'manual' }))}
                      >
                        Manual
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={truckForm.transmission === 'auto' ? 'default' : 'outline'}
                        className={`flex-1 ${truckForm.transmission === 'auto' ? '' : 'text-muted-foreground'}`}
                        onClick={() => setTruckForm(prev => ({ ...prev, transmission: 'auto' }))}
                      >
                        Auto
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Class Rows */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base font-semibold">Classes ({truckForm.classes.length})</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addTruckClass}>
                      <Plus className="h-3 w-3 mr-1" />Add Class
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {truckForm.classes.map((cls, idx) => {
                      return (
                        <div key={idx} className={`p-3 rounded-lg border ${cls.isExam ? 'border-red-200 bg-red-50/50' : 'border-border bg-muted/30'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            {cls.isExam ? (
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">EXAM</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-emerald-700">#</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={cls.classNumber ?? ''}
                                  onChange={(e) => updateTruckClass(idx, { classNumber: parseInt(e.target.value) || null })}
                                  className="w-10 h-6 text-xs font-bold text-center rounded bg-emerald-100 text-emerald-700 border-0 focus:ring-1 focus:ring-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-2 ml-auto">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <Checkbox
                                  checked={cls.isExam}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      updateTruckClass(idx, { isExam: true, examLocation: cls.examLocation || '', classNumber: null })
                                    } else {
                                      const lastNum = truckForm.classes.filter((c, i) => i !== idx && !c.isExam && c.classNumber != null).reduce((max, c) => Math.max(max, c.classNumber!), 0)
                                      updateTruckClass(idx, { isExam: false, examLocation: '', classNumber: lastNum + 1 })
                                    }
                                  }}
                                />
                                Exam
                              </label>
                              {truckForm.classes.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                                  onClick={() => removeTruckClass(idx)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            <div>
                              <Input
                                type="date"
                                value={cls.date}
                                onChange={(e) => updateTruckClass(idx, { date: e.target.value })}
                                className="text-xs h-8"
                              />
                            </div>
                            <div>
                              <Input
                                type="time"
                                value={cls.startTime}
                                onChange={(e) => updateTruckClass(idx, { startTime: e.target.value })}
                                className="text-xs h-8"
                              />
                            </div>
                            <div>
                              <Input
                                type="time"
                                value={cls.endTime}
                                onChange={(e) => updateTruckClass(idx, { endTime: e.target.value })}
                                className="text-xs h-8"
                              />
                            </div>
                            {cls.isExam && (
                              <div>
                                <Select
                                  value={cls.examLocation}
                                  onValueChange={(val) => updateTruckClass(idx, { examLocation: val })}
                                >
                                  <SelectTrigger className="text-xs h-8">
                                    <SelectValue placeholder="Location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {EXAM_LOCATIONS.map(loc => (
                                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowTruckDialog(false)}>Cancel</Button>
                <Button
                  onClick={() => setTruckStep('preview')}
                  disabled={!truckForm.studentName || !truckForm.studentPhone || truckForm.classes.some(c => !c.date)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Review Schedule
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  Schedule Preview
                </DialogTitle>
                <DialogDescription>Review the schedule before creating classes.</DialogDescription>
              </DialogHeader>

              {/* Preview Content */}
              <div className="space-y-4">
                {/* Student Info Summary */}
                <div className="flex items-center gap-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div>
                    <p className="text-sm text-muted-foreground">Student</p>
                    <p className="font-semibold">{truckForm.studentName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Transmission</p>
                    <p className="font-medium">{truckForm.transmission === 'auto' ? 'Automatic' : 'Manual'}</p>
                  </div>
                  <div className="ml-auto">
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">+{truckForm.studentPhone}</p>
                  </div>
                </div>

                {/* Schedule Table */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-emerald-600 text-white">
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Date</th>
                        <th className="text-left px-3 py-2 font-medium">Time</th>
                        <th className="text-left px-3 py-2 font-medium">Type</th>
                        <th className="text-left px-3 py-2 font-medium">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {truckForm.classes.map((cls, idx) => (
                            <tr key={idx} className={`border-t ${cls.isExam ? 'bg-red-50' : idx % 2 === 1 ? 'bg-emerald-50/50' : ''}`}>
                              <td className="px-3 py-2">
                                {cls.isExam ? (
                                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">EXAM</span>
                                ) : (
                                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">#{cls.classNumber ?? '?'}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-medium">{formatDateNice(cls.date)}</td>
                              <td className="px-3 py-2">{formatTimeDisplay12h(cls.startTime)} – {formatTimeDisplay12h(cls.endTime)}</td>
                              <td className="px-3 py-2">
                                <span className={`text-xs font-medium ${cls.isExam ? 'text-red-700' : 'text-emerald-700'}`}>
                                  {cls.isExam ? 'Exam' : 'Class'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{cls.isExam && cls.examLocation ? cls.examLocation : '—'}</td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary Stats */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{truckForm.classes.filter(c => !c.isExam).length} classes</span>
                  {truckForm.classes.some(c => c.isExam) && (
                    <span className="text-red-600 font-medium">{truckForm.classes.filter(c => c.isExam).length} exam{truckForm.classes.filter(c => c.isExam).length !== 1 ? 's' : ''}</span>
                  )}
                  <span>•</span>
                  <span>Reminders 6h before each class</span>
                </div>

                {/* Duplicate Error */}
                {truckDuplicateError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                    <div className="flex items-start gap-2 text-sm font-medium text-red-800">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>Duplicate classes found:</span>
                    </div>
                    {truckDuplicateError.map((msg, i) => (
                      <p key={i} className="text-sm text-red-700 pl-6">{msg}</p>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                <Button variant="outline" onClick={() => { setTruckStep('form'); setTruckDuplicateError(null) }} className="sm:mr-auto">
                  <ArrowLeft className="h-4 w-4 mr-1" />Back
                </Button>
                <Button variant="outline" onClick={() => handlePrintTruckSchedule(truckForm)}>
                  <Printer className="h-4 w-4 mr-1" />Print PDF
                </Button>
                <Button
                  onClick={handleTruckSubmit}
                  disabled={truckCreating}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {truckCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Truck className="h-4 w-4 mr-2" />}
                  Confirm & Send
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Truck Schedule Viewer (from event detail) */}
      <Dialog open={showTruckSchedule} onOpenChange={(open) => {
        if (!open) { setShowTruckSchedule(false); setTruckScheduleData(null) }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              Truck Training Schedule
            </DialogTitle>
            <DialogDescription>Complete schedule for this student.</DialogDescription>
          </DialogHeader>

          {truckScheduleData && (
            <div className="space-y-4">
              {/* Student Info */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div>
                  <p className="text-sm text-muted-foreground">Student</p>
                  <p className="font-semibold">{truckScheduleData.studentName}</p>
                </div>
                {truckScheduleData.studentPhone && (
                  <div className="ml-auto">
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">+{truckScheduleData.studentPhone}</p>
                  </div>
                )}
              </div>

              {/* Schedule Table */}
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-emerald-600 text-white">
                      <th className="text-left px-3 py-2 font-medium">#</th>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Time</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="text-left px-3 py-2 font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {truckScheduleData.classes.map((cls, idx) => (
                        <tr key={idx} className={`border-t ${cls.isExam ? 'bg-red-50' : idx % 2 === 1 ? 'bg-emerald-50/50' : ''}`}>
                            <td className="px-3 py-2">
                              {cls.isExam ? (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">EXAM</span>
                              ) : (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">#{cls.classNumber ?? '?'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium">{formatDateNice(cls.date)}</td>
                            <td className="px-3 py-2">{formatTimeDisplay12h(cls.startTime)} – {formatTimeDisplay12h(cls.endTime)}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs font-medium ${cls.isExam ? 'text-red-700' : 'text-emerald-700'}`}>
                                {cls.isExam ? 'Exam' : 'Class'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{cls.isExam && cls.examLocation ? cls.examLocation : '—'}</td>
                          </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{truckScheduleData.classes.filter(c => !c.isExam).length} classes</span>
                {truckScheduleData.classes.some(c => c.isExam) && (
                  <span className="text-red-600 font-medium">{truckScheduleData.classes.filter(c => c.isExam).length} exam{truckScheduleData.classes.filter(c => c.isExam).length !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTruckSchedule(false); setTruckScheduleData(null) }}>Close</Button>
            {truckScheduleData && (
              <Button variant="outline" onClick={() => handlePrintTruckSchedule(truckScheduleData)}>
                <Printer className="h-4 w-4 mr-1" />Print PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Teacher Phone Settings Dialog */}
      <Dialog open={showTeacherSettings} onOpenChange={setShowTeacherSettings}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Teacher Phone Numbers
            </DialogTitle>
            <DialogDescription>
              Add phone numbers to notify teachers via WhatsApp when classes are created, updated, or cancelled within the next 7 days.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {activeTeachers.map(teacher => (
              <div key={teacher.id} className="flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-[120px]">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(teacher.color) }} />
                  <span className="text-sm font-medium">{teacher.name}</span>
                </div>
                <Input
                  placeholder="15145551234"
                  value={teacherPhones[teacher.id] || ''}
                  onChange={(e) => setTeacherPhones(prev => ({ ...prev, [teacher.id]: e.target.value }))}
                  className="flex-1"
                />
              </div>
            ))}
            {activeTeachers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No teachers found. Make sure subcalendars are configured in Teamup.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTeacherSettings(false)}>Cancel</Button>
            <Button onClick={handleSaveTeacherPhones} disabled={savingTeacherPhones}>
              {savingTeacherPhones ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Schedule
            </DialogTitle>
            <DialogDescription>
              Choose what to export and the format
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Teacher Selection */}
            <div>
              <Label>Teacher</Label>
              <Select value={exportTeacher} onValueChange={setExportTeacher}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teachers</SelectItem>
                  {activeTeachers.map(t => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(t.color) }} />
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Class Type Selection */}
            <div>
              <Label>Class Type</Label>
              <div className="flex gap-2 mt-1.5">
                {(['all', 'car', 'truck'] as ExportClassType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setExportClassType(t)}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                      exportClassType === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-input'
                    }`}
                  >
                    {t === 'all' ? 'All' : t === 'car' ? 'Car' : 'Truck'}
                  </button>
                ))}
              </div>
            </div>

            {/* View Selection */}
            <div>
              <Label>Date Range</Label>
              <div className="flex gap-2 mt-1.5">
                {(['day', 'week', 'month'] as ExportView[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setExportView(v)}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                      exportView === v
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-input'
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Date picker */}
            <div>
              <Label>{exportView === 'day' ? 'Date' : exportView === 'week' ? 'Week of' : 'Month'}</Label>
              <Input
                type={exportView === 'month' ? 'month' : 'date'}
                value={exportView === 'month' ? (exportDate ? exportDate.slice(0, 7) : '') : exportDate}
                onChange={(e) => {
                  if (exportView === 'month') {
                    setExportDate(e.target.value ? e.target.value + '-01' : '')
                  } else {
                    setExportDate(e.target.value)
                  }
                }}
              />
            </div>

            {/* Export Mode (only for day view, but useful for all) */}
            <div>
              <Label>Export Type</Label>
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={() => setExportMode('schedule')}
                  className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-md border transition-colors ${
                    exportMode === 'schedule'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-input'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <FileText className="h-4 w-4" />
                    <span>Full Schedule</span>
                  </div>
                </button>
                <button
                  onClick={() => setExportMode('attendance')}
                  className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-md border transition-colors ${
                    exportMode === 'attendance'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-input'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Check className="h-4 w-4" />
                    <span>Attendance Summary</span>
                  </div>
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {exportMode === 'schedule'
                  ? 'Exports all class details including student info, times, and payment status'
                  : 'Exports a summary of who was present or absent in each class'
                }
              </p>
            </div>

            {/* Format Selection */}
            <div>
              <Label>Format</Label>
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={() => setExportFormat('pdf')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                    exportFormat === 'pdf'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-input'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Printer className="h-4 w-4" />
                    <span>PDF</span>
                  </div>
                </button>
                <button
                  onClick={() => setExportFormat('csv')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                    exportFormat === 'csv'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-input'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    <span>CSV</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>Cancel</Button>
            <Button onClick={handleExport} disabled={!exportDate}>
              <Download className="h-4 w-4 mr-2" />
              Export {exportFormat.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Notification Status */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {notifyStatus && (
            <motion.div
              key="notify"
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
                notifyStatus === 'sending' ? 'bg-blue-100 text-blue-800' :
                notifyStatus === 'sent' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}
            >
              {notifyStatus === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
              {notifyStatus === 'sent' && <CheckCircle2 className="h-4 w-4" />}
              {notifyStatus === 'failed' && <AlertCircle className="h-4 w-4" />}
              <MessageCircle className="h-4 w-4" />
              {notifyStatus === 'sending' && 'Sending WhatsApp message...'}
              {notifyStatus === 'sent' && 'WhatsApp message sent!'}
              {notifyStatus === 'failed' && (notifyError ? `Failed: ${notifyError}` : 'Failed to send WhatsApp message')}
            </motion.div>
          )}
          {truckNotifyStatus && (
            <motion.div
              key="truck-notify"
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
                truckNotifyStatus === 'sending' ? 'bg-emerald-100 text-emerald-800' :
                truckNotifyStatus === 'sent' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}
            >
              {truckNotifyStatus === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
              {truckNotifyStatus === 'sent' && <CheckCircle2 className="h-4 w-4" />}
              {truckNotifyStatus === 'failed' && <AlertCircle className="h-4 w-4" />}
              <Truck className="h-4 w-4" />
              {truckNotifyStatus === 'sending' && 'Creating truck classes & sending schedule...'}
              {truckNotifyStatus === 'sent' && 'Truck classes created & schedule sent!'}
              {truckNotifyStatus === 'failed' && 'Failed to create truck classes'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
