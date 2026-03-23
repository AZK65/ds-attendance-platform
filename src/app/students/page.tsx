'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Loader2,
  UserPlus,
  Plus,
  Edit3,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Calendar,
  CheckCircle,
  X,
  XCircle,
  QrCode,
  Copy,
  Clock,
  Eye,
  Trash2,
  Users,
  Database,
  MoreVertical,
  Award,
  Receipt,
  CalendarDays,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { PhoneInput } from '@/components/PhoneInput'

interface StudentRecord {
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

interface StudentFormData {
  full_name: string
  phone_number: string
  permit_number: string
  full_address: string
  city: string
  postal_code: string
  dob: string
  email: string
}

interface Registration {
  id: string
  status: string
  fullName: string | null
  phoneNumber: string | null
  permitNumber: string | null
  fullAddress: string | null
  city: string | null
  postalCode: string | null
  dob: string | null
  email: string | null
  expiresAt: string
  submittedAt: string | null
  confirmedAt: string | null
  externalId: number | null
  createdAt: string
}

interface ReviewFormData {
  fullName: string
  phoneNumber: string
  permitNumber: string
  fullAddress: string
  city: string
  postalCode: string
  dob: string
  email: string
}

interface ParticipantWithGroup {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  groupId: string
  groupName: string
  moduleNumber: number | null
  lastMessageDate: string | null
}

interface ClassInfo {
  lastClass: { date: string; title: string } | null
  nextClass: { date: string; title: string } | null
}

function getPhaseInfo(moduleNumber: number | null): { phase: number; label: string; color: string } | null {
  if (moduleNumber == null) return null
  if (moduleNumber >= 1 && moduleNumber <= 5) return { phase: 1, label: 'Phase 1', color: 'bg-yellow-100 text-yellow-800' }
  if (moduleNumber >= 6 && moduleNumber <= 7) return { phase: 2, label: 'Phase 2', color: 'bg-green-100 text-green-800' }
  if (moduleNumber >= 8 && moduleNumber <= 10) return { phase: 3, label: 'Phase 3', color: 'bg-blue-100 text-blue-800' }
  if (moduleNumber >= 11 && moduleNumber <= 12) return { phase: 4, label: 'Phase 4', color: 'bg-purple-100 text-purple-800' }
  return null
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') {
    // 1XXXXXXXXXX -> (XXX) XXX-XXXX
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone
}

function cleanName(name: string | null): string | null {
  if (!name) return null
  // Remove leading # and any number sequence (e.g. "#123 John" -> "John")
  return name.replace(/^#\d*\s*/, '').trim() || null
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays === -1) return 'Tomorrow'
  if (diffDays > 1 && diffDays <= 30) return `${diffDays}d ago`
  if (diffDays < -1 && diffDays >= -30) return `in ${Math.abs(diffDays)}d`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const EMPTY_FORM: StudentFormData = {
  full_name: '',
  phone_number: '',
  permit_number: '',
  full_address: '',
  city: 'Montréal',
  postal_code: '',
  dob: '',
  email: '',
}

export default function StudentsPageWrapper() {
  return (
    <Suspense>
      <StudentsPage />
    </Suspense>
  )
}

function StudentsPage() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const router = useRouter()

  // Search/filter state — persist search in DB so it syncs across devices
  const [searchQuery, setSearchQueryState] = useState('')
  const searchSaveRef = useRef<NodeJS.Timeout | null>(null)

  // Load saved search from DB on mount
  useEffect(() => {
    fetch('/api/preferences?keys=students-search')
      .then(r => r.ok ? r.json() : {})
      .then((prefs: Record<string, string>) => {
        if (prefs['students-search']) {
          setSearchQueryState(prefs['students-search'])
        }
      })
      .catch(() => {})
  }, [])

  const setSearchQuery = useCallback((val: string) => {
    setSearchQueryState(val)
    // Debounce save to DB (don't save on every keystroke)
    if (searchSaveRef.current) clearTimeout(searchSaveRef.current)
    searchSaveRef.current = setTimeout(() => {
      fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'students-search', value: val }),
      }).catch(() => {})
    }, 800)
  }, [])

  const validSorts = ['phase-asc', 'phase-desc', 'last-class', 'oldest-class'] as const
  type SortOption = typeof validSorts[number]
  const [sortBy, setSortByState] = useState<SortOption>('phase-asc')

  // Load saved sort from DB on mount
  useEffect(() => {
    fetch('/api/preferences?keys=students-sort')
      .then(r => r.ok ? r.json() : {})
      .then((prefs: Record<string, string>) => {
        if (prefs['students-sort'] && validSorts.includes(prefs['students-sort'] as SortOption)) {
          setSortByState(prefs['students-sort'] as SortOption)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setSortBy = (val: SortOption) => {
    setSortByState(val)
    // Save to DB
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'students-sort', value: val }),
    }).catch(() => {})
  }

  // Form state (manual add/edit)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<StudentFormData>(EMPTY_FORM)
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  // WhatsApp check state
  const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'error'>('idle')
  const [reviewWhatsappStatus, setReviewWhatsappStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'error'>('idle')

  // New student choice dialog state
  const [showNewStudentChoice, setShowNewStudentChoice] = useState(false)

  // QR state
  const [showQR, setShowQR] = useState(false)
  const [qrData, setQrData] = useState<{ enrollUrl: string; qrDataUrl: string; expiresAt: string } | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  // Group assignment state (shown after creating/confirming a student)
  const [groupAssignment, setGroupAssignment] = useState<{ name: string; phone: string } | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [newGroupName, setNewGroupName] = useState('')
  const [creatingNewGroup, setCreatingNewGroup] = useState(false)

  // Review state
  const [reviewingRegistration, setReviewingRegistration] = useState<Registration | null>(null)
  const [reviewFormData, setReviewFormData] = useState<ReviewFormData>({
    fullName: '', phoneNumber: '', permitNumber: '', fullAddress: '',
    city: '', postalCode: '', dob: '', email: '',
  })

  // Pre-fill from URL params (e.g. from student detail page "Add to Database" button)
  useEffect(() => {
    if (searchParams.get('prefill') === 'true') {
      const name = searchParams.get('name') || ''
      const phone = searchParams.get('phone') || ''
      if (name || phone) {
        setFormData({
          ...EMPTY_FORM,
          full_name: name,
          phone_number: phone,
        })
        setShowForm(true)
      }
    }
  }, [searchParams])

  // Fetch pending registrations (poll every 10s)
  const { data: pendingData } = useQuery<{ registrations: Registration[] }>({
    queryKey: ['registrations', 'submitted'],
    queryFn: async () => {
      const res = await fetch('/api/registrations?status=submitted')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const pendingRegistrations = pendingData?.registrations || []

  // Fetch active students from WhatsApp groups (only course groups with module numbers)
  const { data: participantsData, isLoading: isLoadingParticipants } = useQuery<{
    participants: ParticipantWithGroup[]
    isConnected: boolean
    fromCache?: boolean
  }>({
    queryKey: ['groups', 'participants', 'courseOnly'],
    queryFn: async () => {
      const res = await fetch('/api/groups/participants?courseOnly=true')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    staleTime: 60 * 60 * 1000,        // 1 hour
    gcTime: 2 * 60 * 60 * 1000,       // 2 hours
    refetchInterval: 60 * 60 * 1000,   // Background refresh every hour
  })

  // Deduplicate participants by phone (keep the one with highest module number)
  const activeStudents = useMemo(() => {
    const participants = participantsData?.participants || []
    const byPhone = new Map<string, ParticipantWithGroup>()
    for (const p of participants) {
      if (!p.phone) continue
      const existing = byPhone.get(p.phone)
      if (!existing || (p.moduleNumber ?? 0) > (existing.moduleNumber ?? 0)) {
        byPhone.set(p.phone, p)
      }
    }
    return Array.from(byPhone.values())
  }, [participantsData])

  // Fetch last/next class info for all active student phones
  const phoneList = useMemo(() => activeStudents.map(s => s.phone), [activeStudents])

  const { data: classesData, isLoading: isLoadingClasses } = useQuery<{
    results: Record<string, ClassInfo>
  }>({
    queryKey: ['batch-classes', phoneList],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/batch-classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: phoneList }),
      })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: phoneList.length > 0,
    staleTime: 60 * 60 * 1000,        // 1 hour
    gcTime: 2 * 60 * 60 * 1000,       // 2 hours
    refetchInterval: 60 * 60 * 1000,   // Background refresh every hour
  })

  const classResults = classesData?.results || {}

  // Fetch MySQL matches for active students
  const { data: matchesData, isLoading: isLoadingMatches } = useQuery<{
    matches: Record<string, StudentRecord>
  }>({
    queryKey: ['batch-match', phoneList],
    queryFn: async () => {
      const res = await fetch('/api/students/batch-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: phoneList }),
      })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: phoneList.length > 0,
    staleTime: 60 * 60 * 1000,        // 1 hour
    gcTime: 2 * 60 * 60 * 1000,       // 2 hours
    refetchInterval: 60 * 60 * 1000,   // Background refresh every hour
  })

  const dbMatches = matchesData?.matches || {}

  // Filter and sort active students (client-side)
  const filteredStudents = useMemo(() => {
    let result = activeStudents
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(s => {
        const dbStudent = dbMatches[s.phone]
        const name = (dbStudent?.full_name || cleanName(s.name) || cleanName(s.pushName) || '').toLowerCase()
        const phone = s.phone.toLowerCase()
        const group = (s.groupName || '').toLowerCase()
        return name.includes(q) || phone.includes(q) || group.includes(q)
      })
    }

    // Sort
    const sorted = [...result]
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'phase-asc': {
          const phaseA = getPhaseInfo(a.moduleNumber)?.phase ?? 99
          const phaseB = getPhaseInfo(b.moduleNumber)?.phase ?? 99
          if (phaseA !== phaseB) return phaseA - phaseB
          return (a.moduleNumber ?? 0) - (b.moduleNumber ?? 0)
        }
        case 'phase-desc': {
          const phaseA = getPhaseInfo(a.moduleNumber)?.phase ?? 0
          const phaseB = getPhaseInfo(b.moduleNumber)?.phase ?? 0
          if (phaseA !== phaseB) return phaseB - phaseA
          return (b.moduleNumber ?? 0) - (a.moduleNumber ?? 0)
        }
        case 'last-class': {
          const dateA = classResults[a.phone]?.lastClass?.date
          const dateB = classResults[b.phone]?.lastClass?.date
          if (!dateA && !dateB) return 0
          if (!dateA) return 1
          if (!dateB) return -1
          return new Date(dateB).getTime() - new Date(dateA).getTime()
        }
        case 'oldest-class': {
          const dateA = classResults[a.phone]?.lastClass?.date
          const dateB = classResults[b.phone]?.lastClass?.date
          if (!dateA && !dateB) return 0
          if (!dateA) return 1
          if (!dateB) return -1
          return new Date(dateA).getTime() - new Date(dateB).getTime()
        }
        default:
          return 0
      }
    })
    return sorted
  }, [activeStudents, dbMatches, searchQuery, sortBy, classResults])

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: StudentFormData) => {
      const res = await fetch('/api/students/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create student')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setSuccessMessage(`Student created successfully (ID: ${data.studentId})`)
      setShowForm(false)
      // Prompt to add to WhatsApp group
      if (formData.phone_number) {
        setGroupAssignment({ name: formData.full_name, phone: formData.phone_number.replace(/\D/g, '') })
      }
      setFormData(EMPTY_FORM)
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ student_id, old_phone, ...fields }: StudentFormData & { student_id: number; old_phone?: string }) => {
      const res = await fetch('/api/students/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id, old_phone, ...fields }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update student')
      }
      return res.json()
    },
    onSuccess: () => {
      setSuccessMessage('Student updated successfully')
      setShowForm(false)
      setFormData(EMPTY_FORM)
      setEditingStudent(null)
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ student_id, phone }: { student_id: number; phone?: string }) => {
      const params = new URLSearchParams({ student_id: String(student_id) })
      if (phone) params.set('phone', phone)
      const res = await fetch(`/api/students/manage?${params}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete student')
      }
      return res.json()
    },
    onSuccess: () => {
      setSuccessMessage('Student deleted')
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['batch-match'] })
    },
  })

  // Generate QR mutation
  const generateQRMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to generate QR')
      return res.json()
    },
    onSuccess: (data) => {
      setQrData({
        enrollUrl: data.enrollUrl,
        qrDataUrl: data.qrDataUrl,
        expiresAt: data.expiresAt,
      })
      setShowNewStudentChoice(false)
      setShowQR(true)
    },
  })

  // Confirm registration mutation
  const confirmMutation = useMutation({
    mutationFn: async ({ id, ...fields }: ReviewFormData & { id: string }) => {
      const res = await fetch(`/api/registrations/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to confirm')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setSuccessMessage(`Student confirmed and added to database (ID: ${data.studentId})`)
      // Prompt to add to WhatsApp group
      if (reviewFormData.phoneNumber) {
        setGroupAssignment({ name: reviewFormData.fullName, phone: reviewFormData.phoneNumber.replace(/\D/g, '') })
      }
      setReviewingRegistration(null)
      queryClient.invalidateQueries({ queryKey: ['registrations', 'submitted'] })
    },
  })

  // Reject registration mutation
  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/registrations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to reject')
      return res.json()
    },
    onSuccess: () => {
      setReviewingRegistration(null)
      queryClient.invalidateQueries({ queryKey: ['registrations', 'submitted'] })
    },
  })

  // Fetch groups list for group assignment dialog
  const { data: groupsListData } = useQuery<{ groups: Array<{ id: string; name: string; participantCount: number; moduleNumber: number | null }> }>({
    queryKey: ['groups-list'],
    queryFn: async () => {
      const res = await fetch('/api/groups')
      if (!res.ok) throw new Error('Failed to fetch groups')
      return res.json()
    },
    enabled: !!groupAssignment,
    staleTime: 60 * 1000,
  })

  // Add student to existing group mutation
  const addToGroupMutation = useMutation({
    mutationFn: async ({ groupId, phone, name }: { groupId: string; phone: string; name?: string }) => {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add to group')
      }
      return res.json()
    },
    onSuccess: (data) => {
      if (data.inviteSent) {
        setSuccessMessage('Student couldn\'t be added directly — invite link sent via WhatsApp!')
      } else if (data.whatsappWarning) {
        setSuccessMessage(`Student added to group (Note: ${data.whatsappWarning})`)
      } else {
        setSuccessMessage('Student added to group!')
      }
      setGroupAssignment(null)
      setSelectedGroupId('')
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  // Create new group mutation
  const createGroupMutation = useMutation({
    mutationFn: async ({ name, phone }: { name: string; phone: string }) => {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, participants: [phone] }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create group')
      }
      return res.json()
    },
    onSuccess: () => {
      setSuccessMessage('Group created and student added!')
      setGroupAssignment(null)
      setNewGroupName('')
      setCreatingNewGroup(false)
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const handleSubmit = () => {
    const required: (keyof StudentFormData)[] = [
      'full_name', 'phone_number', 'full_address',
      'city', 'postal_code', 'dob', 'email',
    ]
    for (const field of required) {
      if (!formData[field]?.trim()) return
    }
    if (editingStudent) {
      updateMutation.mutate({ ...formData, student_id: editingStudent.student_id, old_phone: editingStudent.phone_number })
    } else {
      createMutation.mutate(formData)
    }
  }

  const openEditForm = (student: StudentRecord) => {
    setEditingStudent(student)
    setFormData({
      full_name: student.full_name || '',
      phone_number: student.phone_number || '',
      permit_number: student.permit_number || '',
      full_address: student.full_address || '',
      city: student.city || '',
      postal_code: student.postal_code || '',
      dob: student.dob ? student.dob.split('T')[0] : '',
      email: student.email || '',
    })
    setShowForm(true)
  }

  const openAddForm = () => {
    setEditingStudent(null)
    setFormData(EMPTY_FORM)
    setShowNewStudentChoice(false)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingStudent(null)
    setFormData(EMPTY_FORM)
    setWhatsappStatus('idle')
    createMutation.reset()
    updateMutation.reset()
  }

  const openReview = (reg: Registration) => {
    setReviewingRegistration(reg)
    setReviewFormData({
      fullName: reg.fullName || '',
      phoneNumber: reg.phoneNumber || '',
      permitNumber: reg.permitNumber || '',
      fullAddress: reg.fullAddress || '',
      city: reg.city || '',
      postalCode: reg.postalCode || '',
      dob: reg.dob || '',
      email: reg.email || '',
    })
    setReviewWhatsappStatus('idle')
    confirmMutation.reset()
  }

  const handleCopyLink = async () => {
    if (qrData?.enrollUrl) {
      await navigator.clipboard.writeText(qrData.enrollUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error || updateMutation.error

  const updateField = (field: keyof StudentFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const updateReviewField = (field: keyof ReviewFormData, value: string) => {
    setReviewFormData(prev => ({ ...prev, [field]: value }))
  }

  const checkWhatsApp = useCallback(async (phone: string, setStatus: (s: 'idle' | 'checking' | 'valid' | 'invalid' | 'error') => void) => {
    const cleaned = phone.replace(/[^0-9]/g, '')
    if (cleaned.length < 10) { setStatus('idle'); return }
    setStatus('checking')
    try {
      const res = await fetch(`/api/whatsapp/check-number?phone=${encodeURIComponent(cleaned)}`)
      if (!res.ok) {
        setStatus('error')
        return
      }
      const data = await res.json()
      setStatus(data.registered ? 'valid' : 'invalid')
    } catch {
      setStatus('error')
    }
  }, [])

  // Auto-check WhatsApp when phone number changes (debounced)
  const waDebounceRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    const cleaned = formData.phone_number.replace(/[^0-9]/g, '')
    if (cleaned.length < 10) { setWhatsappStatus('idle'); return }
    if (waDebounceRef.current) clearTimeout(waDebounceRef.current)
    waDebounceRef.current = setTimeout(() => {
      checkWhatsApp(formData.phone_number, setWhatsappStatus)
    }, 600)
    return () => { if (waDebounceRef.current) clearTimeout(waDebounceRef.current) }
  }, [formData.phone_number, checkWhatsApp])

  const reviewWaDebounceRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    const cleaned = (reviewFormData.phoneNumber || '').replace(/[^0-9]/g, '')
    if (cleaned.length < 10) { setReviewWhatsappStatus('idle'); return }
    if (reviewWaDebounceRef.current) clearTimeout(reviewWaDebounceRef.current)
    reviewWaDebounceRef.current = setTimeout(() => {
      checkWhatsApp(reviewFormData.phoneNumber, setReviewWhatsappStatus)
    }, 600)
    return () => { if (reviewWaDebounceRef.current) clearTimeout(reviewWaDebounceRef.current) }
  }, [reviewFormData.phoneNumber, checkWhatsApp])

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold">Students</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Search, add, and edit students in the database
          </p>
        </div>
        <Button onClick={() => setShowNewStudentChoice(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          New Student
        </Button>
      </motion.div>

      {/* Success Message */}
      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm"
        >
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {successMessage}
          <button onClick={() => setSuccessMessage('')} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* Pending Registrations */}
      {pendingRegistrations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.25 }}
        >
          <Card className="border-orange-200 bg-orange-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-orange-600" />
                Pending Registrations
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  {pendingRegistrations.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRegistrations.map(reg => (
                      <TableRow key={reg.id}>
                        <TableCell className="font-medium">{reg.fullName || '-'}</TableCell>
                        <TableCell className="text-sm">{reg.phoneNumber || '-'}</TableCell>
                        <TableCell className="text-sm">{reg.email || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {reg.submittedAt
                            ? new Date(reg.submittedAt).toLocaleString('en-US', {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                              })
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => openReview(reg)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Active Students */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-lg flex-shrink-0">
                <Users className="h-5 w-5" />
                Active Students
                <Badge variant="secondary">
                  {searchQuery.trim() ? `${filteredStudents.length}/${activeStudents.length}` : activeStudents.length}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2 flex-1 max-w-lg">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter by name, phone, or group..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10 h-9"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 flex-shrink-0">
                      {sortBy === 'last-class' ? (
                        <ArrowDown className="h-3.5 w-3.5" />
                      ) : sortBy === 'oldest-class' ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">
                        {sortBy === 'phase-asc' && 'Phase ↑'}
                        {sortBy === 'phase-desc' && 'Phase ↓'}
                        {sortBy === 'last-class' && 'Last Class'}
                        {sortBy === 'oldest-class' && 'Oldest Class'}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSortBy('phase-asc')} className={sortBy === 'phase-asc' ? 'bg-accent' : ''}>
                      Phase (Earliest First)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('phase-desc')} className={sortBy === 'phase-desc' ? 'bg-accent' : ''}>
                      Phase (Latest First)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('last-class')} className={sortBy === 'last-class' ? 'bg-accent' : ''}>
                      Last Class (Recent First)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('oldest-class')} className={sortBy === 'oldest-class' ? 'bg-accent' : ''}>
                      Oldest Class First
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Cache indicator — show when using cached data */}
            {participantsData && !participantsData.isConnected && activeStudents.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-3">
                <Database className="h-3.5 w-3.5 shrink-0" />
                <span>Showing cached data — WhatsApp is not connected. Connect to refresh.</span>
              </div>
            )}
            {isLoadingParticipants ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading students...</span>
              </div>
            ) : activeStudents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No active students found in WhatsApp groups.</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No students match &ldquo;{searchQuery}&rdquo;</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Last Class</TableHead>
                      <TableHead>Next Class</TableHead>
                      <TableHead>DB</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map(student => {
                      const phase = getPhaseInfo(student.moduleNumber)
                      const classes = classResults[student.phone]
                      const dbStudent = dbMatches[student.phone]
                      const displayName = dbStudent?.full_name || cleanName(student.name) || cleanName(student.pushName) || '-'
                      return (
                        <TableRow
                          key={student.phone}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => router.push(`/groups/${encodeURIComponent(student.groupId)}/student/${encodeURIComponent(student.id)}`)}
                        >
                          <TableCell className="font-medium">{displayName}</TableCell>
                          <TableCell className="text-sm">{formatPhoneNumber(student.phone)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{student.groupName}</TableCell>
                          <TableCell>
                            {phase ? (
                              <Badge variant="secondary" className={`text-xs ${phase.color}`}>
                                {phase.label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-mono">
                            {student.moduleNumber ? `M${student.moduleNumber}` : '-'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {isLoadingClasses ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            ) : classes?.lastClass ? (
                              <span title={classes.lastClass.title}>
                                {formatRelativeDate(classes.lastClass.date)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {isLoadingClasses ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            ) : classes?.nextClass ? (
                              <span className="text-green-700" title={classes.nextClass.title}>
                                {formatRelativeDate(classes.nextClass.date)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isLoadingMatches ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            ) : dbStudent ? (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                <Database className="h-3 w-3 mr-1" />
                                In DB
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                {dbStudent && (
                                  <DropdownMenuItem onClick={() => openEditForm(dbStudent)}>
                                    <Edit3 className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => {
                                  const name = dbStudent?.full_name || cleanName(student.name) || cleanName(student.pushName) || ''
                                  router.push(`/certificate?studentName=${encodeURIComponent(name)}&studentPhone=${encodeURIComponent(student.phone)}`)
                                }}>
                                  <Award className="h-4 w-4 mr-2" />
                                  Make Certificate
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  const name = dbStudent?.full_name || cleanName(student.name) || cleanName(student.pushName) || ''
                                  router.push(`/invoice?studentName=${encodeURIComponent(name)}&studentPhone=${encodeURIComponent(student.phone)}`)
                                }}>
                                  <Receipt className="h-4 w-4 mr-2" />
                                  Make Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  const name = dbStudent?.full_name || cleanName(student.name) || cleanName(student.pushName) || ''
                                  router.push(`/scheduling?bookFor=${encodeURIComponent(name)}&phone=${encodeURIComponent(student.phone)}`)
                                }}>
                                  <CalendarDays className="h-4 w-4 mr-2" />
                                  Schedule Class
                                </DropdownMenuItem>
                                {dbStudent && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                      if (confirm(`Delete ${dbStudent.full_name}? This removes them from the database and all groups.`)) {
                                        deleteMutation.mutate({ student_id: dbStudent.student_id, phone: dbStudent.phone_number })
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Student
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* New Student Choice Dialog */}
      <Dialog open={showNewStudentChoice} onOpenChange={setShowNewStudentChoice}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              New Student
            </DialogTitle>
            <DialogDescription>
              How would you like to add this student?
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 py-4">
            <button
              type="button"
              onClick={openAddForm}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors text-left"
            >
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Edit3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Add Manually</p>
                <p className="text-sm text-muted-foreground">Fill in the student&apos;s information yourself</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => generateQRMutation.mutate()}
              disabled={generateQRMutation.isPending}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
            >
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                {generateQRMutation.isPending ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : (
                  <QrCode className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <p className="font-medium">Let Student Fill Information</p>
                <p className="text-sm text-muted-foreground">Generate a QR code for the student to scan and fill out</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Student Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm() }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingStudent ? (
                <>
                  <Edit3 className="h-5 w-5" />
                  Edit Student
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5" />
                  Add New Student
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingStudent
                ? 'Update the student information below.'
                : 'Fill in all fields to add a new student to the database.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="sm:col-span-2">
              <Label htmlFor="full_name" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="full_name"
                placeholder="Ahmed Khan"
                value={formData.full_name}
                onChange={e => updateField('full_name', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="phone_number" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Phone className="h-3.5 w-3.5" />
                Phone Number <span className="text-destructive">*</span>
              </Label>
              <PhoneInput
                id="phone_number"
                value={formData.phone_number}
                onChange={(val) => updateField('phone_number', val)}
              />
              {whatsappStatus === 'checking' && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking WhatsApp...
                </p>
              )}
              {whatsappStatus === 'valid' && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> This number is on WhatsApp
                </p>
              )}
              {whatsappStatus === 'invalid' && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> This number is not on WhatsApp
                </p>
              )}
              {whatsappStatus === 'error' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Could not check — WhatsApp may not be connected
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="email" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="student@email.com"
                value={formData.email}
                onChange={e => updateField('email', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="permit_number" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                Permit Number
              </Label>
              <Input
                id="permit_number"
                placeholder="Q1234-567890-01"
                value={formData.permit_number}
                onChange={e => updateField('permit_number', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dob" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Date of Birth <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dob"
                type="date"
                value={formData.dob}
                onChange={e => updateField('dob', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="full_address" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Address <span className="text-destructive">*</span>
              </Label>
              <AddressAutocomplete
                id="full_address"
                value={formData.full_address}
                onChange={val => updateField('full_address', val)}
                onAddressSelect={result => {
                  if (result.city) updateField('city', result.city)
                  if (result.postalCode) updateField('postal_code', result.postalCode)
                }}
                placeholder="123 Main Street, Apt 4"
              />
            </div>
            <div>
              <Label htmlFor="city" className="text-sm font-medium mb-1.5">
                City <span className="text-destructive">*</span>
              </Label>
              <Input
                id="city"
                placeholder="Montréal"
                value={formData.city}
                onChange={e => updateField('city', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="postal_code" className="text-sm font-medium mb-1.5">
                Postal Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="postal_code"
                placeholder="H1A 2B3"
                value={formData.postal_code}
                onChange={e => updateField('postal_code', e.target.value)}
              />
            </div>
          </div>

          {saveError && (
            <p className="text-sm text-destructive">
              {saveError.message || 'An error occurred'}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {editingStudent ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                editingStudent ? 'Update Student' : 'Add Student'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQR} onOpenChange={(open) => { if (!open) { setShowQR(false); setCopiedLink(false) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Student Registration QR
            </DialogTitle>
            <DialogDescription>
              Have the student scan this QR code to fill in their information.
            </DialogDescription>
          </DialogHeader>

          {qrData && (
            <div className="flex flex-col items-center gap-4 py-4">
              {/* QR Code Image */}
              <div className="bg-white p-4 rounded-lg border">
                <Image
                  src={qrData.qrDataUrl}
                  alt="Registration QR Code"
                  width={256}
                  height={256}
                  className="rounded"
                />
              </div>

              {/* URL + Copy */}
              <div className="w-full flex gap-2">
                <Input
                  readOnly
                  value={qrData.enrollUrl}
                  className="text-xs font-mono"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <Button variant="outline" size="sm" onClick={handleCopyLink}>
                  {copiedLink ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Expiry */}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Valid for 24 hours (expires{' '}
                {new Date(qrData.expiresAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
                )
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowQR(false); setCopiedLink(false) }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Assignment Dialog */}
      <Dialog open={!!groupAssignment} onOpenChange={(open) => {
        if (!open) {
          setGroupAssignment(null)
          setSelectedGroupId('')
          setNewGroupName('')
          setCreatingNewGroup(false)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to WhatsApp Group</DialogTitle>
            <DialogDescription>
              Add {groupAssignment?.name || 'student'} to an existing WhatsApp group or create a new one.
            </DialogDescription>
          </DialogHeader>

          {!creatingNewGroup ? (
            <div className="space-y-3">
              <div className="max-h-[350px] overflow-y-auto space-y-3 pr-1">
                {(() => {
                  const groups = groupsListData?.groups || []
                  const getPhase = (m: number | null | undefined) => {
                    if (!m) return null
                    if (m >= 1 && m <= 5) return 1
                    if (m >= 6 && m <= 7) return 2
                    if (m >= 8 && m <= 10) return 3
                    if (m >= 11 && m <= 12) return 4
                    return null
                  }
                  const phaseLabels: Record<string, string> = {
                    '1': 'Phase 1 — Theory (M1-M5)',
                    '2': 'Phase 2 (M6-M7)',
                    '3': 'Phase 3 (M8-M10)',
                    '4': 'Phase 4 (M11-M12)',
                    'other': 'Other Groups',
                  }
                  const phaseColors: Record<string, string> = {
                    '1': 'bg-blue-500',
                    '2': 'bg-green-500',
                    '3': 'bg-orange-500',
                    '4': 'bg-purple-500',
                    'other': 'bg-gray-500',
                  }
                  const grouped = new Map<string, typeof groups>()
                  for (const g of groups) {
                    const p = getPhase(g.moduleNumber)
                    const key = p ? String(p) : 'other'
                    if (!grouped.has(key)) grouped.set(key, [])
                    grouped.get(key)!.push(g)
                  }
                  // Sort groups within each phase by module number
                  for (const [, gs] of grouped) {
                    gs.sort((a, b) => (a.moduleNumber ?? 99) - (b.moduleNumber ?? 99))
                  }
                  const phaseOrder = ['1', '2', '3', '4', 'other']
                  return phaseOrder.filter(k => grouped.has(k)).map(key => (
                    <div key={key}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-2 h-2 rounded-full ${phaseColors[key]}`} />
                        <span className="text-xs font-medium text-muted-foreground">{phaseLabels[key]}</span>
                      </div>
                      <div className="grid gap-1.5">
                        {grouped.get(key)!.map(g => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setSelectedGroupId(g.id)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                              selectedGroupId === g.id
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border hover:border-primary/50 hover:bg-accent'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate">{g.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {g.moduleNumber && (
                                <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                                  M{g.moduleNumber}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">{g.participantCount}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setCreatingNewGroup(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Group
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>New Group Name</Label>
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Module 5 - March 2026"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreatingNewGroup(false)}
              >
                Back to existing groups
              </Button>
            </div>
          )}

          {(addToGroupMutation.error || createGroupMutation.error) && (
            <p className="text-sm text-destructive">
              {(addToGroupMutation.error || createGroupMutation.error)?.message}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGroupAssignment(null)
                setSelectedGroupId('')
                setNewGroupName('')
                setCreatingNewGroup(false)
              }}
            >
              Skip
            </Button>
            {!creatingNewGroup ? (
              <Button
                onClick={() => {
                  if (selectedGroupId && groupAssignment?.phone) {
                    addToGroupMutation.mutate({ groupId: selectedGroupId, phone: groupAssignment.phone, name: groupAssignment.name })
                  }
                }}
                disabled={!selectedGroupId || addToGroupMutation.isPending}
              >
                {addToGroupMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Adding...</>
                ) : (
                  <><Users className="h-4 w-4 mr-2" />Add to Group</>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if (newGroupName.trim() && groupAssignment?.phone) {
                    createGroupMutation.mutate({ name: newGroupName.trim(), phone: groupAssignment.phone })
                  }
                }}
                disabled={!newGroupName.trim() || createGroupMutation.isPending}
              >
                {createGroupMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" />Create & Add</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review & Confirm Dialog */}
      <Dialog open={!!reviewingRegistration} onOpenChange={(open) => { if (!open) setReviewingRegistration(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Review Registration
            </DialogTitle>
            <DialogDescription>
              Review the student&apos;s submitted information. You can edit fields before confirming.
            </DialogDescription>
          </DialogHeader>

          {reviewingRegistration && (
            <>
              {/* Submitted time */}
              <p className="text-xs text-muted-foreground">
                Submitted {reviewingRegistration.submittedAt
                  ? new Date(reviewingRegistration.submittedAt).toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })
                  : 'unknown'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                <div className="sm:col-span-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    Full Name
                  </Label>
                  <Input
                    value={reviewFormData.fullName}
                    onChange={e => updateReviewField('fullName', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    <Phone className="h-3.5 w-3.5" /> Phone Number
                  </Label>
                  <PhoneInput
                    value={reviewFormData.phoneNumber}
                    onChange={(val) => updateReviewField('phoneNumber', val)}
                  />
                  {reviewWhatsappStatus === 'checking' && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking WhatsApp...
                    </p>
                  )}
                  {reviewWhatsappStatus === 'valid' && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> This number is on WhatsApp
                    </p>
                  )}
                  {reviewWhatsappStatus === 'invalid' && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> This number is not on WhatsApp
                    </p>
                  )}
                  {reviewWhatsappStatus === 'error' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Could not check — WhatsApp may not be connected
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </Label>
                  <Input
                    value={reviewFormData.email}
                    onChange={e => updateReviewField('email', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    <CreditCard className="h-3.5 w-3.5" /> Permit Number
                  </Label>
                  <Input
                    value={reviewFormData.permitNumber}
                    onChange={e => updateReviewField('permitNumber', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Date of Birth
                  </Label>
                  <Input
                    type="date"
                    value={reviewFormData.dob}
                    onChange={e => updateReviewField('dob', e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Address
                  </Label>
                  <AddressAutocomplete
                    value={reviewFormData.fullAddress}
                    onChange={val => updateReviewField('fullAddress', val)}
                    onAddressSelect={result => {
                      if (result.city) updateReviewField('city', result.city)
                      if (result.postalCode) updateReviewField('postalCode', result.postalCode)
                    }}
                    placeholder="Start typing address..."
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5">City</Label>
                  <Input
                    value={reviewFormData.city}
                    onChange={e => updateReviewField('city', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5">Postal Code</Label>
                  <Input
                    value={reviewFormData.postalCode}
                    onChange={e => updateReviewField('postalCode', e.target.value)}
                  />
                </div>
              </div>

              {confirmMutation.error && (
                <p className="text-sm text-destructive">
                  {confirmMutation.error.message || 'Failed to confirm'}
                </p>
              )}

              <DialogFooter className="flex justify-between sm:justify-between">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => rejectMutation.mutate(reviewingRegistration.id)}
                  disabled={confirmMutation.isPending || rejectMutation.isPending}
                >
                  {rejectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Reject
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setReviewingRegistration(null)}
                    disabled={confirmMutation.isPending || rejectMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => confirmMutation.mutate({ id: reviewingRegistration.id, ...reviewFormData })}
                    disabled={confirmMutation.isPending || rejectMutation.isPending}
                  >
                    {confirmMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Confirming...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Confirm & Add to DB
                      </>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </main>
  )
}
