'use client'

import { useState, useMemo, useEffect, useRef, Suspense } from 'react'
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
  Car, Truck, FileText, Package, Mail, MessageCircle, Send,
  CreditCard, Copy, ExternalLink, Banknote, Globe, ChevronDown, ChevronUp,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { StudentSearchAutocomplete, type StudentResult, type DBStudent, type WhatsAppContact } from '@/components/StudentSearchAutocomplete'

// Types
interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  taxInclusive: boolean
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
  taxInclusive: boolean
}

interface PackageInstalment {
  id: string
  instalmentNumber: number
  name: string
  amount: number
}

interface InvoicePackage {
  id: string
  name: string
  vehicleType: string
  totalPrice: number
  taxInclusive: boolean
  instalments: PackageInstalment[]
}

type Step = 'form' | 'payment' | 'done'

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

export default function InvoicePageWrapper() {
  return (
    <Suspense>
      <InvoicePage />
    </Suspense>
  )
}

function InvoicePage() {
  const queryClient = useQueryClient()
  const today = formatDateForInput(new Date())
  const thirtyDaysLater = formatDateForInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

  // Step state — simplified to just form | payment | done
  const [step, setStep] = useState<Step>('form')
  const [vehicleType, setVehicleType] = useState<'car' | 'truck' | null>(null)
  const [showStudentDetails, setShowStudentDetails] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState(false)

  // PDF blob for sending after generation
  const pdfBase64Ref = useRef<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [whatsappSent, setWhatsappSent] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [paymentLinkCopied, setPaymentLinkCopied] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online' | null>(null)
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null)

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
    { id: generateId(), description: '', quantity: 1, unitPrice: 0, taxInclusive: true },
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

  // Load all services
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

  // Load packages for vehicle type selection
  const { data: packagesData } = useQuery({
    queryKey: ['invoice-packages', vehicleType],
    queryFn: async () => {
      const params = vehicleType ? `?type=${vehicleType}` : ''
      const res = await fetch(`/api/invoice/packages${params}`)
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ packages: InvoicePackage[] }>
    },
    enabled: !!vehicleType,
  })

  const allServices = allServicesData?.services || []
  const packages = packagesData?.packages || []

  // Derived values
  const invoicePrefix = settings?.invoicePrefix || 'INV'
  const nextNumber = settings?.nextInvoiceNumber || 1
  const invoiceNumber = `${invoicePrefix}-${String(nextNumber).padStart(4, '0')}`
  const gstRate = settings?.defaultGstRate ?? 5.0
  const qstRate = settings?.defaultQstRate ?? 9.975

  // Computed totals — handles tax-inclusive and tax-exclusive items
  const { subtotal, gstAmount, qstAmount, total } = useMemo(() => {
    const taxMultiplier = 1 + gstRate / 100 + qstRate / 100

    let totalBeforeTax = 0
    let totalGst = 0
    let totalQst = 0
    let totalAmount = 0

    for (const item of lineItems) {
      const lineTotal = Math.round(item.quantity * item.unitPrice * 100) / 100

      if (taxesEnabled && item.taxInclusive) {
        const beforeTax = lineTotal / taxMultiplier
        const gst = beforeTax * gstRate / 100
        const qst = beforeTax * qstRate / 100
        totalBeforeTax += beforeTax
        totalGst += gst
        totalQst += qst
        totalAmount += lineTotal
      } else if (taxesEnabled) {
        const gst = lineTotal * gstRate / 100
        const qst = lineTotal * qstRate / 100
        totalBeforeTax += lineTotal
        totalGst += gst
        totalQst += qst
        totalAmount += lineTotal + gst + qst
      } else {
        totalBeforeTax += lineTotal
        totalAmount += lineTotal
      }
    }

    return {
      subtotal: Math.round(totalBeforeTax * 100) / 100,
      gstAmount: Math.round(totalGst * 100) / 100,
      qstAmount: Math.round(totalQst * 100) / 100,
      total: Math.round(totalAmount * 100) / 100,
    }
  }, [lineItems, taxesEnabled, gstRate, qstRate])

  // When vehicle type is selected and services load — auto-fill line items
  // (only when there are no packages — otherwise user picks a package)
  useEffect(() => {
    if (vehicleServicesData?.services && vehicleType) {
      const hasPackages = packages.length > 0
      if (hasPackages) return

      const newItems = vehicleServicesData.services.map((s: InvoiceService) => ({
        id: generateId(),
        description: s.name,
        quantity: 1,
        unitPrice: s.price,
        taxInclusive: s.taxInclusive,
      }))
      if (newItems.length > 0) {
        setLineItems(newItems)
      }
    }
  }, [vehicleServicesData, vehicleType, packages.length])

  // PDF generation mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      // Fetch existing balance so we can show remaining balance on PDF
      let remainingBalance = 0
      try {
        const balanceParams = new URLSearchParams()
        if (formData.studentPhone) balanceParams.set('phone', formData.studentPhone)
        if (formData.studentName) balanceParams.set('name', formData.studentName)
        if (balanceParams.toString()) {
          const balRes = await fetch(`/api/students/balance?${balanceParams}`)
          if (balRes.ok) {
            const balData = await balRes.json()
            remainingBalance = (balData.openBalance || 0) + total
          }
        }
      } catch { /* non-fatal */ }

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
        remainingBalance,
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
    onSuccess: async (blob) => {
      // Store base64 for email/WhatsApp sending
      const arrayBuffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      pdfBase64Ref.current = btoa(binary)

      // Download the PDF
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${invoiceNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setEmailSent(false)
      setWhatsappSent(false)
      setPaymentMethod(null)
      setStep('payment')
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-settings'] })
      if (data?.invoice?.id) {
        setSavedInvoiceId(data.invoice.id)
      }
    },
  })

  // Email send mutation
  const emailMutation = useMutation({
    mutationFn: async () => {
      if (!pdfBase64Ref.current) throw new Error('No PDF generated')
      if (!formData.studentEmail) throw new Error('No student email address')
      const res = await fetch('/api/invoice/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: formData.studentEmail,
          studentName: formData.studentName,
          invoiceNumber,
          pdfBase64: pdfBase64Ref.current,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send email')
      }
      return res.json()
    },
    onSuccess: () => {
      setEmailSent(true)
    },
  })

  // WhatsApp send mutation
  const whatsappMutation = useMutation({
    mutationFn: async () => {
      if (!pdfBase64Ref.current) throw new Error('No PDF generated')
      if (!formData.studentPhone) throw new Error('No student phone number')
      const res = await fetch('/api/invoice/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.studentPhone,
          studentName: formData.studentName,
          invoiceNumber,
          pdfBase64: pdfBase64Ref.current,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send via WhatsApp')
      }
      return res.json()
    },
    onSuccess: () => {
      setWhatsappSent(true)
    },
  })

  // Check if Clover is configured
  const cloverConfigured = !!settings?.cloverConfigured

  const paymentLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/invoice/clover/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: formData.studentName,
          studentEmail: formData.studentEmail,
          lineItems: lineItems.map(li => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
          })),
          total,
          invoiceNumber,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create payment link')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setPaymentUrl(data.paymentUrl)
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
    setShowStudentDetails(false)
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
    setShowStudentDetails(false)
  }

  const handleWAContactSelect = (contact: WhatsAppContact) => {
    setFormData(prev => ({
      ...prev,
      studentName: contact.name || contact.pushName || '',
      studentPhone: contact.phone || '',
      studentAddress: '',
      studentCity: '',
      studentProvince: 'QC',
      studentPostalCode: '',
      studentEmail: '',
    }))
    setSelectedStudent(true)
    setShowStudentDetails(false)
  }

  const handleVehicleTypeSelect = (type: 'car' | 'truck') => {
    if (vehicleType === type) {
      // Deselect
      setVehicleType(null)
      setLineItems([{ id: generateId(), description: '', quantity: 1, unitPrice: 0, taxInclusive: true }])
      return
    }
    setVehicleType(type)
  }

  const handleSelectPackageFull = (pkg: InvoicePackage) => {
    const items = pkg.instalments.map(inst => ({
      id: generateId(),
      description: `${pkg.name} — ${inst.name}`,
      quantity: 1,
      unitPrice: inst.amount,
      taxInclusive: pkg.taxInclusive,
    }))
    if (items.length > 0) {
      setLineItems(items)
    }
  }

  const handleSelectInstalment = (pkg: InvoicePackage, inst: PackageInstalment) => {
    setLineItems([{
      id: generateId(),
      description: `${pkg.name} — ${inst.name}`,
      quantity: 1,
      unitPrice: inst.amount,
      taxInclusive: pkg.taxInclusive,
    }])
  }

  const addLineItem = () => {
    setLineItems(prev => [...prev, { id: generateId(), description: '', quantity: 1, unitPrice: 0, taxInclusive: true }])
  }

  const addServiceAsItem = (service: InvoiceService) => {
    setLineItems(prev => [...prev, { id: generateId(), description: service.name, quantity: 1, unitPrice: service.price, taxInclusive: service.taxInclusive }])
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number | boolean) => {
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
    setLineItems([{ id: generateId(), description: '', quantity: 1, unitPrice: 0, taxInclusive: true }])
    setSelectedStudent(false)
    setShowStudentDetails(false)
    setVehicleType(null)
    pdfBase64Ref.current = null
    setEmailSent(false)
    setWhatsappSent(false)
    setPaymentUrl(null)
    setPaymentLinkCopied(false)
    setPaymentMethod(null)
    setSavedInvoiceId(null)
    setStep('form')
  }

  const canGenerate = formData.studentName.trim() && lineItems.some(item => item.description.trim() && item.unitPrice > 0)

  // Filtered services for quick-add
  const filteredServices = allServices.filter(
    s => !vehicleType || s.vehicleType === vehicleType || s.vehicleType === 'both'
  )

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
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
              <Link href="/invoice/history">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-1" />
                  History
                </Button>
              </Link>
              <Link href="/invoice/packages">
                <Button variant="outline" size="sm">
                  <Package className="h-4 w-4 mr-1" />
                  Packages
                </Button>
              </Link>
              <Link href="/invoice/services">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-1" />
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

          {/* ========== MAIN FORM (single page) ========== */}
          {step === 'form' && (
            <div className="space-y-5">
              {/* Student Search + Info */}
              <Card>
                <CardContent className="pt-5 space-y-4">
                  {/* Search */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Student</Label>
                    <StudentSearchAutocomplete
                      onSelect={handleStudentSelect}
                      onSelectDB={handleDBStudentSelect}
                      onSelectWA={handleWAContactSelect}
                      placeholder="Search by name, phone, or licence number..."
                    />
                  </div>

                  {/* Student name + phone inline (always visible) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="studentName" className="text-xs">Name *</Label>
                      <Input
                        id="studentName"
                        value={formData.studentName}
                        onChange={(e) => handleFieldChange('studentName', e.target.value)}
                        placeholder="Student name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="studentPhone" className="text-xs">Phone</Label>
                      <Input
                        id="studentPhone"
                        value={formData.studentPhone}
                        onChange={(e) => handleFieldChange('studentPhone', e.target.value)}
                        placeholder="(514) 555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="studentEmail" className="text-xs">Email</Label>
                      <Input
                        id="studentEmail"
                        type="email"
                        value={formData.studentEmail}
                        onChange={(e) => handleFieldChange('studentEmail', e.target.value)}
                        placeholder="student@email.com"
                      />
                    </div>
                  </div>

                  {/* Collapsible address details */}
                  <button
                    type="button"
                    onClick={() => setShowStudentDetails(!showStudentDetails)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showStudentDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showStudentDetails ? 'Hide' : 'Show'} address details
                    {(formData.studentAddress || formData.studentCity) && !showStudentDetails && (
                      <span className="text-green-600 ml-1">(filled)</span>
                    )}
                  </button>

                  {showStudentDetails && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label htmlFor="studentAddress" className="text-xs">Address</Label>
                        <Input
                          id="studentAddress"
                          value={formData.studentAddress}
                          onChange={(e) => handleFieldChange('studentAddress', e.target.value)}
                          placeholder="123 Street"
                        />
                      </div>
                      <div>
                        <Label htmlFor="studentCity" className="text-xs">City</Label>
                        <Input
                          id="studentCity"
                          value={formData.studentCity}
                          onChange={(e) => handleFieldChange('studentCity', e.target.value)}
                          placeholder="Montréal"
                        />
                      </div>
                      <div>
                        <Label htmlFor="studentProvince" className="text-xs">Province</Label>
                        <Input
                          id="studentProvince"
                          value={formData.studentProvince}
                          onChange={(e) => handleFieldChange('studentProvince', e.target.value)}
                          placeholder="QC"
                        />
                      </div>
                      <div>
                        <Label htmlFor="studentPostalCode" className="text-xs">Postal Code</Label>
                        <Input
                          id="studentPostalCode"
                          value={formData.studentPostalCode}
                          onChange={(e) => handleFieldChange('studentPostalCode', e.target.value)}
                          placeholder="H3N 1S2"
                        />
                      </div>
                    </div>
                  )}

                  {selectedStudent && (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Student info loaded
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Vehicle Type + Packages/Services (compact inline picker) */}
              <Card>
                <CardContent className="pt-5 space-y-4">
                  {/* Vehicle type toggle */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Course Type</Label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleVehicleTypeSelect('car')}
                        className={`flex items-center gap-2.5 px-4 py-2.5 border-2 rounded-lg transition-all ${
                          vehicleType === 'car'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                            : 'border-muted hover:border-blue-300'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                          vehicleType === 'car' ? 'bg-blue-200 dark:bg-blue-800' : 'bg-blue-100 dark:bg-blue-900/50'
                        }`}>
                          <Car className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-sm">Car</p>
                          <p className="text-[10px] text-muted-foreground">Passenger vehicle</p>
                        </div>
                        {vehicleType === 'car' && <CheckCircle2 className="h-4 w-4 text-blue-500 ml-1" />}
                      </button>

                      <button
                        onClick={() => handleVehicleTypeSelect('truck')}
                        className={`flex items-center gap-2.5 px-4 py-2.5 border-2 rounded-lg transition-all ${
                          vehicleType === 'truck'
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950 shadow-sm'
                            : 'border-muted hover:border-orange-300'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                          vehicleType === 'truck' ? 'bg-orange-200 dark:bg-orange-800' : 'bg-orange-100 dark:bg-orange-900/50'
                        }`}>
                          <Truck className="h-5 w-5 text-orange-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-sm">Truck</p>
                          <p className="text-[10px] text-muted-foreground">Commercial vehicle</p>
                        </div>
                        {vehicleType === 'truck' && <CheckCircle2 className="h-4 w-4 text-orange-500 ml-1" />}
                      </button>
                    </div>
                  </div>

                  {/* Packages — shown when vehicle type selected and packages exist */}
                  {vehicleType && packages.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Packages</Label>
                      <div className="space-y-3">
                        {packages.map(pkg => (
                          <div key={pkg.id} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium text-sm">{pkg.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ${pkg.totalPrice.toFixed(2)} {pkg.taxInclusive ? '(tax incl.)' : '(+tax)'}
                                </span>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => handleSelectPackageFull(pkg)} className="text-xs h-7">
                                <Package className="h-3 w-3 mr-1" />
                                Full Package
                              </Button>
                            </div>

                            {pkg.instalments.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {pkg.instalments.map(inst => (
                                  <button
                                    key={inst.id}
                                    onClick={() => handleSelectInstalment(pkg, inst)}
                                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs hover:bg-accent/50 hover:border-primary/30 transition-colors"
                                  >
                                    <span className="text-muted-foreground">{inst.instalmentNumber}.</span>
                                    <span>{inst.name}</span>
                                    <span className="font-mono font-medium">${inst.amount.toFixed(2)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick-add services */}
                  {filteredServices.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Quick Add Services</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {filteredServices.map((service) => (
                          <Button
                            key={service.id}
                            variant="secondary"
                            size="sm"
                            onClick={() => addServiceAsItem(service)}
                            className="text-xs h-7"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {service.name} (${service.price})
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Line Items + Totals */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Line Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Column headers */}
                  <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-1 text-center">Qty</div>
                    <div className="col-span-3 text-right">Unit Price ($)</div>
                    <div className="col-span-2 text-center">Tax</div>
                    <div className="col-span-1"></div>
                  </div>

                  {/* Line item rows */}
                  {lineItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-12 md:col-span-5">
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          placeholder="Description"
                        />
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                          className="text-center"
                        />
                      </div>
                      <div className="col-span-5 md:col-span-3">
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
                      <div className="col-span-2 md:col-span-2 flex items-center justify-center gap-1">
                        <Checkbox
                          id={`tax-incl-${item.id}`}
                          checked={item.taxInclusive}
                          onCheckedChange={(checked) => updateLineItem(item.id, 'taxInclusive', checked === true)}
                        />
                        <Label htmlFor={`tax-incl-${item.id}`} className="text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                          {item.taxInclusive ? 'Incl.' : '+Tax'}
                        </Label>
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
                    <div className="flex items-center gap-2 mb-3">
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

              {/* Invoice Details + Notes (compact row) */}
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="invoiceNumber" className="text-xs">Invoice #</Label>
                      <Input
                        id="invoiceNumber"
                        value={invoiceNumber}
                        disabled
                        className="font-mono bg-muted"
                      />
                    </div>
                    <div>
                      <Label htmlFor="invoiceDate" className="text-xs">Date</Label>
                      <Input
                        id="invoiceDate"
                        type="date"
                        value={formData.invoiceDate}
                        onChange={(e) => handleFieldChange('invoiceDate', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="dueDate" className="text-xs">Due Date</Label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="notes" className="text-xs">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => handleFieldChange('notes', e.target.value)}
                      placeholder="Additional notes for the invoice..."
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Generate Button */}
              <div className="flex justify-end items-center gap-3">
                {!canGenerate && (
                  <p className="text-xs text-muted-foreground">
                    Enter a student name and at least one line item
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
                  Generate Invoice
                </Button>
              </div>

              {generateMutation.isError && (
                <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
                  Error: {generateMutation.error?.message || 'Failed to generate invoice'}
                </div>
              )}
            </div>
          )}

          {/* ========== PAYMENT & SEND ========== */}
          {step === 'payment' && (
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-8 pb-8 text-center space-y-4">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                  <h3 className="text-xl font-bold">Invoice Generated!</h3>
                  <p className="text-muted-foreground">
                    Invoice <span className="font-mono font-bold">{invoiceNumber}</span> for{' '}
                    <span className="font-bold">{formData.studentName}</span> has been downloaded.
                  </p>
                  <p className="text-lg font-bold">${total.toFixed(2)}</p>
                </CardContent>
              </Card>

              {/* Payment Method */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Payment Method
                  </CardTitle>
                  <CardDescription>How will the student pay for this invoice?</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all hover:shadow-md ${
                        paymentMethod === 'cash'
                          ? 'border-green-500 bg-green-50 dark:bg-green-950'
                          : 'border-muted hover:border-green-300'
                      }`}
                      onClick={async () => {
                        setPaymentMethod('cash')
                        if (savedInvoiceId) {
                          await fetch('/api/invoice/update-payment', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ invoiceId: savedInvoiceId, paymentMethod: 'cash', paymentStatus: 'paid' }),
                          })
                        }
                        setStep('done')
                      }}
                    >
                      <Banknote className="h-10 w-10 text-green-600" />
                      <div className="text-center">
                        <p className="font-semibold">Cash</p>
                        <p className="text-xs text-muted-foreground">Paid in cash</p>
                      </div>
                    </button>

                    <button
                      className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all hover:shadow-md ${
                        paymentMethod === 'card'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                          : 'border-muted hover:border-blue-300'
                      }`}
                      onClick={async () => {
                        setPaymentMethod('card')
                        if (savedInvoiceId) {
                          await fetch('/api/invoice/update-payment', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ invoiceId: savedInvoiceId, paymentMethod: 'card', paymentStatus: 'paid' }),
                          })
                        }
                        setStep('done')
                      }}
                    >
                      <CreditCard className="h-10 w-10 text-blue-600" />
                      <div className="text-center">
                        <p className="font-semibold">Credit / Debit</p>
                        <p className="text-xs text-muted-foreground">Paid at terminal</p>
                      </div>
                    </button>

                    <button
                      className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all hover:shadow-md ${
                        paymentMethod === 'online'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                          : 'border-muted hover:border-purple-300'
                      }`}
                      onClick={async () => {
                        setPaymentMethod('online')
                        if (savedInvoiceId) {
                          await fetch('/api/invoice/update-payment', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ invoiceId: savedInvoiceId, paymentMethod: 'online', paymentStatus: 'unpaid' }),
                          })
                        }
                        if (cloverConfigured) {
                          paymentLinkMutation.mutate()
                        }
                        setStep('done')
                      }}
                    >
                      <Globe className="h-10 w-10 text-purple-600" />
                      <div className="text-center">
                        <p className="font-semibold">Online</p>
                        <p className="text-xs text-muted-foreground">Send payment link</p>
                      </div>
                    </button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setStep('done')}>
                  Skip — decide later
                </Button>
              </div>
            </div>
          )}

          {/* ========== DONE ========== */}
          {step === 'done' && (
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-8 pb-8 text-center space-y-4">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                  <h3 className="text-xl font-bold">
                    {paymentMethod === 'cash' || paymentMethod === 'card' ? 'Invoice Paid!' : 'Invoice Generated!'}
                  </h3>
                  <p className="text-muted-foreground">
                    Invoice <span className="font-mono font-bold">{invoiceNumber}</span> for{' '}
                    <span className="font-bold">{formData.studentName}</span>
                    {paymentMethod === 'cash' && ' — paid in cash'}
                    {paymentMethod === 'card' && ' — paid by card'}
                    {paymentMethod === 'online' && ' — payment link sent'}
                    {!paymentMethod && ' has been downloaded'}
                  </p>
                  <p className="text-lg font-bold">${total.toFixed(2)}</p>
                </CardContent>
              </Card>

              {/* Send Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Send Invoice
                  </CardTitle>
                  <CardDescription>Send the invoice directly to the student</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Email */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <Mail className="h-5 w-5 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Send via Email</p>
                      {formData.studentEmail ? (
                        <p className="text-xs text-muted-foreground truncate">{formData.studentEmail}</p>
                      ) : (
                        <p className="text-xs text-amber-600">No email address on file</p>
                      )}
                    </div>
                    {emailSent ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Sent
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => emailMutation.mutate()}
                        disabled={!formData.studentEmail || emailMutation.isPending}
                      >
                        {emailMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Mail className="h-4 w-4 mr-1" />
                            Send
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  {emailMutation.isError && (
                    <p className="text-xs text-destructive ml-8">
                      {emailMutation.error?.message || 'Failed to send email'}
                    </p>
                  )}

                  {/* WhatsApp */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <MessageCircle className="h-5 w-5 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Send via WhatsApp</p>
                      {formData.studentPhone ? (
                        <p className="text-xs text-muted-foreground truncate">{formData.studentPhone}</p>
                      ) : (
                        <p className="text-xs text-amber-600">No phone number on file</p>
                      )}
                    </div>
                    {whatsappSent ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Sent
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => whatsappMutation.mutate()}
                        disabled={!formData.studentPhone || whatsappMutation.isPending}
                      >
                        {whatsappMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <MessageCircle className="h-4 w-4 mr-1" />
                            Send
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  {whatsappMutation.isError && (
                    <p className="text-xs text-destructive ml-8">
                      {whatsappMutation.error?.message || 'Failed to send via WhatsApp'}
                    </p>
                  )}

                  {/* Clover Payment Link */}
                  {cloverConfigured && (
                    <>
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <CreditCard className="h-5 w-5 text-purple-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Clover Payment Link</p>
                          {paymentUrl ? (
                            <p className="text-xs text-muted-foreground truncate">{paymentUrl}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Generate a payment link for the student</p>
                          )}
                        </div>
                        {paymentUrl ? (
                          <div className="flex gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(paymentUrl)
                                setPaymentLinkCopied(true)
                                setTimeout(() => setPaymentLinkCopied(false), 2000)
                              }}
                            >
                              {paymentLinkCopied ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(paymentUrl, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => paymentLinkMutation.mutate()}
                            disabled={paymentLinkMutation.isPending}
                          >
                            {paymentLinkMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CreditCard className="h-4 w-4 mr-1" />
                                Generate
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      {paymentLinkMutation.isError && (
                        <p className="text-xs text-destructive ml-8">
                          {paymentLinkMutation.error?.message || 'Failed to create payment link'}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="flex gap-3 justify-center">
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Another
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
