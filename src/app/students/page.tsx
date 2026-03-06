'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
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
  Search,
  Plus,
  Loader2,
  UserPlus,
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
} from 'lucide-react'
import { motion } from 'motion/react'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'

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

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StudentRecord[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

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

  // Search handler
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setHasSearched(true)
    try {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(searchQuery.trim())}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setSearchResults(data.students || [])
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

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
      setFormData(EMPTY_FORM)
      if (searchQuery.trim()) handleSearch()
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ student_id, ...fields }: StudentFormData & { student_id: number }) => {
      const res = await fetch('/api/students/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id, ...fields }),
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
      if (searchQuery.trim()) handleSearch()
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

  const handleSubmit = () => {
    const required: (keyof StudentFormData)[] = [
      'full_name', 'phone_number', 'permit_number', 'full_address',
      'city', 'postal_code', 'dob', 'email',
    ]
    for (const field of required) {
      if (!formData[field]?.trim()) return
    }
    if (editingStudent) {
      updateMutation.mutate({ ...formData, student_id: editingStudent.student_id })
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

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone, permit number, or contract number..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search Results */}
      {hasSearched && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                Search Results
                {searchResults.length > 0 && (
                  <Badge variant="secondary">{searchResults.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-muted-foreground">Searching...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-3">No students found</p>
                  <Button variant="outline" size="sm" onClick={() => setShowNewStudentChoice(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add New Student
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Permit #</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.map(student => (
                        <TableRow key={student.student_id} className="cursor-pointer hover:bg-accent/50">
                          <TableCell className="font-medium">{student.full_name}</TableCell>
                          <TableCell className="text-sm">{student.phone_number}</TableCell>
                          <TableCell className="text-sm font-mono">{student.permit_number}</TableCell>
                          <TableCell className="text-sm">{student.city}</TableCell>
                          <TableCell>
                            {student.status && (
                              <Badge variant="secondary" className="text-xs">{student.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditForm(student)}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
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
      )}

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
              <Input
                id="phone_number"
                placeholder="514-555-1234"
                value={formData.phone_number}
                onChange={e => updateField('phone_number', e.target.value)}
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
                Permit Number <span className="text-destructive">*</span>
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
                  <Input
                    value={reviewFormData.phoneNumber}
                    onChange={e => updateReviewField('phoneNumber', e.target.value)}
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
