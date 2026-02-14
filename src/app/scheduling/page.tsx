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
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
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
}

interface TruckClassRow {
  date: string
  startTime: string
  endTime: string
  isExam: boolean
  examLocation: string
}

const EXAM_LOCATIONS = ['Laval', 'Joliette', 'Saint-Jérôme']

const emptyTruckRow = (): TruckClassRow => ({
  date: '',
  startTime: '09:00',
  endTime: '10:00',
  isExam: false,
  examLocation: '',
})

interface TruckFormData {
  studentName: string
  studentPhone: string
  classes: TruckClassRow[]
}

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
    classes: [emptyTruckRow()],
  })
  const [truckCreating, setTruckCreating] = useState(false)
  const [truckNotifyStatus, setTruckNotifyStatus] = useState<null | 'sending' | 'sent' | 'failed'>(null)
  const [truckStep, setTruckStep] = useState<'form' | 'preview'>('form')
  const [truckDuplicateError, setTruckDuplicateError] = useState<string[] | null>(null)

  // Truck schedule viewer (from event detail)
  const [showTruckSchedule, setShowTruckSchedule] = useState(false)
  const [truckScheduleData, setTruckScheduleData] = useState<{ studentName: string; studentPhone: string; classes: TruckClassRow[] } | null>(null)

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

  // Build notes string with phone
  const buildNotes = (data: EventFormData) => {
    const noteLines = []
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

  // Derive phase from module value
  const getPhaseInfo = (moduleVal: string): { phase: number | null; label: string; color: string } | null => {
    if (!moduleVal) return null
    if (moduleVal.startsWith('S')) {
      return { phase: null, label: 'In-Car', color: 'bg-orange-100 text-orange-800' }
    }
    const num = parseInt(moduleVal)
    if (isNaN(num)) return null
    if (num >= 1 && num <= 5) return { phase: 1, label: 'Phase 1', color: 'bg-yellow-100 text-yellow-800' }
    if (num >= 6 && num <= 7) return { phase: 2, label: 'Phase 2', color: 'bg-green-100 text-green-800' }
    if (num >= 8 && num <= 10) return { phase: 3, label: 'Phase 3', color: 'bg-blue-100 text-blue-800' }
    if (num >= 11 && num <= 12) return { phase: 4, label: 'Phase 4', color: 'bg-purple-100 text-purple-800' }
    return null
  }

  // Send WhatsApp notification
  const sendNotification = async (data: EventFormData) => {
    if (!data.studentPhone) return
    setNotifyStatus('sending')
    try {
      const teacher = activeTeachers.find(t => t.id.toString() === data.subcalendarId)
      const moduleLabel = getModuleLabel(data.module)
      const dateObj = new Date(data.date)
      const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      const res = await fetch('/api/scheduling/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: data.studentPhone,
          studentName: data.studentName,
          module: moduleLabel,
          teacherName: teacher?.name || '',
          date: dateStr,
          startTime: data.startTime,
          endTime: data.endTime,
        }),
      })
      if (res.ok) {
        setNotifyStatus('sent')
      } else {
        setNotifyStatus('failed')
      }
    } catch {
      setNotifyStatus('failed')
    }
    setTimeout(() => setNotifyStatus(null), 4000)
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
      setFormData(initialFormData)
    },
  })

  // Update event mutation
  const updateMutation = useMutation({
    mutationFn: async ({ eventId, data }: { eventId: string; data: EventFormData }) => {
      const title = buildTitle(data)
      const res = await fetch(`/api/scheduling/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          startDate: `${data.date}T${data.startTime}:00`,
          endDate: `${data.date}T${data.endTime}:00`,
          subcalendarIds: [parseInt(data.subcalendarId)],
          notes: buildNotes(data),
        }),
      })
      if (!res.ok) throw new Error('Failed to update event')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
      setShowEditDialog(false)
      setEditingEvent(null)
      setFormData(initialFormData)
    },
  })

  // Delete event mutation
  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await fetch(`/api/scheduling/events/${eventId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete event')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
      setShowEditDialog(false)
      setEditingEvent(null)
    },
  })

  // Open create dialog pre-filled with day/time
  const handleSlotClick = (date: Date, hour: number) => {
    setFormData({
      ...initialFormData,
      date: formatDate(date),
      startTime: `${hour.toString().padStart(2, '0')}:00`,
      endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
      subcalendarId: selectedTeacher ? selectedTeacher.toString() : '',
    })
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

  const parseLastTheoryFromNotes = (notes?: string): { module: number | null; date: string | null } => {
    if (!notes) return { module: null, date: null }
    const match = stripHtml(notes).match(/LastTheory:\s*(\d+)(?:\s*\((.+?)\))?/)
    if (!match) return { module: null, date: null }
    return { module: parseInt(match[1]), date: match[2] || null }
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
      }
      return { ...prev, classes: [...prev.classes, newRow] }
    })
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
          classes: truckForm.classes.map(c => ({
            date: c.date,
            startTime: c.startTime,
            endTime: c.endTime,
            isExam: c.isExam,
            examLocation: c.isExam ? c.examLocation : null,
          })),
        }),
      })

      if (res.ok) {
        const result = await res.json()
        queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
        setShowTruckDialog(false)
        setTruckStep('form')
        setTruckForm({ studentName: '', studentPhone: '', classes: [emptyTruckRow()] })
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
  const handleViewTruckSchedule = (event: TeamupEvent) => {
    const studentName = parseStudentFromNotes(event.notes)
    const studentPhone = parsePhoneFromNotes(event.notes)
    if (!studentName) return

    // Find all truck events for this student from loaded events
    const truckEvents = events
      .filter(ev => isTruckClass(ev) && parseStudentFromNotes(ev.notes) === studentName)
      .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

    const scheduleClasses: TruckClassRow[] = truckEvents.map(ev => {
      const startDt = new Date(ev.start_dt)
      const endDt = new Date(ev.end_dt)
      const examLoc = parseExamLocationFromNotes(ev.notes)
      return {
        date: formatDate(startDt),
        startTime: startDt.toTimeString().slice(0, 5),
        endTime: endDt.toTimeString().slice(0, 5),
        isExam: !!examLoc,
        examLocation: examLoc,
      }
    })

    setTruckScheduleData({ studentName, studentPhone, classes: scheduleClasses })
    setShowEventDetail(false)
    setShowTruckSchedule(true)
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
    if (!editingEvent || (!formData.module && !formData.title) || !formData.date || !formData.subcalendarId) return
    updateMutation.mutate({ eventId: editingEvent.id, data: formData })
  }

  const handleDelete = () => {
    if (!editingEvent) return
    deleteMutation.mutate(editingEvent.id)
  }

  // Render an event block (shared between day and week views)
  const renderEventBlock = (event: TeamupEvent, top: number, height: number, wide?: boolean) => {
    const color = getEventColor(event)
    const teacherName = getTeacherName(event)
    const isExtra = parseExtraHoursFromNotes(event.notes)
    const isPaid = parsePaidFromNotes(event.notes)
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
        title={`${event.title}\n${teacherName}\n${startTime}`}
      >
        <div className="font-medium truncate">{event.title}</div>
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
                  const color = getEventColor(event)
                  return (
                    <div
                      key={event.id}
                      className="text-[10px] leading-tight truncate rounded px-1 py-0.5 cursor-pointer"
                      style={{
                        backgroundColor: isExtra ? (isPaid ? '#FDE68A' : '#FCA5A5') : color,
                        color: isExtra ? '#000' : '#fff',
                      }}
                      onClick={(e) => handleEventClick(event, e)}
                    >
                      {event.title}
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
            studentPhone: '', group: '', lastTheoryModule: null, lastTheoryDate: null,
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
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-4">
        {/* Teacher Tabs */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
          <Button
            variant={selectedTeacher === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedTeacher(null)}
          >
            All Teachers
          </Button>
          {loadingTeachers ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : teachersError ? (
            <Badge variant="destructive">Failed to load teachers</Badge>
          ) : (
            activeTeachers.map(t => (
              <Button
                key={t.id}
                variant={selectedTeacher === t.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTeacher(t.id)}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(t.color) }} />
                {t.name}
              </Button>
            ))
          )}
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
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    viewMode === mode
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
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
              setFormData({
                ...initialFormData,
                date: formatDate(currentDate),
                subcalendarId: selectedTeacher ? selectedTeacher.toString() : '',
              })
              setDuplicateError(null)
              setShowCreateDialog(true)
            }}>
              <Plus className="h-4 w-4 mr-1" />
              New Class
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setTruckForm({ studentName: '', studentPhone: '', classes: [emptyTruckRow()] })
              setTruckStep('form')
              setShowTruckDialog(true)
            }} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <Truck className="h-4 w-4 mr-1" />
              Truck Class
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
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Class</DialogTitle>
            <DialogDescription>Schedule a new class for a teacher.</DialogDescription>
          </DialogHeader>
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
                disabled={updateMutation.isPending || (!formData.module && !formData.title) || !formData.subcalendarId || !formData.date}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <Dialog open={showEventDetail} onOpenChange={(open) => { if (!open) { setShowEventDetail(false); setSelectedEvent(null); setTheoryGroupId(null) } }}>
        <DialogContent className="w-[95vw] sm:max-w-md">
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
            const phaseInfo = parsed.module ? getPhaseInfo(parsed.module) : null
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

                {/* Theory Class Badge */}
                {isTheory && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border-2 bg-indigo-50 border-indigo-400">
                    <BookOpen className="h-5 w-5 text-indigo-600" />
                    <span className="font-medium text-indigo-800">Theory Class</span>
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

                {/* Class Info */}
                {(moduleLabel || phaseInfo) && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                    {moduleLabel && (
                      <div className="flex items-center gap-3">
                        <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Class</p>
                          <p className="font-medium">{moduleLabel}</p>
                        </div>
                      </div>
                    )}
                    {phaseInfo && (
                      <div className="flex items-center gap-3">
                        <GraduationCap className="h-5 w-5 text-primary flex-shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Phase</p>
                          <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${phaseInfo.color}`}>
                            {phaseInfo.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Student Info */}
                {(studentName || phone) && (
                  <div className="p-3 border rounded-lg space-y-3">
                    {studentName && (
                      <div className="flex items-center gap-3">
                        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Student</p>
                          <p className="font-medium">{studentName}</p>
                        </div>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Phone</p>
                          <a href={`tel:+${phone}`} className="font-medium text-primary hover:underline">+{phone}</a>
                        </div>
                      </div>
                    )}
                    {group && (
                      <div className="flex items-center gap-3">
                        <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Group</p>
                          <p className="font-medium">{group}</p>
                        </div>
                      </div>
                    )}
                    {lastTheory.module && (
                      <div className="flex items-center gap-3">
                        <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Last Theory Class</p>
                          <p className="font-medium">
                            Module {lastTheory.module}
                            {lastTheory.date && <span className="text-sm text-muted-foreground ml-1">— {lastTheory.date}</span>}
                          </p>
                        </div>
                      </div>
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
                {parsed.title && (
                  <div className="flex items-center gap-3">
                    <Edit3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Notes</p>
                      <p className="font-medium">{parsed.title}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            {/* View Theory Class button */}
            {selectedEvent && isTheoryEvent(selectedEvent) && theoryGroupId && (
              <Link href={`/groups/${encodeURIComponent(theoryGroupId)}`} className="sm:mr-auto">
                <Button variant="outline" className="w-full sm:w-auto">
                  <Eye className="h-4 w-4 mr-2" />
                  View Theory Class
                </Button>
              </Link>
            )}
            {/* View Truck Schedule button */}
            {selectedEvent && isTruckClass(selectedEvent) && (
              <Button variant="outline" onClick={() => handleViewTruckSchedule(selectedEvent)} className="sm:mr-auto">
                <FileText className="h-4 w-4 mr-2" />
                View Schedule
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowEventDetail(false)}>Close</Button>
            <Button onClick={handleEditFromDetail}>
              <Edit3 className="h-4 w-4 mr-2" />Edit
            </Button>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      const classNum = cls.isExam ? null : truckForm.classes.slice(0, idx + 1).filter(c => !c.isExam).length
                      return (
                        <div key={idx} className={`p-3 rounded-lg border ${cls.isExam ? 'border-red-200 bg-red-50/50' : 'border-border bg-muted/30'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${cls.isExam ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {cls.isExam ? 'EXAM' : `#${classNum}`}
                            </span>
                            <div className="flex items-center gap-2 ml-auto">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <Checkbox
                                  checked={cls.isExam}
                                  onCheckedChange={(checked) => updateTruckClass(idx, {
                                    isExam: !!checked,
                                    examLocation: checked ? cls.examLocation || '' : '',
                                  })}
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
                      {(() => {
                        let num = 0
                        return truckForm.classes.map((cls, idx) => {
                          if (!cls.isExam) num++
                          return (
                            <tr key={idx} className={`border-t ${cls.isExam ? 'bg-red-50' : idx % 2 === 1 ? 'bg-emerald-50/50' : ''}`}>
                              <td className="px-3 py-2">
                                {cls.isExam ? (
                                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">EXAM</span>
                                ) : (
                                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">#{num}</span>
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
                          )
                        })
                      })()}
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
                    {(() => {
                      let num = 0
                      return truckScheduleData.classes.map((cls, idx) => {
                        if (!cls.isExam) num++
                        return (
                          <tr key={idx} className={`border-t ${cls.isExam ? 'bg-red-50' : idx % 2 === 1 ? 'bg-emerald-50/50' : ''}`}>
                            <td className="px-3 py-2">
                              {cls.isExam ? (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">EXAM</span>
                              ) : (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">#{num}</span>
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
                        )
                      })
                    })()}
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

      {/* WhatsApp Notification Status */}
      {(notifyStatus || truckNotifyStatus) && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {notifyStatus && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              notifyStatus === 'sending' ? 'bg-blue-100 text-blue-800' :
              notifyStatus === 'sent' ? 'bg-green-100 text-green-800' :
              'bg-red-100 text-red-800'
            }`}>
              {notifyStatus === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
              {notifyStatus === 'sent' && <CheckCircle2 className="h-4 w-4" />}
              {notifyStatus === 'failed' && <AlertCircle className="h-4 w-4" />}
              <MessageCircle className="h-4 w-4" />
              {notifyStatus === 'sending' && 'Sending WhatsApp message...'}
              {notifyStatus === 'sent' && 'WhatsApp message sent!'}
              {notifyStatus === 'failed' && 'Failed to send WhatsApp message'}
            </div>
          )}
          {truckNotifyStatus && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              truckNotifyStatus === 'sending' ? 'bg-emerald-100 text-emerald-800' :
              truckNotifyStatus === 'sent' ? 'bg-green-100 text-green-800' :
              'bg-red-100 text-red-800'
            }`}>
              {truckNotifyStatus === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
              {truckNotifyStatus === 'sent' && <CheckCircle2 className="h-4 w-4" />}
              {truckNotifyStatus === 'failed' && <AlertCircle className="h-4 w-4" />}
              <Truck className="h-4 w-4" />
              {truckNotifyStatus === 'sending' && 'Creating truck classes & sending schedule...'}
              {truckNotifyStatus === 'sent' && 'Truck classes created & schedule sent!'}
              {truckNotifyStatus === 'failed' && 'Failed to create truck classes'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
