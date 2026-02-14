'use client'

import { useState, useMemo } from 'react'
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
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  CalendarDays,
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
} from 'lucide-react'
import Link from 'next/link'
import { ContactSearchAutocomplete } from '@/components/ContactSearchAutocomplete'

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
}

const MODULE_OPTIONS = [
  { value: '1', label: 'Module 1 - The Vehicle' },
  { value: '2', label: 'Module 2 - The Driver' },
  { value: '3', label: 'Module 3 - The Environment' },
  { value: '4', label: 'Module 4 - At-Risk Behaviours' },
  { value: '5', label: 'Module 5 - Evaluation' },
  { value: '6', label: 'Module 6 - Accompanied Driving' },
  { value: '7', label: 'Module 7 - Semi-Guided Driving' },
  { value: '8', label: 'Module 8 - Speed' },
  { value: '9', label: 'Module 9 - Sharing the Road' },
  { value: '10', label: 'Module 10 - Alcohol & Drugs' },
  { value: '11', label: 'Module 11 - Fatigue' },
  { value: '12', label: 'Module 12 - Eco-driving' },
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

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}, ${monday.getFullYear()}`
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_START = 7
const HOUR_END = 21
const HOUR_HEIGHT = 60 // px per hour

export default function SchedulingPage() {
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [selectedTeacher, setSelectedTeacher] = useState<number | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showEventDetail, setShowEventDetail] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<TeamupEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<TeamupEvent | null>(null)
  const [formData, setFormData] = useState<EventFormData>(initialFormData)
  const [notifyStatus, setNotifyStatus] = useState<null | 'sending' | 'sent' | 'failed'>(null)

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    return d
  }, [weekStart])

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

  // Fetch events for current week
  const { data: events = [], isLoading: loadingEvents } = useQuery<TeamupEvent[]>({
    queryKey: ['scheduling-events', formatDate(weekStart), formatDate(weekEnd), selectedTeacher],
    queryFn: async () => {
      let url = `/api/scheduling/events?startDate=${formatDate(weekStart)}&endDate=${formatDate(weekEnd)}`
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
    if (data.studentName) noteLines.push(`Student: ${data.studentName}`)
    if (data.studentPhone) noteLines.push(`Phone: ${data.studentPhone}`)
    if (data.group) noteLines.push(`Group: ${data.group}`)
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
    const opt = MODULE_OPTIONS.find(o => o.value === moduleVal)
    return opt?.label || moduleVal
  }

  // Derive phase from module value
  // Phase 1: Modules 1-5, Phase 2: Modules 6-7, Phase 3: Modules 8-10, Phase 4: Modules 11-12
  // In-car sessions (S1-S15) are separate
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
    // Clear status after 4 seconds
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
      // Send WhatsApp notification if phone is available
      if (data.studentPhone) {
        sendNotification(data)
      }
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
      const res = await fetch(`/api/scheduling/events/${eventId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete event')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-events'] })
      setShowEditDialog(false)
      setEditingEvent(null)
    },
  })

  // Navigation
  const goToPrevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  const goToNextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  const goToToday = () => {
    setWeekStart(getMonday(new Date()))
  }

  // Open create dialog pre-filled with day/time
  const handleSlotClick = (dayIndex: number, hour: number) => {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + dayIndex)
    setFormData({
      ...initialFormData,
      date: formatDate(date),
      startTime: `${hour.toString().padStart(2, '0')}:00`,
      endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
      subcalendarId: selectedTeacher ? selectedTeacher.toString() : '',
    })
    setShowCreateDialog(true)
  }

  // Parse module from title like "M3 - ..." or "Session 5 - ..."
  const parseModuleFromTitle = (fullTitle: string) => {
    const parts = fullTitle.split(' - ')
    const first = parts[0]?.trim() || ''
    let module = ''
    let restParts = parts

    const mMatch = first.match(/^M(\d+)$/)
    const sMatch = first.match(/^Session (\d+)$/)
    if (mMatch) {
      module = mMatch[1]
      restParts = parts.slice(1)
    } else if (sMatch) {
      module = `S${sMatch[1]}`
      restParts = parts.slice(1)
    }

    return {
      module,
      title: restParts[0] || '',
      studentName: restParts[1] || '',
      group: restParts.slice(2).join(' - ') || '',
    }
  }

  // Teamup returns notes as HTML (e.g. <p>Student: X<br>Phone: Y</p>)
  // Strip HTML tags and convert <br> to newlines for parsing
  const stripHtml = (html: string) => {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+(>|$)/g, '')
      .trim()
  }

  // Parse phone from event notes
  const parsePhoneFromNotes = (notes?: string) => {
    if (!notes) return ''
    const clean = stripHtml(notes)
    const phoneMatch = clean.match(/Phone:\s*(\S+)/)
    return phoneMatch?.[1] || ''
  }

  // Parse student name from notes (more reliable than title parsing)
  const parseStudentFromNotes = (notes?: string) => {
    if (!notes) return ''
    const clean = stripHtml(notes)
    const match = clean.match(/Student:\s*(.+)/)
    return match?.[1]?.trim() || ''
  }

  // Parse group from notes
  const parseGroupFromNotes = (notes?: string) => {
    if (!notes) return ''
    const clean = stripHtml(notes)
    const match = clean.match(/Group:\s*(.+)/)
    return match?.[1]?.trim() || ''
  }

  // Fill form from event data
  const fillFormFromEvent = (event: TeamupEvent) => {
    const startDt = new Date(event.start_dt)
    const parsed = parseModuleFromTitle(event.title)
    const phone = parsePhoneFromNotes(event.notes)
    const studentFromNotes = parseStudentFromNotes(event.notes)
    const groupFromNotes = parseGroupFromNotes(event.notes)

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
    })
  }

  // Open event detail view (info card) when clicking an event
  const handleEventClick = (event: TeamupEvent, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedEvent(event)
    setShowEventDetail(true)
  }

  // Open edit dialog from detail view
  const handleEditFromDetail = () => {
    if (!selectedEvent) return
    fillFormFromEvent(selectedEvent)
    setEditingEvent(selectedEvent)
    setShowEventDetail(false)
    setShowEditDialog(true)
  }

  // Get events for a specific day column
  const getEventsForDay = (dayIndex: number) => {
    const dayDate = new Date(weekStart)
    dayDate.setDate(dayDate.getDate() + dayIndex)
    const dayStr = formatDate(dayDate)

    return events.filter(ev => {
      const evDate = ev.start_dt.split('T')[0]
      return evDate === dayStr
    })
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

  const isToday = (dayIndex: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + dayIndex)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }

  const handleCreate = () => {
    if ((!formData.module && !formData.title) || !formData.date || !formData.subcalendarId) return
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

  const eventForm = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Teacher</Label>
          <Select
            value={formData.subcalendarId}
            onValueChange={(val) => setFormData(prev => ({ ...prev, subcalendarId: val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select teacher" />
            </SelectTrigger>
            <SelectContent>
              {activeTeachers.map(t => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getColor(t.color) }}
                    />
                    {t.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Module / Session</Label>
          <Select
            value={formData.module}
            onValueChange={(val) => setFormData(prev => ({ ...prev, module: val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select module" />
            </SelectTrigger>
            <SelectContent>
              {MODULE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
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
      <div>
        <Label>Student Name</Label>
        <ContactSearchAutocomplete
          value={formData.studentName}
          phone={formData.studentPhone}
          group={formData.group}
          onSelect={(name, phone, group) => setFormData(prev => ({ ...prev, studentName: name, studentPhone: phone, group }))}
          onChange={(name) => setFormData(prev => ({ ...prev, studentName: name, studentPhone: '', group: '' }))}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
          />
        </div>
        <div>
          <Label>Start Time</Label>
          <Input
            type="time"
            value={formData.startTime}
            onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
          />
        </div>
        <div>
          <Label>End Time</Label>
          <Input
            type="time"
            value={formData.endTime}
            onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
          />
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Scheduling
          </h1>
        </div>
      </header>

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
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getColor(t.color) }}
                />
                {t.name}
              </Button>
            ))
          )}
        </div>

        {/* Week Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[200px] text-center">
              {formatWeekRange(weekStart)}
            </span>
            <Button variant="outline" size="icon" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
          <Button size="sm" onClick={() => {
            setFormData({
              ...initialFormData,
              date: formatDate(new Date()),
              subcalendarId: selectedTeacher ? selectedTeacher.toString() : '',
            })
            setShowCreateDialog(true)
          }}>
            <Plus className="h-4 w-4 mr-1" />
            New Class
          </Button>
        </div>

        {/* Week Grid */}
        {loadingEvents ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Day headers */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/30">
                <div className="p-2 text-xs text-muted-foreground" />
                {DAY_NAMES.map((day, i) => {
                  const d = new Date(weekStart)
                  d.setDate(d.getDate() + i)
                  return (
                    <div
                      key={day}
                      className={`p-2 text-center border-l ${isToday(i) ? 'bg-primary/10' : ''}`}
                    >
                      <div className="text-xs text-muted-foreground">{day}</div>
                      <div className={`text-sm font-medium ${isToday(i) ? 'text-primary' : ''}`}>
                        {d.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Time grid */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
                {/* Hour labels */}
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

                {/* Day columns */}
                {DAY_NAMES.map((_, dayIndex) => (
                  <div key={dayIndex} className={`border-l relative ${isToday(dayIndex) ? 'bg-primary/5' : ''}`}>
                    {/* Hour row backgrounds (clickable) */}
                    {Array.from({ length: HOUR_END - HOUR_START }, (_, hourIdx) => (
                      <div
                        key={hourIdx}
                        className="border-b cursor-pointer hover:bg-muted/30 transition-colors"
                        style={{ height: HOUR_HEIGHT }}
                        onClick={() => handleSlotClick(dayIndex, HOUR_START + hourIdx)}
                      />
                    ))}

                    {/* Events */}
                    {getEventsForDay(dayIndex).map(event => {
                      const { top, height } = getEventStyle(event)
                      const color = getEventColor(event)
                      const teacherName = getTeacherName(event)
                      const startTime = new Date(event.start_dt).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })

                      return (
                        <div
                          key={event.id}
                          className="absolute left-1 right-1 rounded px-1.5 py-0.5 cursor-pointer overflow-hidden text-white text-xs leading-tight shadow-sm hover:shadow-md transition-shadow"
                          style={{
                            top,
                            height,
                            backgroundColor: color,
                            minHeight: 22,
                          }}
                          onClick={(e) => handleEventClick(event, e)}
                          title={`${event.title}\n${teacherName}\n${startTime}`}
                        >
                          <div className="font-medium truncate">{event.title}</div>
                          {height > 36 && (
                            <div className="opacity-80 truncate">{teacherName}</div>
                          )}
                          {height > 50 && (
                            <div className="opacity-70 truncate">{startTime}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Create Event Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Class</DialogTitle>
            <DialogDescription>
              Schedule a new class for a teacher.
            </DialogDescription>
          </DialogHeader>
          {eventForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || (!formData.module && !formData.title) || !formData.subcalendarId || !formData.date}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowEditDialog(false)
          setEditingEvent(null)
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
            <DialogDescription>
              Modify or delete this class.
            </DialogDescription>
          </DialogHeader>
          {eventForm}
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending || (!formData.module && !formData.title) || !formData.subcalendarId || !formData.date}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <Dialog open={showEventDetail} onOpenChange={(open) => {
        if (!open) {
          setShowEventDetail(false)
          setSelectedEvent(null)
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Class Details</DialogTitle>
            <DialogDescription>
              View class information
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (() => {
            const parsed = parseModuleFromTitle(selectedEvent.title)
            const phone = parsePhoneFromNotes(selectedEvent.notes)
            const studentFromNotes = parseStudentFromNotes(selectedEvent.notes)
            const groupFromNotes = parseGroupFromNotes(selectedEvent.notes)
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

            return (
              <div className="space-y-4">
                {/* Class Info - Module/Session + Phase */}
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
                          <a
                            href={`tel:+${phone}`}
                            className="font-medium text-primary hover:underline"
                          >
                            +{phone}
                          </a>
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
                  </div>
                )}

                {/* Teacher */}
                {teacher && (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getColor(teacher.color) }}
                    />
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
            <Button variant="outline" onClick={() => setShowEventDetail(false)}>
              Close
            </Button>
            <Button onClick={handleEditFromDetail}>
              <Edit3 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Notification Status */}
      {notifyStatus && (
        <div className="fixed bottom-4 right-4 z-50">
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
        </div>
      )}
    </div>
  )
}
