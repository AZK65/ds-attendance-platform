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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Receipt, Plus, Trash2, Download, Loader2, Settings, CheckCircle2,
  Car, Truck, ArrowLeft, ArrowRight, FileText, Package, Mail, MessageCircle, Send,
  CreditCard, Copy, ExternalLink, Banknote, Globe, DollarSign, Clock, AlertTriangle, Printer, Link2,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { StudentSearchAutocomplete, type StudentResult, type DBStudent, type WhatsAppContact } from '@/components/StudentSearchAutocomplete'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { PDFDocument } from 'pdf-lib'

// Print helper: triplicates PDF pages for 3 copies and prints in B&W
async function printPdf3Copies(pdfBlobUrl: string) {
  const response = await fetch(pdfBlobUrl)
  const originalBytes = await response.arrayBuffer()
  const originalDoc = await PDFDocument.load(originalBytes)
  const tripleDoc = await PDFDocument.create()

  // Copy all pages 3 times
  for (let copy = 0; copy < 3; copy++) {
    const pages = await tripleDoc.copyPages(originalDoc, originalDoc.getPageIndices())
    for (const page of pages) {
      tripleDoc.addPage(page)
    }
  }

  const tripleBytes = await tripleDoc.save()
  const blob = new Blob([tripleBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  const printFrame = document.createElement('iframe')
  printFrame.style.display = 'none'
  printFrame.src = url
  document.body.appendChild(printFrame)
  printFrame.onload = () => {
    setTimeout(() => {
      printFrame.contentWindow?.print()
      setTimeout(() => {
        document.body.removeChild(printFrame)
        URL.revokeObjectURL(url)
      }, 1000)
    }, 500)
  }
}

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

type Step = 'student' | 'review' | 'payment' | 'done'

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

  // Step state
  const [step, setStep] = useState<Step>('student')
  const [vehicleType, setVehicleType] = useState<'car' | 'truck' | null>(null)
  const [selectedStudent, setSelectedStudent] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<{ name: string; totalPrice: number } | null>(null)

  // PDF blob for sending after generation + preview
  const pdfBase64Ref = useRef<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [whatsappSent, setWhatsappSent] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [paymentLinkCopied, setPaymentLinkCopied] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online' | null>(null)
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null)
  const [showCloverMatch, setShowCloverMatch] = useState(false)
  const [cloverMatching, setCloverMatching] = useState(false)
  const [cloverMatches, setCloverMatches] = useState<Array<{ orderId: string; total: number; date: string; score: string; diff: number; lineItems: Array<{ name: string; price: number; quantity: number }> }>>([])

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

  // Load packages for vehicle type selection
  const { data: packagesData, isFetched: packagesFetched } = useQuery({
    queryKey: ['invoice-packages', vehicleType],
    queryFn: async () => {
      const params = vehicleType ? `?type=${vehicleType}` : ''
      const res = await fetch(`/api/invoice/packages${params}`)
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ packages: InvoicePackage[] }>
    },
    enabled: !!vehicleType,
  })

  // Load student balance when student is selected
  const { data: balanceData } = useQuery({
    queryKey: ['student-balance', formData.studentPhone, formData.studentName],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (formData.studentPhone) params.set('phone', formData.studentPhone)
      if (formData.studentName) params.set('name', formData.studentName)
      const res = await fetch(`/api/students/balance?${params}`)
      if (!res.ok) return null
      return res.json() as Promise<{ totalInvoiced: number; totalPaid: number; openBalance: number; groupId: string | null; contactId: string | null }>
    },
    enabled: !!(formData.studentPhone || formData.studentName),
  })

  // Load student invoice history when on review step
  const { data: invoiceHistoryData } = useQuery({
    queryKey: ['student-invoice-history', formData.studentName],
    queryFn: async () => {
      const res = await fetch(`/api/invoice/list?search=${encodeURIComponent(formData.studentName)}`)
      if (!res.ok) return { invoices: [] }
      return res.json() as Promise<{ invoices: { id: string; invoiceNumber: string; invoiceDate: string; total: number; paymentStatus: string; paymentMethod: string | null }[] }>
    },
    enabled: !!formData.studentName && (step === 'review' || step === 'payment' || step === 'done'),
  })

  const allServices = allServicesData?.services || []

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
        // Tax-inclusive: price already contains taxes, extract them
        const beforeTax = lineTotal / taxMultiplier
        const gst = beforeTax * gstRate / 100
        const qst = beforeTax * qstRate / 100
        totalBeforeTax += beforeTax
        totalGst += gst
        totalQst += qst
        totalAmount += lineTotal // total stays the same as entered
      } else if (taxesEnabled) {
        // Tax-exclusive: add taxes on top
        const gst = lineTotal * gstRate / 100
        const qst = lineTotal * qstRate / 100
        totalBeforeTax += lineTotal
        totalGst += gst
        totalQst += qst
        totalAmount += lineTotal + gst + qst
      } else {
        // No taxes
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

  // Auto-fill line items when vehicle type services load
  // Only auto-advance to review if there are NO packages to show
  // Wait for BOTH queries to complete before deciding
  useEffect(() => {
    if (vehicleServicesData?.services && vehicleType && packagesFetched) {
      // If packages exist for this vehicle type, don't auto-advance (let user pick)
      const hasPackages = (packagesData?.packages || []).length > 0
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
      setStep('review')
    }
  }, [vehicleServicesData, vehicleType, packagesData, packagesFetched])

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
            // Existing open balance + this new invoice total
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

      // Create blob URL for preview (don't auto-download — user can download from preview)
      const url = URL.createObjectURL(blob)
      setPdfPreviewUrl(url)

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

  // Check if Clover is configured (server tells us via cloverConfigured flag)
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
  }

  const handleVehicleTypeSelect = (type: 'car' | 'truck') => {
    setVehicleType(type)
    // If packages exist, we'll show them in the UI below
    // Otherwise the useEffect will auto-fill services and advance to review
  }

  const handleSkipToCustom = () => {
    setLineItems([{ id: generateId(), description: '', quantity: 1, unitPrice: 0, taxInclusive: true }])
    setSelectedPackage(null)
    setStep('review')
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
    setSelectedPackage({ name: pkg.name, totalPrice: pkg.totalPrice })
    setStep('review')
  }

  const handleSelectInstalment = (pkg: InvoicePackage, inst: PackageInstalment) => {
    setLineItems([{
      id: generateId(),
      description: `${pkg.name} — ${inst.name}`,
      quantity: 1,
      unitPrice: inst.amount,
      taxInclusive: pkg.taxInclusive,
    }])
    setSelectedPackage({ name: pkg.name, totalPrice: pkg.totalPrice })
    setStep('review')
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
    setSelectedPackage(null)
    setVehicleType(null)
    pdfBase64Ref.current = null
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(null)
    setEmailSent(false)
    setWhatsappSent(false)
    setPaymentUrl(null)
    setPaymentLinkCopied(false)
    setPaymentMethod(null)
    setSavedInvoiceId(null)
    setStep('student')
  }

  const canGenerate = formData.studentName.trim() && lineItems.some(item => item.description.trim() && item.unitPrice > 0)

  // Step index helpers for the step indicator
  const stepOrder: Step[] = ['student', 'review', 'payment', 'done']
  const currentStepIndex = stepOrder.indexOf(step)
  const stepLabels = ['Student', 'Review', 'Payment', 'Done']

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center justify-between mb-8"
          >
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
          </motion.div>

          {/* Step indicator */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.25 }}
            className="flex items-center justify-center gap-0 mb-8"
          >
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center">
                {i > 0 && (
                  <div className={`w-10 h-0.5 ${currentStepIndex >= i ? 'bg-primary' : 'bg-muted'}`} />
                )}
                <button
                  className="flex flex-col items-center gap-1"
                  disabled={i >= currentStepIndex}
                  onClick={() => { if (i < currentStepIndex) setStep(stepOrder[i]) }}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    currentStepIndex === i
                      ? 'bg-primary text-primary-foreground'
                      : currentStepIndex > i
                        ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {currentStepIndex > i ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium ${
                    currentStepIndex >= i ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {label}
                  </span>
                </button>
              </div>
            ))}
          </motion.div>

          {/* ========== STEP 1: SELECT STUDENT ========== */}
          <AnimatePresence mode="wait">
          {step === 'student' && (
            <motion.div key="step-student" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-6">
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
                      onSelectWA={handleWAContactSelect}
                      placeholder="Search by name, phone, or licence number..."
                    />
                  </div>

                  {selectedStudent && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Student loaded — fields auto-filled
                      {balanceData?.groupId && balanceData?.contactId && (
                        <Link
                          href={`/groups/${balanceData.groupId}/student/${balanceData.contactId}`}
                          className="text-primary hover:underline ml-1 flex items-center gap-1"
                        >
                          View Details <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="studentName">Name *</Label>
                        {balanceData?.groupId && balanceData?.contactId && formData.studentName && (
                          <Link
                            href={`/groups/${balanceData.groupId}/student/${balanceData.contactId}`}
                            className="text-xs text-primary hover:underline flex items-center gap-0.5"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
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
                      <AddressAutocomplete
                        id="studentAddress"
                        value={formData.studentAddress}
                        onChange={(val) => handleFieldChange('studentAddress', val)}
                        onAddressSelect={(result) => {
                          if (result.city) handleFieldChange('studentCity', result.city)
                          if (result.postalCode) handleFieldChange('studentPostalCode', result.postalCode)
                        }}
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
                        className={`flex flex-col items-center gap-3 p-6 border-2 rounded-xl transition-all group ${
                          vehicleType === 'car'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-md ring-2 ring-blue-200 dark:ring-blue-800'
                            : 'hover:border-blue-500 hover:bg-blue-50/50'
                        }`}
                      >
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                          vehicleType === 'car'
                            ? 'bg-blue-200 dark:bg-blue-800'
                            : 'bg-blue-100 group-hover:bg-blue-200'
                        }`}>
                          <Car className="h-8 w-8 text-blue-600" />
                        </div>
                        <div className="text-center">
                          <h3 className="font-semibold text-lg">Car</h3>
                          <p className="text-sm text-muted-foreground">Passenger vehicle course</p>
                        </div>
                        {vehicleType === 'car' && (
                          <CheckCircle2 className="h-5 w-5 text-blue-500" />
                        )}
                      </button>

                      <button
                        onClick={() => handleVehicleTypeSelect('truck')}
                        className={`flex flex-col items-center gap-3 p-6 border-2 rounded-xl transition-all group ${
                          vehicleType === 'truck'
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950 shadow-md ring-2 ring-orange-200 dark:ring-orange-800'
                            : 'hover:border-orange-500 hover:bg-orange-50/50'
                        }`}
                      >
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                          vehicleType === 'truck'
                            ? 'bg-orange-200 dark:bg-orange-800'
                            : 'bg-orange-100 group-hover:bg-orange-200'
                        }`}>
                          <Truck className="h-8 w-8 text-orange-600" />
                        </div>
                        <div className="text-center">
                          <h3 className="font-semibold text-lg">Truck</h3>
                          <p className="text-sm text-muted-foreground">Commercial vehicle course</p>
                        </div>
                        {vehicleType === 'truck' && (
                          <CheckCircle2 className="h-5 w-5 text-orange-500" />
                        )}
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

              {/* Package Selection — shown after vehicle type is chosen and packages exist */}
              {vehicleType && (packagesData?.packages || []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Select Package
                    </CardTitle>
                    <CardDescription>Choose a package or pick an individual instalment</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className={`grid gap-4 ${packagesData!.packages.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
                      {packagesData!.packages.map(pkg => (
                        <div key={pkg.id} className="border-2 rounded-xl overflow-hidden hover:border-primary/30 transition-colors flex flex-col">
                          {/* Package header — clickable for full package */}
                          <button
                            onClick={() => handleSelectPackageFull(pkg)}
                            className="p-4 bg-muted/30 hover:bg-muted/60 transition-colors text-left border-b"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-base">{pkg.name}</h3>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {pkg.taxInclusive ? 'Tax included' : '+ tax'}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-xl font-bold font-mono">${pkg.totalPrice.toFixed(2)}</span>
                                <p className="text-xs text-primary font-medium mt-0.5">Full Package &rarr;</p>
                              </div>
                            </div>
                          </button>

                          {/* Individual instalments */}
                          {pkg.instalments.length > 0 && (
                            <div className="p-3 space-y-1.5 flex-1">
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-1">Or pick an instalment</p>
                              {pkg.instalments.map(inst => (
                                <button
                                  key={inst.id}
                                  onClick={() => handleSelectInstalment(pkg, inst)}
                                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border hover:bg-accent/50 hover:border-primary/30 transition-colors text-left"
                                >
                                  <span className="text-sm">
                                    <span className="text-muted-foreground mr-1.5">{inst.instalmentNumber}.</span>
                                    {inst.name}
                                  </span>
                                  <span className="font-mono text-sm font-medium">${inst.amount.toFixed(2)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Option to use services instead */}
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-3 border-t">
                      <span className="text-xs text-muted-foreground">Or:</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (vehicleServicesData?.services) {
                            const newItems = vehicleServicesData.services.map((s: InvoiceService) => ({
                              id: generateId(),
                              description: s.name,
                              quantity: 1,
                              unitPrice: s.price,
                              taxInclusive: s.taxInclusive,
                            }))
                            if (newItems.length > 0) setLineItems(newItems)
                          }
                          setStep('review')
                        }}
                      >
                        Use {vehicleType === 'car' ? 'Car' : 'Truck'} Services
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleSkipToCustom}>
                        Custom Invoice
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* ========== STEP 2: REVIEW & EDIT ========== */}
          {step === 'review' && (
            <motion.div key="step-review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-6">
              {/* Student summary bar */}
              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    {balanceData?.groupId && balanceData?.contactId ? (
                      <Link href={`/groups/${balanceData.groupId}/student/${balanceData.contactId}`} className="font-medium text-sm text-primary hover:underline">
                        {formData.studentName}
                      </Link>
                    ) : (
                      <p className="font-medium text-sm">{formData.studentName}</p>
                    )}
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

              {/* Balance Card — top right priority */}
              {(balanceData || selectedPackage) && (() => {
                const packageTotal = selectedPackage?.totalPrice || 0
                const previousBalance = balanceData?.openBalance || 0
                const effectiveBalance = selectedPackage ? packageTotal + previousBalance - total : previousBalance + total
                const hasBalance = effectiveBalance > 0
                return (
                  <Card className={`border-2 ${hasBalance ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : 'border-green-300 bg-green-50/50 dark:bg-green-950/20'}`}>
                    <CardContent className="pt-6 pb-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${hasBalance ? 'bg-amber-100 dark:bg-amber-900' : 'bg-green-100 dark:bg-green-900'}`}>
                            <DollarSign className={`h-7 w-7 ${hasBalance ? 'text-amber-600' : 'text-green-600'}`} />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground font-medium">
                              {selectedPackage ? 'Remaining Balance' : 'Student Balance'}
                            </p>
                            <p className={`text-3xl font-bold font-mono ${hasBalance ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                              ${effectiveBalance.toFixed(2)}
                            </p>
                            {selectedPackage && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                {selectedPackage.name}: ${packageTotal.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          {selectedPackage && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Package: </span>
                              <span className="font-mono font-medium">${packageTotal.toFixed(2)}</span>
                            </div>
                          )}
                          {balanceData && balanceData.totalInvoiced > 0 && (
                            <>
                              <div className="text-sm">
                                <span className="text-muted-foreground">Prior invoiced: </span>
                                <span className="font-mono font-medium">${balanceData.totalInvoiced.toFixed(2)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-muted-foreground">Paid: </span>
                                <span className="font-mono font-medium text-green-600">${balanceData.totalPaid.toFixed(2)}</span>
                              </div>
                            </>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            This invoice: <span className="font-mono font-bold">${total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })()}

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

              {/* Invoice History */}
              {invoiceHistoryData && invoiceHistoryData.invoices.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Invoice History
                    </CardTitle>
                    <CardDescription>Previous invoices for {formData.studentName}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {invoiceHistoryData.invoices.slice(0, 10).map(inv => (
                        <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-sm font-medium font-mono">{inv.invoiceNumber}</p>
                              <p className="text-xs text-muted-foreground">{inv.invoiceDate}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-medium">${inv.total.toFixed(2)}</span>
                            <Badge
                              variant={inv.paymentStatus === 'paid' ? 'default' : 'secondary'}
                              className={`text-[10px] ${
                                inv.paymentStatus === 'paid'
                                  ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100'
                                  : 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              {inv.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

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
            </motion.div>
          )}

          {/* ========== STEP 3: PAYMENT METHOD ========== */}
          {step === 'payment' && (
            <motion.div key="step-payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* PDF Preview — large left column */}
                {pdfPreviewUrl && (
                  <div className="lg:col-span-3">
                    <Card className="h-full">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Invoice Preview
                          </CardTitle>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const a = document.createElement('a')
                                a.href = pdfPreviewUrl
                                a.download = `invoice-${invoiceNumber}.pdf`
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => printPdf3Copies(pdfPreviewUrl)}
                              title="Print 3 copies in B&W"
                            >
                              <Printer className="h-4 w-4 mr-1" />
                              Print 3x
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <iframe
                          src={pdfPreviewUrl}
                          className="w-full rounded-lg border bg-white"
                          style={{ height: '75vh', minHeight: '600px' }}
                          title="Invoice PDF Preview"
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Right column — payment + info */}
                <div className={`${pdfPreviewUrl ? 'lg:col-span-2' : 'lg:col-span-5'} space-y-6`}>
                  <Card>
                    <CardContent className="pt-6 pb-6 text-center space-y-3">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                      <h3 className="text-lg font-bold">Invoice Generated!</h3>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-mono font-bold">{invoiceNumber}</span> for{' '}
                        {balanceData?.groupId && balanceData?.contactId ? (
                          <Link href={`/groups/${balanceData.groupId}/student/${balanceData.contactId}`} className="font-bold text-primary hover:underline">{formData.studentName}</Link>
                        ) : (
                          <span className="font-bold">{formData.studentName}</span>
                        )}
                      </p>
                      <p className="text-2xl font-bold">${total.toFixed(2)}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Payment Method
                      </CardTitle>
                      <CardDescription>How will the student pay?</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-3">
                        {/* Cash */}
                        <button
                          className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-md text-left ${
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
                          <Banknote className="h-8 w-8 text-green-600 shrink-0" />
                          <div>
                            <p className="font-semibold">Cash</p>
                            <p className="text-xs text-muted-foreground">Paid in cash</p>
                          </div>
                        </button>

                        {/* Credit/Debit In-Person */}
                        <button
                          className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-md text-left ${
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
                            // Show Clover match dialog if configured, otherwise go to done
                            if (cloverConfigured && savedInvoiceId) {
                              setShowCloverMatch(true)
                              setCloverMatching(true)
                              try {
                                const res = await fetch('/api/invoice/clover/match', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ invoiceId: savedInvoiceId }),
                                })
                                if (res.ok) {
                                  const data = await res.json()
                                  setCloverMatches(data.matches || [])
                                }
                              } catch { /* non-fatal */ }
                              setCloverMatching(false)
                            } else {
                              setStep('done')
                            }
                          }}
                        >
                          <CreditCard className="h-8 w-8 text-blue-600 shrink-0" />
                          <div>
                            <p className="font-semibold">Credit / Debit</p>
                            <p className="text-xs text-muted-foreground">Paid at terminal</p>
                          </div>
                        </button>

                        {/* Online Payment */}
                        <button
                          className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-md text-left ${
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
                          <Globe className="h-8 w-8 text-purple-600 shrink-0" />
                          <div>
                            <p className="font-semibold">Online</p>
                            <p className="text-xs text-muted-foreground">Send payment link</p>
                          </div>
                        </button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setStep('review')}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back to Review
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setStep('done')}>
                      Skip — decide later
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ========== STEP 4: DONE ========== */}
          {step === 'done' && (
            <motion.div key="step-done" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* PDF Preview — large left column */}
                {pdfPreviewUrl && (
                  <div className="lg:col-span-3">
                    <Card className="h-full">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Invoice Preview
                          </CardTitle>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const a = document.createElement('a')
                                a.href = pdfPreviewUrl
                                a.download = `invoice-${invoiceNumber}.pdf`
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => printPdf3Copies(pdfPreviewUrl)}
                              title="Print 3 copies in B&W"
                            >
                              <Printer className="h-4 w-4 mr-1" />
                              Print 3x
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <iframe
                          src={pdfPreviewUrl}
                          className="w-full rounded-lg border bg-white"
                          style={{ height: '75vh', minHeight: '600px' }}
                          title="Invoice PDF Preview"
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Right column — status + send + create another */}
                <div className={`${pdfPreviewUrl ? 'lg:col-span-2' : 'lg:col-span-5'} space-y-6`}>
                  <Card>
                    <CardContent className="pt-6 pb-6 text-center space-y-3">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                      <h3 className="text-lg font-bold">
                        {paymentMethod === 'cash' || paymentMethod === 'card' ? 'Invoice Paid!' : 'Invoice Generated!'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-mono font-bold">{invoiceNumber}</span> for{' '}
                        {balanceData?.groupId && balanceData?.contactId ? (
                          <Link href={`/groups/${balanceData.groupId}/student/${balanceData.contactId}`} className="font-bold text-primary hover:underline">{formData.studentName}</Link>
                        ) : (
                          <span className="font-bold">{formData.studentName}</span>
                        )}
                        {paymentMethod === 'cash' && ' — paid in cash'}
                        {paymentMethod === 'card' && ' — paid by card'}
                        {paymentMethod === 'online' && ' — payment link sent'}
                        {!paymentMethod && ''}
                      </p>
                      <p className="text-2xl font-bold">${total.toFixed(2)}</p>
                    </CardContent>
                  </Card>

                  {/* Send Options */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Send className="h-5 w-5" />
                        Send Invoice
                      </CardTitle>
                      <CardDescription>Send directly to the student</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Email */}
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <Mail className="h-5 w-5 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Email</p>
                          {formData.studentEmail ? (
                            <p className="text-xs text-muted-foreground truncate">{formData.studentEmail}</p>
                          ) : (
                            <p className="text-xs text-amber-600">No email on file</p>
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
                              <Mail className="h-4 w-4" />
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
                          <p className="text-sm font-medium">WhatsApp</p>
                          {formData.studentPhone ? (
                            <p className="text-xs text-muted-foreground truncate">{formData.studentPhone}</p>
                          ) : (
                            <p className="text-xs text-amber-600">No phone on file</p>
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
                              <MessageCircle className="h-4 w-4" />
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
                              <p className="text-sm font-medium">Payment Link</p>
                              {paymentUrl ? (
                                <p className="text-xs text-muted-foreground truncate">{paymentUrl}</p>
                              ) : (
                                <p className="text-xs text-muted-foreground">Clover payment link</p>
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
                                  <CreditCard className="h-4 w-4" />
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
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </main>

      {/* Clover Match Dialog */}
      <Dialog open={showCloverMatch} onOpenChange={(open) => { if (!open) { setShowCloverMatch(false); setStep('done') } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Match Clover Transaction
            </DialogTitle>
            <DialogDescription>
              Select a Clover transaction to link to this invoice, or skip.
            </DialogDescription>
          </DialogHeader>

          {cloverMatching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Searching Clover transactions...</span>
            </div>
          ) : cloverMatches.length > 0 ? (
            <div className="space-y-2">
              {cloverMatches.map((match) => (
                <button
                  key={match.orderId}
                  className={`w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors ${
                    match.score === 'exact' ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20' :
                    match.score === 'close' ? 'border-blue-200' : 'border-border'
                  }`}
                  onClick={async () => {
                    if (savedInvoiceId) {
                      await fetch('/api/invoice/clover/match', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ invoiceId: savedInvoiceId, cloverOrderId: match.orderId }),
                      })
                    }
                    setShowCloverMatch(false)
                    setStep('done')
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">${match.total.toFixed(2)}</span>
                      {match.score === 'exact' && (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">Exact Match</Badge>
                      )}
                      {match.score === 'close' && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">Close (${match.diff.toFixed(2)} diff)</Badge>
                      )}
                      {match.score === 'partial' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">${match.diff.toFixed(2)} diff</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{match.date}</span>
                  </div>
                  {match.lineItems.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate">
                      {match.lineItems.map(li => li.name).join(', ')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No matching Clover transactions found
            </div>
          )}

          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => { setShowCloverMatch(false); setStep('done') }}>
              Skip
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
