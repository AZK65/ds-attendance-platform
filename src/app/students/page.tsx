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
  Truck,
  Car,
  FileText,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'motion/react'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { PhoneInput } from '@/components/PhoneInput'
import { NewGroupWizard } from '@/components/NewGroupWizard'
import { StudentAvatar } from '@/components/StudentAvatar'

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
  permitExpiry?: string | null
  permitImage?: string | null
  idImage?: string | null
  avatarImage?: string | null
  signatureImage?: string | null
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
  medical: string | null  // JSON string: { conditions:number[], none:bool, attestedAt:string|null }
  // Clover auth-then-capture state
  paymentChargeId: string | null
  paymentStatus: string | null    // 'authorized' | 'captured' | 'voided' | 'failed'
  paymentLast4: string | null
  paymentBrand: string | null
  paymentAmount: number | null
  paymentAuthorizedAt: string | null
  paymentCapturedAt: string | null
  paymentError: string | null
  // Truck (Class 1 SAAQ) contract fields
  vehicleType?: string | null
  consentSaaqTransmission?: boolean | null
  consentFileTransfer?: boolean | null
  consentContactInfo?: boolean | null
  signedAtPlace?: string | null
  firstCourseDate?: string | null
  maxCompletionDate?: string | null
  contractNumber?: string | null
  repSignatureImage?: string | null
  repSignerName?: string | null
  repSignedAt?: string | null
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

  // MySQL database search (for students not in active groups)
  const { data: dbSearchResults } = useQuery<{ students: Array<{ student_id: number; full_name: string; phone_number: string; city: string; permit_number: string }> }>({
    queryKey: ['db-student-search', searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(searchQuery)}`)
      if (!res.ok) return { students: [] }
      return res.json()
    },
    enabled: searchQuery.trim().length >= 2,
    staleTime: 30000,
  })

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
  const [showNewGroupWizard, setShowNewGroupWizard] = useState(false)

  // QR state
  const [showQR, setShowQR] = useState(false)
  const [qrData, setQrData] = useState<{ enrollUrl: string; qrDataUrl: string; expiresAt: string } | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  // Group assignment state (shown after creating/confirming a student)
  const [groupAssignment, setGroupAssignment] = useState<{ name: string; phone: string } | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [newGroupName, setNewGroupName] = useState('')
  const [creatingNewGroup, setCreatingNewGroup] = useState(false)

  // Bulk add state
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkGroupId, setBulkGroupId] = useState('')
  const [bulkNewGroupName, setBulkNewGroupName] = useState('')
  const [bulkCreatingGroup, setBulkCreatingGroup] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; results: Array<{ name: string; status: string }> } | null>(null)

  // Class setup dialog state (shown after adding student to group)
  const [showClassSetup, setShowClassSetup] = useState(false)
  const [classSetupGroupId, setClassSetupGroupId] = useState('')
  const [classSetupPhones, setClassSetupPhones] = useState<string[]>([])
  const [classSetupModule, setClassSetupModule] = useState(1)
  const [classSetupDate, setClassSetupDate] = useState('')
  const [classSetupTime, setClassSetupTime] = useState('5 pm to 7 pm')
  const [classSetupSendPdf, setClassSetupSendPdf] = useState(false)
  const [classSetupPdfBase64, setClassSetupPdfBase64] = useState('')
  const [classSetupPdfName, setClassSetupPdfName] = useState('')
  const [classSetupSetDesc, setClassSetupSetDesc] = useState(true)
  const [classSetupResults, setClassSetupResults] = useState<Array<{ action: string; status: string }> | null>(null)
  const [classSetupLoading, setClassSetupLoading] = useState(false)

  // Review state
  const [reviewingRegistration, setReviewingRegistration] = useState<Registration | null>(null)
  const [reviewFormData, setReviewFormData] = useState<ReviewFormData>({
    fullName: '', phoneNumber: '', permitNumber: '', fullAddress: '',
    city: '', postalCode: '', dob: '', email: '',
  })

  // Pre-fill from URL params (e.g. from student detail page "Add to Database" button).
  // We also pull whatever the local Student profile has (address typed during a
  // previous cert generation) so the user doesn't re-type fields they've already
  // filled in elsewhere.
  useEffect(() => {
    if (searchParams.get('prefill') !== 'true') return
    const rawName = searchParams.get('name') || ''
    const phone = searchParams.get('phone') || ''
    if (!rawName && !phone) return

    // Strip "#1122" tags that come from WhatsApp display names so the
    // database name doesn't end up as "Gaurav #1122 Singh".
    const cleanedName = rawName
      .replace(/\s*#\d+\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Open the modal with what we have immediately, then enhance with profile.
    setFormData({
      ...EMPTY_FORM,
      full_name: cleanedName,
      phone_number: phone,
    })
    setShowForm(true)

    // Fetch local Student profile (saved during cert generation) and merge.
    if (phone) {
      const params = new URLSearchParams()
      params.set('phone', phone)
      if (cleanedName) params.set('name', cleanedName)
      fetch(`/api/students/profile?${params}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const ls = data?.localStudent
          if (!ls) return
          // Combine apartment + address into a single string so it survives
          // the round-trip (the modal only has one address field).
          const apt = (ls.apartment || '').trim()
          const street = (ls.address || '').trim()
          const fullAddress = apt
            ? `${street}${street ? ', ' : ''}Apt ${apt.replace(/^#/, '')}`
            : street
          setFormData(prev => ({
            ...prev,
            full_address: prev.full_address || fullAddress,
            city: ls.municipality || prev.city,
            postal_code: ls.postalCode || prev.postal_code,
          }))
        })
        .catch(() => { /* non-fatal — modal stays partially filled */ })
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

  // Also fetch CONFIRMED registrations so students who were confirmed
  // but skipped the WhatsApp group assignment don't disappear from the
  // page. They're surfaced in a dedicated "needs group" card below.
  const { data: confirmedRegsData } = useQuery<{ registrations: Registration[] }>({
    queryKey: ['registrations', 'confirmed'],
    queryFn: async () => {
      const res = await fetch('/api/registrations?status=confirmed')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    staleTime: 30 * 1000,
  })

  const confirmedRegistrations = confirmedRegsData?.registrations || []

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

  // Deduplicate participants by phone (keep the one with highest module
  // number). Also inject confirmed registrations whose phone isn't yet
  // in any WhatsApp group as synthetic "no group" entries so they don't
  // disappear from the page just because nobody added them to a group.
  const activeStudents = useMemo(() => {
    const participants = participantsData?.participants || []
    const byPhone = new Map<string, ParticipantWithGroup & { avatarImage?: string | null; needsGroup?: boolean }>()
    for (const p of participants) {
      if (!p.phone) continue
      const existing = byPhone.get(p.phone)
      if (!existing || (p.moduleNumber ?? 0) > (existing.moduleNumber ?? 0)) {
        byPhone.set(p.phone, p)
      }
    }
    // Build a set of last-10-digit suffixes that ARE in a group so we
    // don't double-list anyone (registration phone might be stored as
    // (514) 555-1234, group member as 15145551234, etc.).
    const inGroupSuffixes = new Set<string>()
    for (const phone of byPhone.keys()) {
      const digits = phone.replace(/\D/g, '')
      if (digits.length >= 10) inGroupSuffixes.add(digits.slice(-10))
    }
    for (const reg of confirmedRegistrations) {
      const rawPhone = reg.phoneNumber || ''
      const digits = rawPhone.replace(/\D/g, '')
      if (digits.length < 7) continue
      const suffix = digits.length >= 10 ? digits.slice(-10) : digits
      if (inGroupSuffixes.has(suffix)) continue
      // Synthesize a ParticipantWithGroup-shape so the rest of the page
      // can keep treating activeStudents uniformly.
      byPhone.set(digits, {
        id: `reg-${reg.id}`,
        phone: digits,
        name: reg.fullName,
        pushName: null,
        groupId: '',
        groupName: '',
        moduleNumber: null,
        lastMessageDate: null,
        avatarImage: reg.avatarImage || null,
        needsGroup: true,
      })
    }
    return Array.from(byPhone.values())
  }, [participantsData, confirmedRegistrations])

  // Explicitly compute the list of confirmed students who are NOT yet in
  // any WhatsApp group. Rendered as a dedicated card so they're always
  // visible regardless of what activeStudents does. Phone-suffix match
  // (last 10 digits) so we de-dupe correctly even if formats differ.
  const orphanedConfirmed = useMemo(() => {
    if (confirmedRegistrations.length === 0) return []
    const groupSuffixes = new Set<string>()
    const parts = participantsData?.participants || []
    for (const p of parts) {
      const d = (p.phone || '').replace(/\D/g, '')
      if (d.length >= 10) groupSuffixes.add(d.slice(-10))
    }
    return confirmedRegistrations.filter(reg => {
      const d = (reg.phoneNumber || '').replace(/\D/g, '')
      if (d.length < 7) return false
      const suffix = d.length >= 10 ? d.slice(-10) : d
      return !groupSuffixes.has(suffix)
    })
  }, [confirmedRegistrations, participantsData])

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

  // Bulk create mutation
  const bulkCreateMutation = useMutation({
    mutationFn: async ({ students, groupId, newGroupName: gName }: {
      students: Array<{ name: string; phone: string }>
      groupId?: string
      newGroupName?: string
    }) => {
      const results: Array<{ name: string; status: string }> = []
      let targetGroupId = groupId

      // Phase 1: Create all students in MySQL
      const successfulStudents: Array<{ name: string; phone: string }> = []
      for (let i = 0; i < students.length; i++) {
        const s = students[i]
        setBulkProgress({ current: i + 1, total: students.length, results: [...results] })

        try {
          const createRes = await fetch('/api/students/manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              full_name: s.name,
              phone_number: s.phone,
              permit_number: '',
              full_address: '',
              city: 'Montréal',
              postal_code: '',
              dob: '2000-01-01',
              email: '',
            }),
          })
          if (createRes.ok) {
            successfulStudents.push(s)
            results.push({ name: s.name, status: 'Created in database' })
          } else {
            const err = await createRes.json().catch(() => ({ error: 'failed' }))
            successfulStudents.push(s) // still try to add to group
            results.push({ name: s.name, status: err.error || 'May already exist' })
          }
        } catch {
          successfulStudents.push(s)
          results.push({ name: s.name, status: 'DB error (will still try group)' })
        }
      }

      // Phase 2: Create new group with ALL students at once (if creating new group)
      if (gName && !targetGroupId && successfulStudents.length > 0) {
        setBulkProgress({ current: students.length, total: students.length, results: [...results, { name: 'Group', status: 'Creating...' }] })
        try {
          const res = await fetch('/api/groups/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: gName,
              participants: successfulStudents.map(s => s.phone),
              participantNames: successfulStudents.map(s => s.name),
            }),
          })
          if (res.ok) {
            const data = await res.json()
            targetGroupId = data.groupId
            const warning = data.whatsappWarning ? ` (${data.whatsappWarning})` : ''
            results.push({ name: 'Group', status: `Created "${gName}"${warning}` })
          } else {
            results.push({ name: 'Group', status: 'Failed to create group' })
          }
        } catch {
          results.push({ name: 'Group', status: 'Network error creating group' })
        }
      }

      // Phase 2b: Add to existing group via bulk endpoint
      if (targetGroupId && !gName && successfulStudents.length > 0) {
        setBulkProgress({ current: students.length, total: students.length, results: [...results, { name: 'Group', status: 'Adding members...' }] })
        try {
          const res = await fetch(`/api/groups/${encodeURIComponent(targetGroupId)}/members-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              members: successfulStudents.map(s => ({ phone: s.phone, name: s.name })),
            }),
          })
          if (res.ok) {
            const data = await res.json()
            for (const r of (data.results || [])) {
              if (r.inviteSent) {
                results.push({ name: r.name, status: 'Invite sent' })
              } else if (r.error) {
                results.push({ name: r.name, status: r.error })
              } else {
                results.push({ name: r.name, status: 'Added to group' })
              }
            }
          } else {
            results.push({ name: 'Group', status: 'Failed to add members' })
          }
        } catch {
          results.push({ name: 'Group', status: 'Network error adding members' })
        }
      }

      setBulkProgress({ current: students.length, total: students.length, results })
      return results
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['batch-match'] })
      queryClient.invalidateQueries({ queryKey: ['groups', 'participants'] })
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
      // 1. Capture the Clover $250 auth (no-op if already captured or never auth'd).
      const reg = reviewingRegistration
      if (reg?.paymentStatus === 'authorized') {
        const capRes = await fetch(`/api/registrations/${id}/capture`, { method: 'POST' })
        if (!capRes.ok) {
          const err = await capRes.json().catch(() => ({}))
          throw new Error(err.error || 'Card capture failed — student NOT added to database')
        }
      }
      // 2. Confirm the registration (writes to MySQL student table).
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

  // Reject registration mutation — releases the Clover auth before deleting.
  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const reg = reviewingRegistration
      if (reg?.paymentStatus === 'authorized') {
        // Best-effort void; we still proceed to delete even if Clover errors.
        await fetch(`/api/registrations/${id}/void`, { method: 'POST' }).catch(() => null)
      }
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
    enabled: !!groupAssignment || showBulkAdd,
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
      // Open class setup dialog
      const phone = groupAssignment?.phone
      if (phone && selectedGroupId) {
        setClassSetupGroupId(selectedGroupId)
        setClassSetupPhones([phone])
        setClassSetupResults(null)
        setShowClassSetup(true)
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
    onSuccess: (data) => {
      if (data.whatsappWarning) {
        setSuccessMessage(`Group created (Note: ${data.whatsappWarning})`)
      } else {
        setSuccessMessage('Group created and student added!')
      }
      // Open class setup dialog
      const phone = groupAssignment?.phone
      if (phone && data.groupId) {
        setClassSetupGroupId(data.groupId)
        setClassSetupPhones([phone])
        setClassSetupResults(null)
        setShowClassSetup(true)
      }
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
    <main className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-6">
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
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRegistrations.map(reg => (
                      <TableRow key={reg.id}>
                        <TableCell>
                          {reg.vehicleType === 'truck' ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 font-medium">
                              <Truck className="h-3 w-3 mr-1" /> Truck
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100 font-medium">
                              <Car className="h-3 w-3 mr-1" /> Car
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <StudentAvatar
                              src={(reg as Registration & { avatarImage?: string | null }).avatarImage || null}
                              name={reg.fullName || ''}
                              size={32}
                            />
                            <span className="truncate">{reg.fullName || '-'}</span>
                          </div>
                        </TableCell>
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
                          <PaymentPill reg={reg} />
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

      {/* Confirmed but no WhatsApp group yet — explicit list so these
          students never disappear from the page just because nobody added
          them to a WA group. Click a row to open the DB profile. */}
      {orphanedConfirmed.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07, duration: 0.25 }}
        >
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5 text-amber-700" />
                Confirmed — Not in a Group Yet
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  {orphanedConfirmed.length}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Students who were confirmed but skipped the WhatsApp group step. Click a row to open
                their profile or use it to add them to an existing group later.
              </p>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Confirmed</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphanedConfirmed.map(reg => (
                      <TableRow
                        key={reg.id}
                        className="cursor-pointer hover:bg-amber-100/40"
                        onClick={() => {
                          if (reg.externalId) router.push(`/students/${reg.externalId}`)
                        }}
                      >
                        <TableCell>
                          {reg.vehicleType === 'truck' ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                              <Truck className="h-3 w-3 mr-1" /> Truck
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100">
                              <Car className="h-3 w-3 mr-1" /> Car
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <StudentAvatar
                              src={(reg as Registration & { avatarImage?: string | null }).avatarImage || null}
                              name={reg.fullName || ''}
                              size={32}
                            />
                            <span className="truncate">{reg.fullName || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{reg.phoneNumber || '-'}</TableCell>
                        <TableCell className="text-sm">{reg.email || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {reg.confirmedAt
                            ? new Date(reg.confirmedAt).toLocaleString('en-US', {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                              })
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {reg.externalId ? (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/students/${reg.externalId}`}>
                                <Eye className="h-3.5 w-3.5 mr-1" /> Open
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">no link</span>
                          )}
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
            ) : filteredStudents.length === 0 && (!dbSearchResults?.students?.length) ? (
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
                      const needsGroup = (student as { needsGroup?: boolean }).needsGroup
                      return (
                        <TableRow
                          key={student.phone}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => {
                            // Confirmed-but-groupless rows have no groupId, so
                            // route to the DB profile via the matched MySQL id.
                            if (needsGroup) {
                              const externalId = dbStudent?.student_id
                              if (externalId) {
                                router.push(`/students/${externalId}`)
                              }
                              return
                            }
                            router.push(`/groups/${encodeURIComponent(student.groupId)}/student/${encodeURIComponent(student.id)}`)
                          }}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <StudentAvatar
                                src={(student as { avatarImage?: string | null }).avatarImage || null}
                                name={displayName}
                                size={32}
                              />
                              <span className="truncate">{displayName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{formatPhoneNumber(student.phone)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {needsGroup ? (
                              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                                ⚠ No group yet
                              </Badge>
                            ) : (
                              student.groupName
                            )}
                          </TableCell>
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

            {/* MySQL Database Results — students not in active groups */}
            {searchQuery.trim().length >= 2 && dbSearchResults?.students && dbSearchResults.students.length > 0 && (() => {
              const activePhones = new Set(activeStudents.map(s => s.phone.slice(-10)))
              const dbOnly = dbSearchResults.students.filter(s => {
                const ph = (s.phone_number || '').replace(/\D/g, '').slice(-10)
                return !activePhones.has(ph)
              })
              if (dbOnly.length === 0) return null
              return (
                <div className="mt-4 border-t pt-4">
                  <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wider">Also found in database ({dbOnly.length})</p>
                  <div className="space-y-1">
                    {dbOnly.map(s => (
                      <div
                        key={s.student_id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/students/${s.student_id}`)}
                      >
                        <div>
                          <span className="font-medium text-sm">{s.full_name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{s.phone_number}</span>
                          {s.city && <span className="text-xs text-muted-foreground ml-2">{s.city}</span>}
                        </div>
                        <Badge variant="outline" className="text-xs">DB Only</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
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

            <button
              type="button"
              onClick={() => {
                setShowNewStudentChoice(false)
                setShowBulkAdd(true)
                setBulkText('')
                setBulkGroupId('')
                setBulkNewGroupName('')
                setBulkCreatingGroup(false)
                setBulkProgress(null)
              }}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors text-left"
            >
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Bulk Add</p>
                <p className="text-sm text-muted-foreground">Add multiple students at once and assign to a group</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowNewStudentChoice(false)
                setShowNewGroupWizard(true)
              }}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors text-left border-blue-200 bg-blue-50/30"
            >
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-blue-900">New Group + Class Setup</p>
                <p className="text-sm text-muted-foreground">Add students, create WhatsApp group, schedule class & send reminders</p>
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

      {/* Class Setup Dialog (after adding student to group) */}
      <Dialog open={showClassSetup} onOpenChange={(open) => {
        if (!open && !classSetupLoading) {
          setShowClassSetup(false)
          setClassSetupResults(null)
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Setup Class
            </DialogTitle>
            <DialogDescription>
              Set group description, send course book, and schedule the first class.
            </DialogDescription>
          </DialogHeader>

          {!classSetupResults ? (
            <div className="space-y-5 py-2">
              {/* Set Group Description */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="setupDesc"
                    checked={classSetupSetDesc}
                    onChange={e => setClassSetupSetDesc(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="setupDesc" className="text-sm font-medium cursor-pointer">
                    Set group description with Zoom links
                  </Label>
                </div>
                {classSetupSetDesc && (
                  <p className="text-xs text-muted-foreground ml-6">
                    Will add iOS + Android Zoom links and meeting password to the group description
                  </p>
                )}
              </div>

              {/* Send Book PDF */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="setupPdf"
                    checked={classSetupSendPdf}
                    onChange={e => setClassSetupSendPdf(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="setupPdf" className="text-sm font-medium cursor-pointer">
                    Send course book PDF
                  </Label>
                </div>
                {classSetupSendPdf && (
                  <div className="ml-6">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setClassSetupPdfName(file.name)
                        const reader = new FileReader()
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(',')[1]
                          setClassSetupPdfBase64(base64)
                        }
                        reader.readAsDataURL(file)
                      }}
                      className="text-sm"
                    />
                    {classSetupPdfName && (
                      <p className="text-xs text-green-600 mt-1">{classSetupPdfName} ready to send</p>
                    )}
                  </div>
                )}
              </div>

              {/* Schedule First Class */}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-medium">Schedule First Class</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Module</Label>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={classSetupModule}
                      onChange={e => setClassSetupModule(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
                    <Input
                      type="date"
                      value={classSetupDate}
                      onChange={e => setClassSetupDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Time</Label>
                    <Input
                      value={classSetupTime}
                      onChange={e => setClassSetupTime(e.target.value)}
                      placeholder="5 pm to 7 pm"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowClassSetup(false)
                  setClassSetupResults(null)
                }}>
                  Skip
                </Button>
                <Button
                  disabled={classSetupLoading || (!classSetupSetDesc && !classSetupSendPdf && !classSetupDate)}
                  onClick={async () => {
                    setClassSetupLoading(true)
                    try {
                      // Format date for display
                      let classDateFormatted = ''
                      if (classSetupDate) {
                        const [y, m, d] = classSetupDate.split('-').map(Number)
                        const dateObj = new Date(y, m - 1, d)
                        classDateFormatted = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                      }

                      const description = classSetupSetDesc
                        ? `Zoom Meeting Link:\n\niOS/Android App:\nzoom.us/j/4171672829\nMeeting ID: 417 167 2829\nPassword: qazi\n\nDesktop/Browser:\nhttps://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09\nPassword: qazi`
                        : undefined

                      const res = await fetch(`/api/groups/${encodeURIComponent(classSetupGroupId)}/setup`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          setDescription: classSetupSetDesc,
                          description,
                          sendPdf: classSetupSendPdf && classSetupPdfBase64,
                          pdfBase64: classSetupPdfBase64,
                          pdfFilename: classSetupPdfName,
                          memberPhones: classSetupPhones,
                          scheduleClass: !!classSetupDate,
                          moduleNumber: classSetupModule,
                          classDate: classDateFormatted,
                          classDateISO: classSetupDate,
                          classTime: classSetupTime,
                        }),
                      })

                      if (res.ok) {
                        const data = await res.json()
                        setClassSetupResults(data.results || [])
                      } else {
                        const err = await res.json()
                        setClassSetupResults([{ action: 'Setup', status: `Error: ${err.error}` }])
                      }
                    } catch (err) {
                      setClassSetupResults([{ action: 'Setup', status: `Error: ${err instanceof Error ? err.message : 'unknown'}` }])
                    } finally {
                      setClassSetupLoading(false)
                    }
                  }}
                >
                  {classSetupLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Setting up...</>
                  ) : (
                    'Setup & Send'
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium">Setup Complete</span>
              </div>
              <div className="border rounded-md divide-y">
                {classSetupResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{r.action}</span>
                    <span className={`text-xs ${r.status.includes('Failed') || r.status.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  setShowClassSetup(false)
                  setClassSetupResults(null)
                }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Group Wizard */}
      <NewGroupWizard open={showNewGroupWizard} onOpenChange={setShowNewGroupWizard} />

      {/* Bulk Add Dialog */}
      <Dialog open={showBulkAdd} onOpenChange={(open) => {
        if (!open && !bulkCreateMutation.isPending) {
          setShowBulkAdd(false)
          setBulkProgress(null)
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Bulk Add Students
            </DialogTitle>
            <DialogDescription>
              Paste student names and phone numbers, one per line. Format: Name, Phone
            </DialogDescription>
          </DialogHeader>

          {!bulkProgress ? (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Students (one per line)</Label>
                <textarea
                  className="w-full min-h-[180px] p-3 border rounded-md bg-background text-foreground text-sm font-mono resize-y"
                  placeholder={'Ahmed Khan, 5141234567\nSarah Johnson, 5149876543\nMohammed Ali, 4381112222'}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {bulkText.trim() ? `${bulkText.trim().split('\n').filter(l => l.trim()).length} students` : 'Supports: Name, Phone or Name Phone'}
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1.5 block">Assign to Group</Label>
                {!bulkCreatingGroup ? (
                  <div className="space-y-2">
                    <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
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
                          '1': 'Phase 1', '2': 'Phase 2', '3': 'Phase 3', '4': 'Phase 4', 'other': 'Other',
                        }
                        const phaseColors: Record<string, string> = {
                          '1': 'bg-blue-500', '2': 'bg-green-500', '3': 'bg-orange-500', '4': 'bg-purple-500', 'other': 'bg-gray-500',
                        }
                        const grouped = new Map<string, typeof groups>()
                        for (const g of groups) {
                          const p = getPhase(g.moduleNumber)
                          const key = p ? String(p) : 'other'
                          if (!grouped.has(key)) grouped.set(key, [])
                          grouped.get(key)!.push(g)
                        }
                        for (const [, gs] of grouped) {
                          gs.sort((a, b) => (a.moduleNumber ?? 99) - (b.moduleNumber ?? 99))
                        }
                        return ['1', '2', '3', '4', 'other'].filter(k => grouped.has(k)).map(key => (
                          <div key={key}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className={`w-1.5 h-1.5 rounded-full ${phaseColors[key]}`} />
                              <span className="text-[10px] font-medium text-muted-foreground">{phaseLabels[key]}</span>
                            </div>
                            {grouped.get(key)!.map(g => (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => setBulkGroupId(g.id)}
                                className={`w-full flex items-center justify-between p-2 rounded-md border text-left text-sm transition-all mb-1 ${
                                  bulkGroupId === g.id
                                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                    : 'border-border hover:border-primary/50 hover:bg-accent'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="truncate">{g.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {g.moduleNumber && (
                                    <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1 py-0.5 rounded font-medium">
                                      M{g.moduleNumber}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">{g.participantCount}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        ))
                      })()}
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setBulkCreatingGroup(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Create New Group
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={bulkNewGroupName}
                      onChange={e => setBulkNewGroupName(e.target.value)}
                      placeholder="e.g. Module 5 - March 2026"
                    />
                    <Button variant="outline" size="sm" onClick={() => setBulkCreatingGroup(false)}>
                      Back to existing groups
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBulkAdd(false)}>Cancel</Button>
                <Button
                  disabled={!bulkText.trim() || bulkCreateMutation.isPending}
                  onClick={() => {
                    const lines = bulkText.trim().split('\n').filter(l => l.trim())
                    const students = lines.map(line => {
                      // Support: "Name, Phone" or "Name Phone" or "Name\tPhone"
                      const parts = line.split(/[,\t]+/).map(s => s.trim())
                      if (parts.length >= 2) {
                        return { name: parts[0], phone: parts[parts.length - 1].replace(/\D/g, '') }
                      }
                      // Try splitting on last space group that looks like a phone
                      const match = line.trim().match(/^(.+?)\s+([\d\s()-]{7,})$/)
                      if (match) {
                        return { name: match[1].trim(), phone: match[2].replace(/\D/g, '') }
                      }
                      return { name: line.trim(), phone: '' }
                    }).filter(s => s.name && s.phone)

                    if (students.length === 0) return

                    // Add country code if missing (default Canada +1)
                    for (const s of students) {
                      if (s.phone.length === 10) s.phone = '1' + s.phone
                    }

                    // Dedupe by phone number
                    const seen = new Set<string>()
                    const deduped = students.filter(s => {
                      if (seen.has(s.phone)) return false
                      seen.add(s.phone)
                      return true
                    })
                    students.length = 0
                    students.push(...deduped)

                    bulkCreateMutation.mutate({
                      students,
                      groupId: bulkGroupId || undefined,
                      newGroupName: bulkCreatingGroup ? bulkNewGroupName : undefined,
                    })
                  }}
                >
                  {bulkCreateMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Adding...</>
                  ) : (
                    <><UserPlus className="h-4 w-4 mr-2" />Add {bulkText.trim().split('\n').filter(l => l.trim()).length} Students</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                {bulkProgress.current < bulkProgress.total ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
                <span className="text-sm font-medium">
                  {bulkProgress.current < bulkProgress.total
                    ? `Processing ${bulkProgress.current}/${bulkProgress.total}...`
                    : `Done! ${bulkProgress.total} students processed`}
                </span>
              </div>

              <div className="max-h-[300px] overflow-y-auto border rounded-md">
                {bulkProgress.results.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-2 text-sm ${i > 0 ? 'border-t' : ''}`}>
                    <span className="font-medium">{r.name}</span>
                    <span className={`text-xs ${r.status.includes('error') || r.status.includes('failed') || r.status.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>

              {bulkProgress.current >= bulkProgress.total && (
                <DialogFooter>
                  <Button onClick={() => {
                    setShowBulkAdd(false)
                    setBulkProgress(null)
                    setBulkText('')
                  }}>
                    Done
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
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
              {reviewingRegistration?.vehicleType === 'truck' ? (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 ml-1">
                  <Truck className="h-3 w-3 mr-1" /> Class 1 Truck
                </Badge>
              ) : (
                <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100 ml-1">
                  <Car className="h-3 w-3 mr-1" /> Class 5 Car
                </Badge>
              )}
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

              {/* Licence/ID photos + permit expiry that the student
                  uploaded on the form. Photos open full size in a new
                  tab so the admin can verify the licence number visually. */}
              {(reviewingRegistration.permitImage || reviewingRegistration.idImage || reviewingRegistration.avatarImage || reviewingRegistration.permitExpiry) && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Driver Licence & ID</p>
                  {reviewingRegistration.permitExpiry && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Licence expires:</span>{' '}
                      <strong>{reviewingRegistration.permitExpiry}</strong>
                    </div>
                  )}
                  {reviewingRegistration.avatarImage && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Student photo</p>
                      <a href={reviewingRegistration.avatarImage} target="_blank" rel="noopener noreferrer" className="inline-block">
                        <img
                          src={reviewingRegistration.avatarImage}
                          alt="Student"
                          className="h-32 w-32 rounded-full object-cover border-2 border-amber-300 hover:ring-2 hover:ring-amber-400 transition-all"
                        />
                      </a>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {reviewingRegistration.permitImage && (
                      <a
                        href={reviewingRegistration.permitImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Licence photo</p>
                        <img
                          src={reviewingRegistration.permitImage}
                          alt="Driver licence"
                          className="w-full rounded border group-hover:ring-2 group-hover:ring-amber-400 transition-all"
                        />
                      </a>
                    )}
                    {reviewingRegistration.idImage && (
                      <a
                        href={reviewingRegistration.idImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">ID photo</p>
                        <img
                          src={reviewingRegistration.idImage}
                          alt="ID"
                          className="w-full rounded border group-hover:ring-2 group-hover:ring-amber-400 transition-all"
                        />
                      </a>
                    )}
                  </div>
                </div>
              )}

              <MedicalDeclarationBlock medical={reviewingRegistration.medical} />

              {/* Truck (Class 1) service contract panel — only for truck
                  registrations. Surfaces consents/dates, lets the admin
                  preview/print the PDF, counter-sign it, and email it. */}
              {reviewingRegistration.vehicleType === 'truck' && (
                <TruckContractPanel
                  reg={reviewingRegistration}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ['registrations', 'submitted'] })}
                />
              )}

              <PaymentStatusBlock reg={reviewingRegistration} />

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
                  {reviewingRegistration.paymentStatus === 'authorized'
                    ? 'Reject & void hold'
                    : 'Reject'}
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
                        {reviewingRegistration.paymentStatus === 'authorized' ? 'Charging…' : 'Confirming…'}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {reviewingRegistration.paymentStatus === 'authorized'
                          ? 'Approve & charge $250'
                          : 'Confirm & Add to DB'}
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

// ---------------------------------------------------------------------------
// SAAQ 6224A self-declaration of medical info — display block in review dialog
// ---------------------------------------------------------------------------
const SAAQ_CONDITIONS_EN = [
  'Wears glasses or contact lenses to drive',
  'Eye disease or disorder (cataracts, glaucoma, retinopathy, etc.)',
  'Hearing impairment + drives minibus/bus/emergency or transports dangerous substances',
  'Vertigo restricting activities',
  'Heart disease restricting activities such as walking',
  'Excessive sleepiness related to a sleep disorder',
  'Significant movement limitations (neck, hands, feet) for several months',
  'Serious psychiatric disorder (schizophrenia, bipolar, major depression, etc.)',
  'Substance use disorder (alcohol, drugs, etc.)',
  'Cognitive impairment (dementia, Alzheimer\'s, memory or orientation problems)',
  'Has had epileptic seizures',
  'Neurological condition restricting activities (stroke, head trauma, Parkinson\'s, MS, etc.)',
  'Loss of consciousness in past 12 months (syncope, convulsions, hypoglycemia)',
  'Insulin-treated diabetes',
  'Lung disease restricting activities such as walking',
  'Deterioration of functional abilities (needs home assistance for daily activities)',
  'Regularly takes medication that causes daytime drowsiness',
]

// ---------------------------------------------------------------------------
// Clover auth-then-capture status block
// ---------------------------------------------------------------------------
// Class 1 service contract panel — preview, counter-sign, email.
// Renders only inside the truck registration review dialog.
function TruckContractPanel({ reg, onChanged }: { reg: Registration; onChanged: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [repName, setRepName] = useState('')
  const [signError, setSignError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [overrideTo, setOverrideTo] = useState('')

  // Initialise the canvas once it's in the DOM.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(2, 2)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
    }
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const evt = 'touches' in e ? e.touches[0] : e
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top }
  }
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    setDrawing(true)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath(); ctx.moveTo(x, y)
  }
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y); ctx.stroke()
    setHasInk(true)
  }
  const stop = () => setDrawing(false)
  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const signMutation = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current
      if (!canvas || !hasInk) throw new Error('Please sign in the box first')
      if (!repName.trim()) throw new Error('Enter the signer name')
      const dataUrl = canvas.toDataURL('image/png')
      const res = await fetch('/api/register/sign-rep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: reg.id, signatureDataUrl: dataUrl, repName: repName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save signature')
      }
      return res.json()
    },
    onSuccess: () => { setSignError(null); clear(); onChanged() },
    onError: e => setSignError(e instanceof Error ? e.message : 'Failed'),
  })

  const emailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/register/email-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: reg.id, to: overrideTo.trim() || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send')
      }
      return res.json()
    },
    onSuccess: () => { setEmailError(null); setEmailSent(true) },
    onError: e => setEmailError(e instanceof Error ? e.message : 'Failed'),
  })

  const contractHref = `/api/register/contract?registrationId=${encodeURIComponent(reg.id)}`
  const alreadySigned = !!reg.repSignatureImage
  const consentsOk = reg.consentSaaqTransmission && reg.consentFileTransfer && reg.consentContactInfo

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-amber-700" />
          <div>
            <p className="font-semibold text-sm">Class 1 Service Contract</p>
            <p className="text-[11px] text-muted-foreground">
              {reg.contractNumber ? `Contract ${reg.contractNumber}` : 'Not yet numbered'} ·
              {alreadySigned ? ' Counter-signed' : ' Awaiting counter-signature'}
            </p>
          </div>
        </div>
        <a
          href={contractHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs inline-flex items-center gap-1 px-3 py-1.5 border rounded hover:bg-muted"
        >
          <FileText className="h-3.5 w-3.5" /> Preview PDF
        </a>
      </div>

      {/* Quick facts pulled from the registration */}
      <div className="grid grid-cols-2 gap-2 text-[12px] bg-white dark:bg-background rounded p-2 border">
        <div><span className="text-muted-foreground">First course:</span> {reg.firstCourseDate || '—'}</div>
        <div><span className="text-muted-foreground">Max complete:</span> {reg.maxCompletionDate || '—'}</div>
        <div><span className="text-muted-foreground">Signed at:</span> {reg.signedAtPlace || '—'}</div>
        <div className={consentsOk ? 'text-green-700' : 'text-amber-700'}>
          {consentsOk ? '✓ 3 SAAQ consents' : '⚠ Consents incomplete'}
        </div>
      </div>

      {/* Counter-signature */}
      {!alreadySigned ? (
        <div className="space-y-2">
          <Label className="text-xs">School representative — sign here *</Label>
          <Input
            value={repName}
            onChange={e => setRepName(e.target.value)}
            placeholder="Printed name (e.g. Mohammed Qazi)"
            className="h-8 text-sm"
          />
          <div className="bg-white border-2 rounded relative" style={{ touchAction: 'none', height: 120 }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair"
              onMouseDown={start}
              onMouseMove={move}
              onMouseUp={stop}
              onMouseLeave={stop}
              onTouchStart={start}
              onTouchMove={move}
              onTouchEnd={stop}
            />
            {!hasInk && (
              <p className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs pointer-events-none">
                Sign with mouse or finger
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clear} disabled={!hasInk}>Clear</Button>
            <Button size="sm" onClick={() => signMutation.mutate()} disabled={signMutation.isPending || !hasInk || !repName.trim()}>
              {signMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save signature
            </Button>
            {signError && <span className="text-xs text-destructive">{signError}</span>}
          </div>
        </div>
      ) : (
        <div className="rounded border bg-green-50/40 dark:bg-green-950/30 p-2 text-xs flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span>
            Counter-signed by <strong>{reg.repSignerName || '—'}</strong>
            {reg.repSignedAt && ` on ${new Date(reg.repSignedAt).toLocaleDateString('en-CA')}`}.
          </span>
        </div>
      )}

      {/* Email contract */}
      <div className="space-y-2">
        <Label className="text-xs">Email the signed contract to the student</Label>
        <div className="flex items-center gap-2">
          <Input
            type="email"
            value={overrideTo}
            onChange={e => setOverrideTo(e.target.value)}
            placeholder={reg.email || 'no email on file'}
            className="h-8 text-sm flex-1"
            disabled={emailMutation.isPending}
          />
          <Button
            size="sm"
            disabled={emailMutation.isPending || (!reg.email && !overrideTo.trim())}
            onClick={() => emailMutation.mutate()}
          >
            {emailMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {emailSent ? 'Sent ✓' : 'Send'}
          </Button>
        </div>
        {!reg.email && !overrideTo && (
          <p className="text-[11px] text-amber-600">No email on file. Enter one above.</p>
        )}
        {emailError && <p className="text-[11px] text-destructive">{emailError}</p>}
        {!alreadySigned && (
          <p className="text-[11px] text-muted-foreground">Tip: counter-sign first — the emailed copy will include both signatures.</p>
        )}
      </div>
    </div>
  )
}

/**
 * Compact one-line payment status pill — used in the pending registrations
 * table so you can spot card failures / missing payments at a glance
 * without opening the review dialog.
 */
function PaymentPill({ reg }: { reg: Registration }) {
  const status = reg.paymentStatus
  if (!status) {
    return (
      <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
        ⚠ No payment
      </Badge>
    )
  }
  if (status === 'captured') {
    return (
      <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">
        ✓ Paid (card)
      </Badge>
    )
  }
  if (status === 'authorized') {
    return (
      <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50">
        💳 Card held
      </Badge>
    )
  }
  if (status === 'cash-pending') {
    return (
      <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
        💵 Cash — collect
      </Badge>
    )
  }
  if (status === 'cash-paid') {
    return (
      <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">
        ✓ Paid (cash)
      </Badge>
    )
  }
  if (status === 'voided') {
    return (
      <Badge variant="outline" className="text-muted-foreground border-muted">
        Released
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">
        ✗ Card failed
      </Badge>
    )
  }
  return <Badge variant="outline">{status}</Badge>
}

function PaymentStatusBlock({ reg }: { reg: Registration }) {
  const status = reg.paymentStatus
  const amount = reg.paymentAmount ? (reg.paymentAmount / 100).toFixed(2) : '250.00'
  const brand = reg.paymentBrand ? reg.paymentBrand.charAt(0).toUpperCase() + reg.paymentBrand.slice(1) : 'Card'
  const last4 = reg.paymentLast4 || '••••'

  if (!status) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2.5">
        <p className="text-sm font-medium text-amber-800">⚠ No payment attempted</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Student submitted the form but no card was authorized and no cash was selected.
        </p>
      </div>
    )
  }
  if (status === 'cash-pending') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2.5">
        <p className="text-sm font-medium text-amber-800">💵 Cash chosen — not yet collected</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Student chose to pay the ${amount} initial fee in cash. Collect the cash and mark the
          auto-generated invoice as paid in the Invoice list.
        </p>
      </div>
    )
  }
  if (status === 'cash-paid') {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 px-3 py-2.5">
        <p className="text-sm font-medium text-emerald-800">✓ ${amount} received in cash</p>
      </div>
    )
  }

  if (status === 'authorized') {
    // Auth expires ~5-7 days after creation. Show the deadline.
    let deadline = ''
    if (reg.paymentAuthorizedAt) {
      const expiry = new Date(new Date(reg.paymentAuthorizedAt).getTime() + 7 * 24 * 60 * 60 * 1000)
      deadline = expiry.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
    }
    return (
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
          💳 ${amount} authorized on {brand} •••• {last4}
        </p>
        {deadline && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Funds held — capture before {deadline} or the hold expires.
          </p>
        )}
      </div>
    )
  }

  if (status === 'captured') {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          ✓ ${amount} charged on {brand} •••• {last4}
        </p>
        {reg.paymentCapturedAt && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Captured {new Date(reg.paymentCapturedAt).toLocaleString()}
          </p>
        )}
      </div>
    )
  }

  if (status === 'voided') {
    return (
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Card hold released — no charge made.
      </div>
    )
  }

  // failed
  return (
    <div className="rounded-lg border border-red-400 bg-red-50/70 dark:bg-red-950/30 px-3 py-2.5">
      <p className="text-sm font-medium text-red-700 dark:text-red-300">✗ Card payment failed — registration UNPAID</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        The student's card did not authorize. They will need to retry the payment before you can confirm them.
      </p>
      {reg.paymentError && (
        <p className="text-[11px] text-red-700/80 mt-1 font-mono">{reg.paymentError}</p>
      )}
    </div>
  )
}

