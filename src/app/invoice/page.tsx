'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Receipt, Plus, Trash2, Download, Loader2, Settings, CheckCircle2,
  Car, Truck, ArrowLeft, ArrowRight, FileText, Package,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { StudentSearchAutocomplete, type StudentResult, type DBStudent } from '@/components/StudentSearchAutocomplete'

// Types
interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

interface InvoiceFormData {
  studentName: string
  studentAddress: string
  studentCity: string
  studentProvince: string
  studentPostalCode: string
  studentPhone: string
  studentEmail: string
  invoiceDate: string
  dueDate: string
  notes: string
}

interface InvoiceService {
  id: string
  name: string
  price: number
  vehicleType: string
}

type Step = 'student' | 'review' | 'done'

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

export default function InvoicePage() {
  const queryClient = useQueryClient()
  const today = formatDateForInput(new Date())
  const thirtyDaysLater = formatDateForInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

  // Step state
  const [step, setStep] = useState<Step>('student')
  const [vehicleType, setVehicleType] = useState<'car' | 'truck' | null>(null)
  const [selectedStudent, setSelectedStudent] = useState(false)

  // Form state
  const [formData, setFormData] = useState<InvoiceFormData>({
    studentName: '',
    studentAddress: '',
    studentCity: '',
    studentProvince: 'QC',
    studentPostalCode: '',
    studentPhone: '',
    studentEmail: '',
    invoiceDate: today,
    dueDate: thirtyDaysLater,
    notes: '',
  })

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: generateId(), description: '', quantity: 1, unitPrice: 0 },
  ])

  const [taxesEnabled, setTaxesEnabled] = useState(true)

  // Load invoice settings
  const { data: settings } = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: async () => {
      const res = await fetch('/api/invoice/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      return res.json()
    },
  })

  // Apply default notes from settings when loaded
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  useEffect(() => {
    if (settings && !defaultsApplied) {
      setFormData(prev => ({ ...prev, notes: settings.notes || '' }))
      setTaxesEnabled(settings.taxesEnabled ?? true)
      setDefaultsApplied(true)
    }
  }, [settings, defaultsApplied])

  // Pre-fill from URL query params (e.g. from student detail page "Create Invoice" button)
  const searchParams = useSearchParams()
  const [urlPrefilled, setUrlPrefilled] = useState(false)
  useEffect(() => {
    if (urlPrefilled) return
    const studentName = searchParams.get('studentName')
    if (studentName) {
      setFormData(prev => ({
        ...prev,
        studentName,
        studentPhone: searchParams.get('studentPhone') || prev.studentPhone,
        studentAddress: searchParams.get('studentAddress') || prev.studentAddress,
        studentCity: searchParams.get('studentCity') || prev.studentCity,
        studentPostalCode: searchParams.get('studentPostalCode') || prev.studentPostalCode,
        studentEmail: searchParams.get('studentEmail') || prev.studentEmail,
      }))
      setSelectedStudent(true)
      setUrlPrefilled(true)
    }
  }, [searchParams, urlPrefilled])

  // Load services for vehicle type selection (for quick-add in review step)
  const { data: allServicesData } = useQuery({
    queryKey: ['invoice-services'],
    queryFn: async () => {
      const res = await fetch('/api/invoice/services')
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ services: InvoiceService[] }>
    },
  })

  // Load services for the selected vehicle type
  const { data: vehicleServicesData } = useQuery({
    queryKey: ['invoice-services', vehicleType],
    queryFn: async () => {
      const res = await fetch(`/api/invoice/services?type=${vehicleType}`)
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ services: InvoiceService[] }>
    },
    enabled: !!vehicleType,
  })

  const allServices = allServicesData?.services || []

  // Derived values
  const invoicePrefix = settings?.invoicePrefix || 'INV'
  const nextNumber = settings?.nextInvoiceNumber || 1
  const invoiceNumber = `${invoicePrefix}-${String(nextNumber).padStart(4, '0')}`
  const gstRate = settings?.defaultGstRate ?? 5.0
  const qstRate = settings?.defaultQstRate ?? 9.975

  // Computed totals
  const { subtotal, gstAmount, qstAmount, total } = useMemo(() => {
    const sub = lineItems.reduce((sum, item) => {
      return sum + Math.round(item.quantity * item.unitPrice * 100) / 100
    }, 0)
    const gst = taxesEnabled ? Math.round(sub * gstRate) / 100 : 0
    const qst = taxesEnabled ? Math.round(sub * qstRate * 10) / 1000 : 0
    return {
      subtotal: Math.round(sub * 100) / 100,
      gstAmount: Math.round(gst * 100) / 100,
      qstAmount: Math.round(qst * 100) / 100,
      total: Math.round((sub + gst + qst) * 100) / 100,
    }
  }, [lineItems, taxesEnabled, gstRate, qstRate])

  // Auto-fill line items when vehicle type services load
  useEffect(() => {
    if (vehicleServicesData?.services && vehicleType) {
      const newItems = vehicleServicesData.services.map((s: InvoiceService) => ({
        id: generateId(),
        description: s.name,
        quantity: 1,
        unitPrice: s.price,
      }))
      if (newItems.length > 0) {
        setLineItems(newItems)
      }
      setStep('review')
    }
  }, [vehicleServicesData, vehicleType])

  // PDF generation mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        schoolName: settings?.schoolName || 'École de Conduite Qazi',
        schoolAddress: settings?.schoolAddress || '',
        schoolCity: settings?.schoolCity || '',
        schoolProvince: settings?.schoolProvince || 'QC',
        schoolPostalCode: settings?.schoolPostalCode || '',
        gstNumber: settings?.gstNumber || '',
        qstNumber: settings?.qstNumber || '',
        studentName: formData.studentName,
        studentAddress: formData.studentAddress,
        studentCity: formData.studentCity,
        studentProvince: formData.studentProvince,
        studentPostalCode: formData.studentPostalCode,
        studentPhone: formData.studentPhone,
        studentEmail: formData.studentEmail,
        invoiceNumber,
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate,
        lineItems: lineItems.filter(item => item.description.trim()),
        subtotal,
        gstRate,
        qstRate,
        gstAmount,
        qstAmount,
        total,
        taxesEnabled,
        notes: formData.notes,
      }

      const res = await fetch('/api/invoice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate invoice')
      }

      return res.blob()
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${invoiceNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setStep('done')
      saveMutation.mutate()
    },
  })

  // Save mutation (fire-and-forget)
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/invoice/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber,
          studentName: formData.studentName,
          studentAddress: formData.studentAddress,
          studentCity: formData.studentCity,
          studentProvince: formData.studentProvince,
          studentPostalCode: formData.studentPostalCode,
          studentPhone: formData.studentPhone,
          studentEmail: formData.studentEmail,
          invoiceDate: formData.invoiceDate,
          dueDate: formData.dueDate,
          lineItems: lineItems.filter(item => item.description.trim()),
          subtotal,
          gstAmount,
          qstAmount,
          total,
          notes: formData.notes,
        }),
      })
      if (!res.ok) throw new Error('Failed to save invoice')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-settings'] })
    },
  })

  // Handlers
  const handleFieldChange = (field: keyof InvoiceFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleStudentSelect = (student: StudentResult) => {
    setFormData(prev => ({
      ...prev,
      studentName: student.name || '',
      studentAddress: student.address || '',
      studentCity: student.municipality || '',
      studentProvince: student.province || 'QC',
      studentPostalCode: student.postalCode || '',
      studentPhone: student.phone || '',
      studentEmail: '',
    }))
    setSelectedStudent(true)
  }

  const handleDBStudentSelect = (student: DBStudent) => {
    setFormData(prev => ({
      ...prev,
      studentName: student.full_name || '',
      studentAddress: student.full_address || '',
      studentCity: student.city || '',
      studentProvince: 'QC',
      studentPostalCode: student.postal_code || '',
      studentPhone: student.phone_number || '',
      studentEmail: student.email || '',
    }))
    setSelectedStudent(true)
  }

  const handleVehicleTypeSelect = (type: 'car' | 'truck') => {
    setVehicleType(type)
    // The useEffect above will handle auto-filling and advancing to review
  }

  const handleSkipToCustom = () => {
    setLineItems([{ id: generateId(), description: '', quantity: 1, unitPrice: 0 }])
    setStep('review')
  }

  const addLineItem = () => {
    setLineItems(prev => [...prev, { id: generateId(), description: '', quantity: 1, unitPrice: 0 }])
  }

  const addServiceAsItem = (service: InvoiceService) => {
    setLineItems(prev => [...prev, { id: generateId(), description: service.name, quantity: 1, unitPrice: service.price }])
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.filter(item => item.id !== id))
  }

  const resetForm = () => {
    setFormData({
      studentName: '',
      studentAddress: '',
      studentCity: '',
      studentProvince: 'QC',
      studentPostalCode: '',
      studentPhone: '',
      studentEmail: '',
      invoiceDate: today,
      dueDate: thirtyDaysLater,
      notes: settings?.notes || '',
    })
    setLineItems([{ id: generateId(), description: '', quantity: 1, unitPrice: 0 }])
    setSelectedStudent(false)
    setVehicleType(null)
    setStep('student')
  }

  const canGenerate = formData.studentName.trim() && lineItems.some(item => item.description.trim() && item.unitPrice > 0)

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Receipt className="h-6 w-6" />
                Create Invoice
              </h2>
              <p className="text-muted-foreground mt-1">
                Generate professional invoices for students
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/invoice/services">
                <Button variant="outline" size="sm">
                  <Package className="h-4 w-4 mr-1" />
                  Services
                </Button>
              </Link>
              <Link href="/invoice/settings">
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {(['student', 'review', 'done'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-0.5 ${step === s || (['review', 'done'].indexOf(step) >= i) ? 'bg-primary' : 'bg-muted'}`} />}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s ? 'bg-primary text-primary-foreground'
                    : (['review', 'done'].indexOf(step) > (['student', 'review', 'done'].indexOf(s)))
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </div>
              </div>
            ))}
          </div>

          {/* ========== STEP 1: SELECT STUDENT ========== */}
          {step === 'student' && (
            <div className="space-y-6">
              {/* Student Search Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Student Information</CardTitle>
                  <CardDescription>Search for an existing student or enter details manually</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Search existing student</Label>
                    <StudentSearchAutocomplete
                      onSelect={handleStudentSelect}
                      onSelectDB={handleDBStudentSelect}
                      placeholder="Search by name, phone, or licence number..."
                    />
                  </div>

                  {selectedStudent && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Student loaded — fields auto-filled
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="studentName">Name *</Label>
                      <Input
                        id="studentName"
                        value={formData.studentName}
                        onChange={(e) => handleFieldChange('studentName', e.target.value)}
                        placeholder="Student name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="studentEmail">Email</Label>
                      <Input
                        id="studentEmail"
                        type="email"
                        value={formData.studentEmail}
                        onChange={(e) => handleFieldChange('studentEmail', e.target.value)}
                        placeholder="student@email.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="studentPhone">Phone</Label>
                      <Input
                        id="studentPhone"
                        value={formData.studentPhone}
                        onChange={(e) => handleFieldChange('studentPhone', e.target.value)}
                        placeholder="(514) 555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="studentAddress">Address</Label>
                      <Input
                        id="studentAddress"
                        value={formData.studentAddress}
                        onChange={(e) => handleFieldChange('studentAddress', e.target.value)}
                        placeholder="123 Street"
                      />
                    </div>
                    <div>
                      <Label htmlFor="studentCity">City</Label>
                      <Input
                        id="studentCity"
                        value={formData.studentCity}
                        onChange={(e) => handleFieldChange('studentCity', e.target.value)}
                        placeholder="Montréal"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="studentProvince">Province</Label>
                        <Input
                          id="studentProvince"
                          value={formData.studentProvince}
                          onChange={(e) => handleFieldChange('studentProvince', e.target.value)}
                          placeholder="QC"
                        />
                      </div>
                      <div>
                        <Label htmlFor="studentPostalCode">Postal Code</Label>
                        <Input
                          id="studentPostalCode"
                          value={formData.studentPostalCode}
                          onChange={(e) => handleFieldChange('studentPostalCode', e.target.value)}
                          placeholder="H3N 1S2"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vehicle Type Selection */}
              {formData.studentName.trim() && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Course Type</CardTitle>
                    <CardDescription>Select the vehicle type to auto-fill pricing</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button
                        onClick={() => handleVehicleTypeSelect('car')}
                        className="flex flex-col items-center gap-3 p-6 border-2 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group"
                      >
                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                          <Car className="h-8 w-8 text-blue-600" />
                        </div>
                        <div className="text-center">
                          <h3 className="font-semibold text-lg">Car</h3>
                          <p className="text-sm text-muted-foreground">Passenger vehicle course</p>
                        </div>
                      </button>

                      <button
                        onClick={() => handleVehicleTypeSelect('truck')}
                        className="flex flex-col items-center gap-3 p-6 border-2 rounded-xl hover:border-orange-500 hover:bg-orange-50/50 transition-all group"
                      >
                        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                          <Truck className="h-8 w-8 text-orange-600" />
                        </div>
                        <div className="text-center">
                          <h3 className="font-semibold text-lg">Truck</h3>
                          <p className="text-sm text-muted-foreground">Commercial vehicle course</p>
                        </div>
                      </button>
                    </div>

                    <div className="text-center mt-4">
                      <Button variant="ghost" size="sm" onClick={handleSkipToCustom} className="text-muted-foreground">
                        <FileText className="h-4 w-4 mr-1" />
                        Skip — Custom Invoice
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ========== STEP 2: REVIEW & EDIT ========== */}
          {step === 'review' && (
            <div className="space-y-6">
              {/* Student summary bar */}
              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-sm">{formData.studentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formData.studentPhone && `${formData.studentPhone} · `}
                      {vehicleType ? (
                        <Badge variant="outline" className={`text-[10px] ${vehicleType === 'car' ? 'text-blue-600 border-blue-200' : 'text-orange-600 border-orange-200'}`}>
                          {vehicleType === 'car' ? 'Car' : 'Truck'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Custom</Badge>
                      )}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep('student'); setVehicleType(null) }}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Change
                </Button>
              </div>

              {/* Invoice Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Invoice Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="invoiceNumber">Invoice #</Label>
                      <Input
                        id="invoiceNumber"
                        value={invoiceNumber}
                        disabled
                        className="font-mono bg-muted"
                      />
                    </div>
                    <div>
                      <Label htmlFor="invoiceDate">Date</Label>
                      <Input
                        id="invoiceDate"
                        type="date"
                        value={formData.invoiceDate}
                        onChange={(e) => handleFieldChange('invoiceDate', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="dueDate">Due Date</Label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Line Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Quick-add from services */}
                  {allServices.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Quick Add</Label>
                      <div className="flex flex-wrap gap-2">
                        {allServices
                          .filter(s => !vehicleType || s.vehicleType === vehicleType || s.vehicleType === 'both')
                          .map((service) => (
                            <Button
                              key={service.id}
                              variant="secondary"
                              size="sm"
                              onClick={() => addServiceAsItem(service)}
                              className="text-xs"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              {service.name} (${service.price})
                            </Button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Column headers */}
                  <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                    <div className="col-span-6">Description</div>
                    <div className="col-span-2 text-center">Quantity</div>
                    <div className="col-span-3 text-right">Unit Price ($)</div>
                    <div className="col-span-1"></div>
                  </div>

                  {/* Line item rows */}
                  {lineItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-12 md:col-span-6">
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          placeholder="Description"
                        />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                          className="text-center"
                        />
                      </div>
                      <div className="col-span-6 md:col-span-3">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice || ''}
                          onChange={(e) => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="text-right"
                        />
                      </div>
                      <div className="col-span-2 md:col-span-1 flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLineItem(item.id)}
                          disabled={lineItems.length === 1}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button variant="outline" size="sm" onClick={addLineItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>

                  {/* Totals */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Checkbox
                        id="taxesEnabled"
                        checked={taxesEnabled}
                        onCheckedChange={(checked) => setTaxesEnabled(checked === true)}
                      />
                      <Label htmlFor="taxesEnabled" className="text-sm cursor-pointer">
                        Apply taxes (GST {gstRate}% + QST {qstRate}%)
                      </Label>
                    </div>

                    <div className="flex flex-col items-end space-y-1 text-sm">
                      <div className="flex justify-between w-64">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-mono">${subtotal.toFixed(2)}</span>
                      </div>
                      {taxesEnabled && (
                        <>
                          <div className="flex justify-between w-64">
                            <span className="text-muted-foreground">GST ({gstRate}%):</span>
                            <span className="font-mono">${gstAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between w-64">
                            <span className="text-muted-foreground">QST ({qstRate}%):</span>
                            <span className="font-mono">${qstAmount.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between w-64 border-t pt-2 mt-1">
                        <span className="font-bold text-base">Total:</span>
                        <span className="font-bold text-base font-mono">${total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => handleFieldChange('notes', e.target.value)}
                    placeholder="Additional notes to display on the invoice..."
                    rows={3}
                  />
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => { setStep('student'); setVehicleType(null) }}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  {!canGenerate && (
                    <p className="text-xs text-muted-foreground">
                      Add at least one line item with a price
                    </p>
                  )}
                  <Button
                    onClick={() => generateMutation.mutate()}
                    disabled={!canGenerate || generateMutation.isPending}
                    size="lg"
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Generate Invoice PDF
                  </Button>
                </div>
              </div>

              {generateMutation.isError && (
                <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
                  Error: {generateMutation.error?.message || 'Failed to generate invoice'}
                </div>
              )}
            </div>
          )}

          {/* ========== STEP 3: DONE ========== */}
          {step === 'done' && (
            <Card>
              <CardContent className="pt-8 pb-8 text-center space-y-4">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                <h3 className="text-xl font-bold">Invoice Generated!</h3>
                <p className="text-muted-foreground">
                  Invoice <span className="font-mono font-bold">{invoiceNumber}</span> for{' '}
                  <span className="font-bold">{formData.studentName}</span> has been downloaded.
                </p>
                <p className="text-lg font-bold">${total.toFixed(2)}</p>
                <div className="flex gap-3 justify-center mt-4">
                  <Button onClick={resetForm}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create Another
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
