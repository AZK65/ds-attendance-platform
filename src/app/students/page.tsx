'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
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
} from 'lucide-react'
import { motion } from 'motion/react'

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

export default function StudentsPage() {
  const searchParams = useSearchParams()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StudentRecord[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<StudentFormData>(EMPTY_FORM)
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

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
      // Re-search to show the new student
      if (searchQuery.trim()) {
        handleSearch()
      }
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
      // Re-search to show updated data
      if (searchQuery.trim()) {
        handleSearch()
      }
    },
  })

  const handleSubmit = () => {
    // Validate required fields
    const required: (keyof StudentFormData)[] = [
      'full_name', 'phone_number', 'permit_number', 'full_address',
      'city', 'postal_code', 'dob', 'email',
    ]
    for (const field of required) {
      if (!formData[field]?.trim()) {
        return
      }
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
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingStudent(null)
    setFormData(EMPTY_FORM)
    createMutation.reset()
    updateMutation.reset()
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error || updateMutation.error

  const updateField = (field: keyof StudentFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

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
        <Button onClick={openAddForm}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Student
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
                  <Button variant="outline" size="sm" onClick={openAddForm}>
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
            {/* Full Name */}
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

            {/* Phone */}
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
            </div>

            {/* Email */}
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

            {/* Permit Number */}
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

            {/* DOB */}
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

            {/* Address */}
            <div className="sm:col-span-2">
              <Label htmlFor="full_address" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="full_address"
                placeholder="123 Main Street, Apt 4"
                value={formData.full_address}
                onChange={e => updateField('full_address', e.target.value)}
              />
            </div>

            {/* City */}
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

            {/* Postal Code */}
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

          {/* Error */}
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
                <>
                  {editingStudent ? 'Update Student' : 'Add Student'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