function MedicalDeclarationBlock({ medical }: { medical: string | null }) {
  if (!medical) {
    return (
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        No medical declaration captured (older registration).
      </div>
    )
  }

  let parsed: { conditions?: number[]; none?: boolean; attestedAt?: string | null } | null = null
  try {
    parsed = JSON.parse(medical)
  } catch {
    return (
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Medical data could not be parsed.
      </div>
    )
  }

  const conditions = parsed?.conditions || []
  const none = !!parsed?.none

  if (none) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          ✓ No medical conditions declared (SAAQ 6224A)
        </p>
        {parsed?.attestedAt && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Attested {new Date(parsed.attestedAt).toLocaleString()}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
        ⚠ {conditions.length} condition{conditions.length === 1 ? '' : 's'} declared (SAAQ 6224A)
      </p>
      <ul className="mt-2 space-y-1 text-xs text-foreground/85">
        {conditions.map((n) => (
          <li key={n} className="flex items-start gap-2">
            <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums shrink-0">
              {String(n).padStart(2, '0')}
            </span>
            <span>{SAAQ_CONDITIONS_EN[n - 1] ?? `Condition ${n}`}</span>
          </li>
        ))}
      </ul>
      {parsed?.attestedAt && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Attested {new Date(parsed.attestedAt).toLocaleString()}
        </p>
      )}
    </div>
  )
}
