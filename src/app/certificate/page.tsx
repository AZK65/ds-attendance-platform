'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Upload, FileText, Download, Loader2, Camera, ArrowLeft, ArrowRight, CheckCircle2, Edit3, Settings, Plus, Smartphone, X, Users, User, AlertCircle, Archive, Search, Database, CheckCircle, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PhoneCameraUpload } from '@/components/PhoneCameraUpload'
import { StudentSearchAutocomplete, DBStudent } from '@/components/StudentSearchAutocomplete'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'

// ─── Shared Types ────────────────────────────────────────────────────────────

interface ExtractedData {
  licenceNumber: string
  name: string
  address: string
  contractNumber: string
  phone: string
  registrationDate: string
  expiryDate: string
  module1Date: string
  module2Date: string
  module3Date: string
  module4Date: string
  module5Date: string
  module6Date: string
  sortie1Date: string
  sortie2Date: string
  module7Date: string
  sortie3Date: string
  sortie4Date: string
  module8Date: string
  sortie5Date: string
  sortie6Date: string
  module9Date: string
  sortie7Date: string
  sortie8Date: string
  module10Date: string
  sortie9Date: string
  sortie10Date: string
  module11Date: string
  sortie11Date: string
  sortie12Date: string
  sortie13Date: string
  module12Date: string
  sortie14Date: string
  sortie15Date: string
}

interface CertificateFormData extends ExtractedData {
  attestationNumber: string
  municipality: string
  province: string
  postalCode: string
  phoneAlt: string
  schoolName: string
  schoolAddress: string
  schoolCity: string
  schoolProvince: string
  schoolPostalCode: string
  schoolNumber: string
  certificateType: 'phase1' | 'full'
}

const initialFormData: CertificateFormData = {
  licenceNumber: '',
  name: '',
  address: '',
  contractNumber: '',
  attestationNumber: '',
  phone: '',
  registrationDate: '',
  expiryDate: '',
  municipality: 'Montreal',
  province: 'QC',
  postalCode: '',
  phoneAlt: '',
  schoolName: '',
  schoolAddress: '',
  schoolCity: '',
  schoolProvince: '',
  schoolPostalCode: '',
  schoolNumber: '',
  module1Date: '',
  module2Date: '',
  module3Date: '',
  module4Date: '',
  module5Date: '',
  module6Date: '',
  sortie1Date: '',
  sortie2Date: '',
  module7Date: '',
  sortie3Date: '',
  sortie4Date: '',
  module8Date: '',
  sortie5Date: '',
  sortie6Date: '',
  module9Date: '',
  sortie7Date: '',
  sortie8Date: '',
  module10Date: '',
  sortie9Date: '',
  sortie10Date: '',
  module11Date: '',
  sortie11Date: '',
  sortie12Date: '',
  sortie13Date: '',
  module12Date: '',
  sortie14Date: '',
  sortie15Date: '',
  certificateType: 'full'
}

type Step = 'upload-docs' | 'review' | 'download'
type UploadMode = 'separate' | 'combined'
type PageMode = 'single' | 'bulk' | 'database'
type BulkStep = 'select' | 'processing' | 'review' | 'download'

interface BulkStudent {
  id: string
  source: 'database' | 'ocr'
  student?: DBStudent
  formData: CertificateFormData
  ocrImage?: string
  ocrProcessing?: boolean
  ocrError?: string
  pdfBlob?: Blob
  datesFetched?: boolean
  fileName?: string
}

const STEP_ORDER: Step[] = ['upload-docs', 'review', 'download']

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function compressImage(file: File, maxWidth: number = 2000, quality: number = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Failed to get canvas context')); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = event.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// ─── Review Form Component (shared by single + bulk) ────────────────────────

function ReviewForm({
  formData,
  onChange,
  showCertType = true,
}: {
  formData: CertificateFormData
  onChange: (field: keyof CertificateFormData, value: string) => void
  showCertType?: boolean
}) {
  const [waStatus, setWaStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'error'>('idle')

  const checkWhatsApp = useCallback(async (phone: string) => {
    const cleaned = phone.replace(/[^0-9]/g, '')
    if (cleaned.length < 10) { setWaStatus('idle'); return }
    setWaStatus('checking')
    try {
      const res = await fetch(`/api/whatsapp/check-number?phone=${encodeURIComponent(cleaned)}`)
      if (!res.ok) { setWaStatus('error'); return }
      const data = await res.json()
      setWaStatus(data.registered ? 'valid' : 'invalid')
    } catch { setWaStatus('error') }
  }, [])

  // Auto-check WhatsApp when phone number changes (debounced)
  const waDebounceRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    const cleaned = formData.phone.replace(/[^0-9]/g, '')
    if (cleaned.length < 10) { setWaStatus('idle'); return }
    if (waDebounceRef.current) clearTimeout(waDebounceRef.current)
    waDebounceRef.current = setTimeout(() => {
      checkWhatsApp(formData.phone)
    }, 600)
    return () => { if (waDebounceRef.current) clearTimeout(waDebounceRef.current) }
  }, [formData.phone, checkWhatsApp])

  return (
    <div className="space-y-6">
      {showCertType && (
        <Card>
          <CardHeader><CardTitle>Certificate Type</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button variant={formData.certificateType === 'phase1' ? 'default' : 'outline'} onClick={() => onChange('certificateType', 'phase1')} className="flex-1">
                Phase 1 Only <Badge variant="secondary" className="ml-2">5 modules</Badge>
              </Button>
              <Button variant={formData.certificateType === 'full' ? 'default' : 'outline'} onClick={() => onChange('certificateType', 'full')} className="flex-1">
                Full Course <Badge variant="secondary" className="ml-2">12 + 15</Badge>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Edit3 className="h-5 w-5" /> Student Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Full Name (Last, First)</Label>
              <Input value={formData.name} onChange={(e) => onChange('name', e.target.value)} placeholder="Lastname, Firstname" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <AddressAutocomplete
                value={formData.address}
                onChange={val => onChange('address', val)}
                onAddressSelect={result => {
                  if (result.city) onChange('municipality', result.city)
                  if (result.postalCode) onChange('postalCode', result.postalCode)
                }}
                placeholder="123 Street Name"
              />
            </div>
            <div>
              <Label>Municipality</Label>
              <Input value={formData.municipality} onChange={(e) => onChange('municipality', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Province</Label>
                <Input value={formData.province} onChange={(e) => onChange('province', e.target.value)} />
              </div>
              <div>
                <Label>Postal Code</Label>
                <Input value={formData.postalCode} onChange={(e) => onChange('postalCode', e.target.value)} placeholder="H1N 1K4" />
              </div>
            </div>
            <div>
              <Label>Contract #</Label>
              <Input value={formData.contractNumber} onChange={(e) => onChange('contractNumber', e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => onChange('phone', e.target.value)}
              />
              {waStatus === 'checking' && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking WhatsApp...
                </p>
              )}
              {waStatus === 'valid' && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> On WhatsApp
                </p>
              )}
              {waStatus === 'invalid' && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Not on WhatsApp
                </p>
              )}
              {waStatus === 'error' && (
                <p className="text-xs text-muted-foreground mt-1">WhatsApp not connected</p>
              )}
            </div>
            <div className="col-span-2">
              <Label>Driver&apos;s Licence Number</Label>
              <Input value={formData.licenceNumber} onChange={(e) => onChange('licenceNumber', e.target.value)} placeholder="N1326100391 07" className="font-mono" />
            </div>
            <div>
              <Label>Registration Date</Label>
              <Input type="date" value={formData.registrationDate} onChange={(e) => onChange('registrationDate', e.target.value)} />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={formData.expiryDate} onChange={(e) => onChange('expiryDate', e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Attestation Number (for Barcode)</Label>
              <Input value={formData.attestationNumber} onChange={(e) => onChange('attestationNumber', e.target.value)} placeholder="M23662011870" className="font-mono" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phase 1 - Theory Modules</CardTitle>
          <CardDescription>M1-M5: The Vehicle, Driver, Environment, At-Risk Behaviours, Evaluation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {(['module1Date', 'module2Date', 'module3Date', 'module4Date', 'module5Date'] as const).map((field, idx) => (
              <div key={field}>
                <Label className="text-xs">M{idx + 1}</Label>
                <Input type="date" value={formData[field]} onChange={(e) => onChange(field, e.target.value)} className="text-xs px-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {formData.certificateType === 'full' && (
        <>
          <Card>
            <CardHeader><CardTitle>Phase 2</CardTitle><CardDescription>M6 (Accompanied Driving) + In-Car Sessions 1-4</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  ['M6', 'module6Date'], ['Session 1', 'sortie1Date'], ['Session 2', 'sortie2Date'],
                  ['M7', 'module7Date'], ['Session 3', 'sortie3Date'], ['Session 4', 'sortie4Date'],
                ].map(([label, field]) => (
                  <div key={field}>
                    <Label className="text-xs">{label}</Label>
                    <Input type="date" value={formData[field as keyof CertificateFormData] as string} onChange={(e) => onChange(field as keyof CertificateFormData, e.target.value)} className="text-xs px-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Phase 3</CardTitle><CardDescription>M8 (Speed), M9 (Sharing Road), M10 (Alcohol/Drugs) + Sessions 5-10</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  ['M8', 'module8Date'], ['Session 5', 'sortie5Date'], ['Session 6', 'sortie6Date'],
                  ['M9', 'module9Date'], ['Session 7', 'sortie7Date'], ['Session 8', 'sortie8Date'],
                  ['M10', 'module10Date'], ['Session 9', 'sortie9Date'], ['Session 10', 'sortie10Date'],
                ].map(([label, field]) => (
                  <div key={field}>
                    <Label className="text-xs">{label}</Label>
                    <Input type="date" value={formData[field as keyof CertificateFormData] as string} onChange={(e) => onChange(field as keyof CertificateFormData, e.target.value)} className="text-xs px-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Phase 4</CardTitle><CardDescription>M11 (Fatigue), M12 (Eco-driving) + Sessions 11-15</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  ['M11', 'module11Date'], ['Session 11', 'sortie11Date'], ['Session 12', 'sortie12Date'],
                  ['Session 13', 'sortie13Date'], ['M12', 'module12Date'], ['Session 14', 'sortie14Date'],
                  ['Session 15', 'sortie15Date'],
                ].map(([label, field]) => (
                  <div key={field}>
                    <Label className="text-xs">{label}</Label>
                    <Input type="date" value={formData[field as keyof CertificateFormData] as string} onChange={(e) => onChange(field as keyof CertificateFormData, e.target.value)} className="text-xs px-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function CertificatePage() {
  const [pageMode, setPageMode] = useState<PageMode>('single')

  // ─── Single Mode State ──────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('upload-docs')
  const [direction, setDirection] = useState(1)

  const navigateStep = (newStep: Step) => {
    const oldIdx = STEP_ORDER.indexOf(step)
    const newIdx = STEP_ORDER.indexOf(newStep)
    setDirection(newIdx >= oldIdx ? 1 : -1)
    setStep(newStep)
  }

  const [uploadMode, setUploadMode] = useState<UploadMode>('combined')
  const [templatePdf, setTemplatePdf] = useState<string | null>(null)
  const [licenceImage, setLicenceImage] = useState<string | null>(null)
  const [attendanceImage, setAttendanceImage] = useState<string | null>(null)
  const [combinedImage, setCombinedImage] = useState<string | null>(null)
  const [formData, setFormData] = useState<CertificateFormData>(initialFormData)
  const [isProcessing, setIsProcessing] = useState(false)
  const [phoneCameraTarget, setPhoneCameraTarget] = useState<'combined' | 'licence' | 'attendance' | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [singleSearchQuery, setSingleSearchQuery] = useState('')
  const [singleSearchResults, setSingleSearchResults] = useState<DBStudent[]>([])
  const [singleSearching, setSingleSearching] = useState(false)
  const finalFormDataRef = useRef<CertificateFormData>(initialFormData)

  // ─── Bulk Mode State ────────────────────────────────────────────────────
  const [bulkStep, setBulkStep] = useState<BulkStep>('select')
  const [bulkStudents, setBulkStudents] = useState<BulkStudent[]>([])
  const [bulkCertType, setBulkCertType] = useState<'phase1' | 'full'>('full')
  const [bulkSearchQuery, setBulkSearchQuery] = useState('')
  const [bulkSearchResults, setBulkSearchResults] = useState<DBStudent[]>([])
  const [bulkSearching, setBulkSearching] = useState(false)
  const [processingIndex, setProcessingIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('0')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateIndex, setGenerateIndex] = useState(0)

  // ─── Database Mode State ────────────────────────────────────────────────
  const [dbSearchQuery, setDbSearchQuery] = useState('')
  const [dbSearchResults, setDbSearchResults] = useState<DBStudent[]>([])
  const [dbSearching, setDbSearching] = useState(false)
  const [dbSelectedStudent, setDbSelectedStudent] = useState<DBStudent | null>(null)
  const [dbStep, setDbStep] = useState<'search' | 'scan' | 'review' | 'download'>('search')
  const [dbFormData, setDbFormData] = useState<CertificateFormData>(initialFormData)
  const [dbUploadMode, setDbUploadMode] = useState<UploadMode>('combined')
  const [dbLicenceImage, setDbLicenceImage] = useState<string | null>(null)
  const [dbAttendanceImage, setDbAttendanceImage] = useState<string | null>(null)
  const [dbCombinedImage, setDbCombinedImage] = useState<string | null>(null)
  const [dbProcessing, setDbProcessing] = useState(false)
  const [dbPhoneCameraTarget, setDbPhoneCameraTarget] = useState<'combined' | 'licence' | 'attendance' | null>(null)

  // ─── Shared Queries ─────────────────────────────────────────────────────
  const { data: templateStatus } = useQuery({
    queryKey: ['certificate-template'],
    queryFn: async () => {
      const res = await fetch('/api/certificate/template')
      if (res.status === 404) return { exists: false, template: null }
      if (!res.ok) throw new Error('Failed to check template')
      return res.json() as Promise<{ exists: boolean; template: string | null }>
    }
  })

  useEffect(() => {
    if (templateStatus?.exists && templateStatus?.template) {
      setTemplatePdf(templateStatus.template)
    }
  }, [templateStatus])

  // ─── Single Mode Mutations ──────────────────────────────────────────────

  const ocrMutation = useMutation({
    mutationFn: async ({ licenceImage, attendanceImage, combinedImage }: { licenceImage: string | null, attendanceImage: string | null, combinedImage: string | null }) => {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceImage, attendanceImage, combinedImage })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || errorData.details || 'OCR failed')
      }
      return res.json() as Promise<ExtractedData>
    },
    onSuccess: (data) => {
      const hasData = data.name || data.licenceNumber || data.module1Date
      if (!hasData) console.warn('OCR completed but no data extracted')
      setFormData(prev => ({ ...prev, ...data }))
      navigateStep('review')
    }
  })

  // Save student mutation (fire-and-forget after PDF generation)
  const saveStudentMutation = useMutation({
    mutationFn: async (data: CertificateFormData) => {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        console.error('Failed to save student data')
      }
      return res.json()
    },
  })

  // PDF generation mutation
  const pdfMutation = useMutation({
    mutationFn: async (data: CertificateFormData & { templatePdf: string }) => {
      const res = await fetch('/api/certificate/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('PDF generation failed')
      return res.blob()
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate-${formData.name || 'student'}-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Save student + certificate record to database (non-blocking)
      saveStudentMutation.mutate(finalFormDataRef.current)
    }
  })

  // ─── Single Mode Search ────────────────────────────────────────────────

  const mergeSearchResults = (data: {
    students?: DBStudent[]
    localStudents?: { id: string; name: string; phone: string; licenceNumber: string; address?: string; municipality?: string; postalCode?: string }[]
    whatsappContacts?: { id: string; phone: string; name: string | null; pushName: string | null; groupName: string | null; groupId: string | null }[]
  }): DBStudent[] => {
    const results: DBStudent[] = [...(data.students || [])]
    const seenPhones = new Set(results.map(s => s.phone_number).filter(Boolean))

    // Add local students (SQLite)
    for (const ls of (data.localStudents || [])) {
      if (ls.phone && seenPhones.has(ls.phone)) continue
      if (ls.phone) seenPhones.add(ls.phone)
      results.push({
        student_id: parseInt(ls.id) || Date.now(),
        full_name: ls.name || '',
        permit_number: ls.licenceNumber || '',
        full_address: ls.address || '',
        city: ls.municipality || '',
        postal_code: ls.postalCode || '',
        phone_number: ls.phone || '',
        email: '',
        contract_number: 0,
        dob: '',
        status: 'local',
        user_defined_contract_number: null,
      })
    }

    // Add WhatsApp contacts
    for (const wc of (data.whatsappContacts || [])) {
      if (wc.phone && seenPhones.has(wc.phone)) continue
      if (wc.phone) seenPhones.add(wc.phone)
      results.push({
        student_id: parseInt(wc.id.replace(/\D/g, '').slice(-9)) || Date.now(),
        full_name: wc.name || wc.pushName || '',
        permit_number: '',
        full_address: '',
        city: '',
        postal_code: '',
        phone_number: wc.phone || '',
        email: '',
        contract_number: 0,
        dob: '',
        status: 'whatsapp',
        user_defined_contract_number: null,
      })
    }

    return results
  }

  const handleSingleSearch = useCallback(async () => {
    if (singleSearchQuery.length < 2) return
    setSingleSearching(true)
    try {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(singleSearchQuery)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setSingleSearchResults(mergeSearchResults(data))
    } catch { setSingleSearchResults([]) }
    finally { setSingleSearching(false) }
  }, [singleSearchQuery])

  // Auto-search as user types
  useEffect(() => {
    if (singleSearchQuery.length < 2) { setSingleSearchResults([]); return }
    const timer = setTimeout(() => handleSingleSearch(), 300)
    return () => clearTimeout(timer)
  }, [singleSearchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSingleSelectStudent = async (student: DBStudent) => {
    setSelectedStudentId(String(student.student_id))
    setSingleSearchResults([])

    const nameParts = student.full_name.trim().split(/\s+/)
    let formattedName = student.full_name
    if (nameParts.length >= 2) {
      const lastName = nameParts[0]
      const firstName = nameParts.slice(1).join(' ')
      formattedName = `${lastName}, ${firstName}`
    }

    const attestationRaw = String(student.contract_number || '')
    const formattedAttestation = attestationRaw ? attestationRaw.split('').join('  ') : ''

    const baseData: CertificateFormData = {
      ...initialFormData,
      name: formattedName,
      licenceNumber: student.permit_number || '',
      address: student.full_address || '',
      municipality: student.city || 'Montreal',
      province: 'QC',
      postalCode: student.postal_code || '',
      phone: student.phone_number || '',
      contractNumber: String(student.user_defined_contract_number || ''),
      attestationNumber: formattedAttestation,
    }

    setFormData(baseData)

    // Fetch dates from local SQLite (saved from previous generations), Teamup + Zoom in parallel
    try {
      const phone = student.phone_number || ''
      const name = student.full_name || ''
      const params = new URLSearchParams()
      if (phone) params.set('phone', phone)
      if (name) params.set('studentName', name)

      const [eventsRes, theoryRes, profileRes] = await Promise.all([
        fetch(`/api/scheduling/student-events?${params}`).catch(() => null),
        fetch(`/api/scheduling/student-theory?${params}`).catch(() => null),
        fetch(`/api/students/profile?${params}`).catch(() => null),
      ])

      const dates: Record<string, string> = {}
      const certOverrides: Record<string, string> = {}

      // First: load saved dates from local SQLite (lowest priority — will be overridden by Teamup/Zoom)
      if (profileRes?.ok) {
        const profile = await profileRes.json()
        if (profile.localStudent) {
          const s = profile.localStudent
          const dateFields = [
            'module1Date', 'module2Date', 'module3Date', 'module4Date', 'module5Date',
            'module6Date', 'module7Date', 'module8Date', 'module9Date', 'module10Date',
            'module11Date', 'module12Date',
            'sortie1Date', 'sortie2Date', 'sortie3Date', 'sortie4Date', 'sortie5Date',
            'sortie6Date', 'sortie7Date', 'sortie8Date', 'sortie9Date', 'sortie10Date',
            'sortie11Date', 'sortie12Date', 'sortie13Date', 'sortie14Date', 'sortie15Date',
            'registrationDate', 'expiryDate',
          ]
          for (const field of dateFields) {
            if (s[field]) dates[field] = s[field]
          }

          // Override MySQL numbers with SQLite certificate numbers (the real assigned ones)
          if (s.certificates && s.certificates.length > 0) {
            const latestCert = s.certificates[s.certificates.length - 1]
            if (latestCert.contractNumber) {
              certOverrides.contractNumber = String(latestCert.contractNumber)
            }
            if (latestCert.attestationNumber) {
              const attNum = String(latestCert.attestationNumber)
              certOverrides.attestationNumber = attNum.includes('  ') ? attNum : attNum.split('').join('  ')
            }
          }
        }
      }

      // Second: Zoom theory dates (higher priority — override saved dates)
      if (theoryRes?.ok) {
        const theoryData: { moduleNumber: number; date: string }[] = await theoryRes.json()
        for (const tc of theoryData) {
          const d = new Date(tc.date)
          const dateStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`
          if (tc.moduleNumber >= 1 && tc.moduleNumber <= 12) dates[`module${tc.moduleNumber}Date`] = dateStr
        }
      }

      // Third: Teamup calendar events (highest priority — override everything)
      if (eventsRes?.ok) {
        const events: { id: string; title: string; start_dt: string }[] = await eventsRes.json()
        const now = new Date()
        for (const event of events) {
          if (new Date(event.start_dt) >= now) continue
          const parts = event.title.split(' - ')
          const first = parts[0]?.trim() || ''
          const sMatch = first.match(/^Session (\d+)$/)
          const mMatch = first.match(/^M(\d+)$/)
          const moduleMatch = first.match(/^Module (\d+)$/)
          const eventDate = new Date(event.start_dt)
          const dateStr = `${(eventDate.getMonth() + 1).toString().padStart(2, '0')}/${eventDate.getDate().toString().padStart(2, '0')}/${eventDate.getFullYear()}`

          if (sMatch) { const n = parseInt(sMatch[1]); if (n >= 1 && n <= 15) dates[`sortie${n}Date`] = dateStr }
          else if (mMatch) { const n = parseInt(mMatch[1]); if (n >= 1 && n <= 12 && !dates[`module${n}Date`]) dates[`module${n}Date`] = dateStr }
          else if (moduleMatch) { const n = parseInt(moduleMatch[1]); if (n >= 1 && n <= 12 && !dates[`module${n}Date`]) dates[`module${n}Date`] = dateStr }
        }
      }

      if (Object.keys(dates).length > 0 || Object.keys(certOverrides).length > 0) {
        setFormData(prev => ({ ...prev, ...dates, ...certOverrides }))
      }
    } catch { /* non-critical */ }
  }

  // ─── Single Mode Handlers ──────────────────────────────────────────────

  const handleImageUpload = (type: 'licence' | 'attendance' | 'combined') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressedBase64 = await compressImage(file, 2500, 0.85)
      if (type === 'licence') setLicenceImage(compressedBase64)
      else if (type === 'attendance') setAttendanceImage(compressedBase64)
      else setCombinedImage(compressedBase64)
    } catch (error) {
      console.error('Image compression failed:', error)
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        if (type === 'licence') setLicenceImage(base64)
        else if (type === 'attendance') setAttendanceImage(base64)
        else setCombinedImage(base64)
      }
      reader.readAsDataURL(file)
    }
  }

  const handlePhoneCameraCapture = (base64: string) => {
    if (!phoneCameraTarget) return
    if (phoneCameraTarget === 'licence') setLicenceImage(base64)
    else if (phoneCameraTarget === 'attendance') setAttendanceImage(base64)
    else setCombinedImage(base64)
  }

  const handleProcessImages = async () => {
    if (uploadMode === 'combined') {
      if (!combinedImage) return
      setIsProcessing(true)
      try { await ocrMutation.mutateAsync({ licenceImage: null, attendanceImage: null, combinedImage }) }
      finally { setIsProcessing(false) }
    } else {
      if (!licenceImage && !attendanceImage) return
      setIsProcessing(true)
      try { await ocrMutation.mutateAsync({ licenceImage, attendanceImage, combinedImage: null }) }
      finally { setIsProcessing(false) }
    }
  }

  const handleInputChange = (field: keyof CertificateFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleGeneratePDF = async () => {
    if (!templatePdf) return
    let finalFormData = { ...formData }

    // Check if student already has contract/attestation numbers (editing existing cert)
    const hasExistingContract = finalFormData.contractNumber.replace(/\s/g, '').length > 0
    const hasExistingAttestation = finalFormData.attestationNumber.replace(/\s/g, '').length > 0

    try {
      if (hasExistingContract && hasExistingAttestation) {
        // Reuse existing numbers — only fetch school info without incrementing
        const settingsRes = await fetch('/api/certificate/settings')
        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          finalFormData = {
            ...finalFormData,
            schoolName: settings.schoolName || '',
            schoolAddress: settings.schoolAddress || '',
            schoolCity: settings.schoolCity || '',
            schoolProvince: settings.schoolProvince || '',
            schoolPostalCode: settings.schoolPostalCode || '',
            schoolNumber: settings.schoolNumber || '',
          }
        }
      } else {
        // New certificate — get next numbers (increments counters)
        const res = await fetch('/api/certificate/next-number', { method: 'POST' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to get certificate numbers' }))
          alert(err.error || 'Failed to get certificate numbers from settings')
          return
        }
        const numbers = await res.json()
        const attestationStr = String(numbers.attestationNumber)
        const formattedAttestation = attestationStr.split('').join('  ')
        finalFormData = {
          ...finalFormData,
          contractNumber: finalFormData.contractNumber || String(numbers.contractNumber),
          attestationNumber: hasExistingAttestation ? finalFormData.attestationNumber : formattedAttestation,
          schoolName: numbers.schoolName || '',
          schoolAddress: numbers.schoolAddress || '',
          schoolCity: numbers.schoolCity || '',
          schoolProvince: numbers.schoolProvince || '',
          schoolPostalCode: numbers.schoolPostalCode || '',
          schoolNumber: numbers.schoolNumber || '',
        }
      }
    } catch (error) {
      console.error('Error fetching next numbers:', error)
      alert('Failed to get certificate numbers. Check settings.')
      return
    }

    // Capture final form data in ref for the save mutation (avoids React state timing issues)
    finalFormDataRef.current = finalFormData
    pdfMutation.mutate({ ...finalFormData, templatePdf })
    navigateStep('download')
  }

  const canProceedToReview = uploadMode === 'combined' ? combinedImage : (licenceImage || attendanceImage)

  // ─── Bulk Mode Handlers ────────────────────────────────────────────────

  // ─── Bulk Mode: Search & Add from Database ─────────────────────────────

  const handleBulkSearch = useCallback(async (query?: string) => {
    const searchTerm = query ?? bulkSearchQuery
    if (searchTerm.length < 2) { setBulkSearchResults([]); return }
    setBulkSearching(true)
    try {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(searchTerm)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setBulkSearchResults(mergeSearchResults(data))
    } catch { setBulkSearchResults([]) }
    finally { setBulkSearching(false) }
  }, [bulkSearchQuery])

  useEffect(() => {
    if (bulkSearchQuery.length < 2) { setBulkSearchResults([]); return }
    const timer = setTimeout(() => handleBulkSearch(bulkSearchQuery), 300)
    return () => clearTimeout(timer)
  }, [bulkSearchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBulkAddStudent = async (student: DBStudent) => {
    // Don't add duplicates
    if (bulkStudents.some(bs => bs.student?.student_id === student.student_id)) return
    setBulkSearchResults([])
    setBulkSearchQuery('')

    const nameParts = student.full_name.trim().split(/\s+/)
    let formattedName = student.full_name
    if (nameParts.length >= 2) {
      const lastName = nameParts[0]
      const firstName = nameParts.slice(1).join(' ')
      formattedName = `${lastName}, ${firstName}`
    }

    const attestationRaw = String(student.contract_number || '')
    const formattedAttestation = attestationRaw ? attestationRaw.split('').join('  ') : ''

    const baseData: CertificateFormData = {
      ...initialFormData,
      name: formattedName,
      licenceNumber: student.permit_number || '',
      address: student.full_address || '',
      municipality: student.city || 'Montreal',
      province: 'QC',
      postalCode: student.postal_code || '',
      phone: student.phone_number || '',
      contractNumber: String(student.user_defined_contract_number || ''),
      attestationNumber: formattedAttestation,
      certificateType: bulkCertType,
    }

    const newEntry: BulkStudent = {
      id: `bulk-${Date.now()}-${student.student_id}`,
      source: 'database',
      student,
      formData: baseData,
      datesFetched: false,
    }

    setBulkStudents(prev => [...prev, newEntry])

    // Fetch dates in background
    try {
      const phone = student.phone_number || ''
      const name = student.full_name || ''
      const params = new URLSearchParams()
      if (phone) params.set('phone', phone)
      if (name) params.set('studentName', name)

      const [eventsRes, theoryRes, profileRes] = await Promise.all([
        fetch(`/api/scheduling/student-events?${params}`).catch(() => null),
        fetch(`/api/scheduling/student-theory?${params}`).catch(() => null),
        fetch(`/api/students/profile?${params}`).catch(() => null),
      ])

      const dates: Record<string, string> = {}
      let certOverrides: Record<string, string> = {}

      // Check for existing certificate numbers in SQLite (override MySQL numbers)
      if (profileRes?.ok) {
        const profile = await profileRes.json()
        if (profile.localStudent?.certificates?.length > 0) {
          const latestCert = profile.localStudent.certificates[profile.localStudent.certificates.length - 1]
          if (latestCert.contractNumber) {
            certOverrides.contractNumber = String(latestCert.contractNumber)
          }
          if (latestCert.attestationNumber) {
            const attNum = String(latestCert.attestationNumber)
            certOverrides.attestationNumber = attNum.includes('  ') ? attNum : attNum.split('').join('  ')
          }
        }
      }

      if (theoryRes?.ok) {
        const theoryData: { moduleNumber: number; date: string }[] = await theoryRes.json()
        for (const tc of theoryData) {
          const d = new Date(tc.date)
          const dateStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`
          if (tc.moduleNumber >= 1 && tc.moduleNumber <= 12) dates[`module${tc.moduleNumber}Date`] = dateStr
        }
      }

      if (eventsRes?.ok) {
        const events: { id: string; title: string; start_dt: string }[] = await eventsRes.json()
        const now = new Date()
        for (const event of events) {
          if (new Date(event.start_dt) >= now) continue
          const parts = event.title.split(' - ')
          const first = parts[0]?.trim() || ''
          const sMatch = first.match(/^Session (\d+)$/)
          const mMatch = first.match(/^M(\d+)$/)
          const moduleMatch = first.match(/^Module (\d+)$/)
          const eventDate = new Date(event.start_dt)
          const dateStr = `${(eventDate.getMonth() + 1).toString().padStart(2, '0')}/${eventDate.getDate().toString().padStart(2, '0')}/${eventDate.getFullYear()}`

          if (sMatch) { const n = parseInt(sMatch[1]); if (n >= 1 && n <= 15) dates[`sortie${n}Date`] = dateStr }
          else if (mMatch) { const n = parseInt(mMatch[1]); if (n >= 1 && n <= 12 && !dates[`module${n}Date`]) dates[`module${n}Date`] = dateStr }
          else if (moduleMatch) { const n = parseInt(moduleMatch[1]); if (n >= 1 && n <= 12 && !dates[`module${n}Date`]) dates[`module${n}Date`] = dateStr }
        }
      }

      setBulkStudents(prev => prev.map(bs =>
        bs.id === newEntry.id
          ? { ...bs, formData: { ...bs.formData, ...dates, ...certOverrides }, datesFetched: true }
          : bs
      ))
    } catch {
      setBulkStudents(prev => prev.map(bs =>
        bs.id === newEntry.id ? { ...bs, datesFetched: true } : bs
      ))
    }
  }

  // ─── Bulk Mode: OCR Image Upload ─────────────────────────────────────

  const handleBulkImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const newEntries: BulkStudent[] = []
    for (let i = 0; i < files.length; i++) {
      let imageData: string
      try {
        imageData = await compressImage(files[i], 2500, 0.85)
      } catch {
        imageData = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target?.result as string)
          reader.readAsDataURL(files[i])
        })
      }
      newEntries.push({
        id: `ocr-${Date.now()}-${i}`,
        source: 'ocr',
        formData: { ...initialFormData, certificateType: bulkCertType },
        ocrImage: imageData,
        fileName: files[i].name,
      })
    }
    setBulkStudents(prev => [...prev, ...newEntries])
    e.target.value = ''
  }

  const removeBulkStudent = (id: string) => {
    setBulkStudents(prev => prev.filter(bs => bs.id !== id))
  }

  // ─── Bulk Mode: Process OCR entries ──────────────────────────────────

  const handleBulkProcess = useCallback(async () => {
    const ocrEntries = bulkStudents.filter(bs => bs.source === 'ocr' && bs.ocrImage && !bs.datesFetched)
    if (ocrEntries.length === 0) {
      // No OCR to process, skip to review
      setActiveTab('0')
      setBulkStep('review')
      return
    }

    setBulkStep('processing')
    for (let i = 0; i < ocrEntries.length; i++) {
      setProcessingIndex(i)
      const entry = ocrEntries[i]
      try {
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenceImage: null, attendanceImage: null, combinedImage: entry.ocrImage })
        })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'OCR failed' }))
          setBulkStudents(prev => prev.map(bs =>
            bs.id === entry.id ? { ...bs, ocrError: errorData.error || 'OCR failed', datesFetched: true } : bs
          ))
          continue
        }
        const data: ExtractedData = await res.json()
        setBulkStudents(prev => prev.map(bs =>
          bs.id === entry.id ? { ...bs, formData: { ...bs.formData, ...data }, datesFetched: true } : bs
        ))
      } catch (err) {
        setBulkStudents(prev => prev.map(bs =>
          bs.id === entry.id ? { ...bs, ocrError: err instanceof Error ? err.message : 'OCR failed', datesFetched: true } : bs
        ))
      }
    }
    setActiveTab('0')
    setBulkStep('review')
  }, [bulkStudents])

  const handleBulkFieldChange = (index: number, field: keyof CertificateFormData, value: string) => {
    setBulkStudents(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], formData: { ...updated[index].formData, [field]: value } }
      return updated
    })
  }

  // ─── Bulk Mode: Per-student OCR for missing dates (in review step) ───

  const handleBulkStudentOcrUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    let imageData: string
    try {
      imageData = await compressImage(file, 2500, 0.85)
    } catch {
      imageData = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (ev) => resolve(ev.target?.result as string)
        reader.readAsDataURL(file)
      })
    }
    setBulkStudents(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ocrImage: imageData }
      return updated
    })
    e.target.value = ''
  }

  const handleBulkStudentOcrProcess = async (index: number) => {
    const student = bulkStudents[index]
    if (!student?.ocrImage) return

    setBulkStudents(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ocrProcessing: true, ocrError: undefined }
      return updated
    })

    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceImage: null, attendanceImage: null, combinedImage: student.ocrImage })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'OCR failed' }))
        throw new Error(errorData.error || 'OCR failed')
      }
      const ocrData: ExtractedData = await res.json()

      // Merge OCR dates — only fill in empty date fields
      setBulkStudents(prev => {
        const updated = [...prev]
        const fd = { ...updated[index].formData }
        const dateFields = [
          'module1Date', 'module2Date', 'module3Date', 'module4Date', 'module5Date', 'module6Date',
          'module7Date', 'module8Date', 'module9Date', 'module10Date', 'module11Date', 'module12Date',
          'sortie1Date', 'sortie2Date', 'sortie3Date', 'sortie4Date', 'sortie5Date', 'sortie6Date',
          'sortie7Date', 'sortie8Date', 'sortie9Date', 'sortie10Date', 'sortie11Date', 'sortie12Date',
          'sortie13Date', 'sortie14Date', 'sortie15Date',
          'registrationDate', 'expiryDate',
        ] as const
        for (const field of dateFields) {
          if (ocrData[field] && !fd[field]) {
            fd[field] = ocrData[field]
          }
        }
        updated[index] = { ...updated[index], formData: fd, ocrProcessing: false }
        return updated
      })
    } catch (err) {
      setBulkStudents(prev => {
        const updated = [...prev]
        updated[index] = { ...updated[index], ocrProcessing: false, ocrError: err instanceof Error ? err.message : 'OCR failed' }
        return updated
      })
    }
  }

  // ─── Bulk Mode: Generate & Download ──────────────────────────────────

  const handleBulkGenerate = useCallback(async () => {
    if (!templateStatus?.template) return
    setIsGenerating(true)
    const updatedStudents = [...bulkStudents]

    for (let i = 0; i < updatedStudents.length; i++) {
      setGenerateIndex(i)

      let finalFormData = { ...updatedStudents[i].formData }

      // If student has attestation from DB, use school settings only
      // Otherwise, auto-increment numbers
      const hasAttestation = finalFormData.attestationNumber.replace(/\s/g, '').length > 0
      try {
        if (hasAttestation) {
          const settingsRes = await fetch('/api/certificate/settings')
          if (settingsRes.ok) {
            const settings = await settingsRes.json()
            finalFormData = {
              ...finalFormData,
              schoolName: settings.schoolName || '',
              schoolAddress: settings.schoolAddress || '',
              schoolCity: settings.schoolCity || '',
              schoolProvince: settings.schoolProvince || '',
              schoolPostalCode: settings.schoolPostalCode || '',
              schoolNumber: settings.schoolNumber || '',
            }
          }
        } else {
          const numRes = await fetch('/api/certificate/next-number', { method: 'POST' })
          if (numRes.ok) {
            const numbers = await numRes.json()
            const attestationStr = String(numbers.attestationNumber)
            finalFormData = {
              ...finalFormData,
              contractNumber: finalFormData.contractNumber || String(numbers.contractNumber),
              attestationNumber: attestationStr.split('').join('  '),
              schoolName: numbers.schoolName || '',
              schoolAddress: numbers.schoolAddress || '',
              schoolCity: numbers.schoolCity || '',
              schoolProvince: numbers.schoolProvince || '',
              schoolPostalCode: numbers.schoolPostalCode || '',
              schoolNumber: numbers.schoolNumber || '',
            }
          }
        }
      } catch { /* continue */ }

      try {
        const res = await fetch('/api/certificate/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...finalFormData, templatePdf: templateStatus.template })
        })
        if (!res.ok) throw new Error('PDF generation failed')
        updatedStudents[i] = { ...updatedStudents[i], pdfBlob: await res.blob() }
      } catch {
        updatedStudents[i] = { ...updatedStudents[i], ocrError: 'PDF generation failed' }
      }
    }

    setBulkStudents(updatedStudents)
    setIsGenerating(false)
    setBulkStep('download')
  }, [bulkStudents, templateStatus])

  const handleDownloadZip = useCallback(async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    bulkStudents.forEach((bs, index) => {
      if (bs.pdfBlob) {
        const name = bs.formData.name ? bs.formData.name.replace(/[^a-zA-Z0-9À-ÿ\s,-]/g, '').trim() : `student-${index + 1}`
        zip.file(`${name}.pdf`, bs.pdfBlob)
      }
    })
    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = `certificates-${new Date().toISOString().split('T')[0]}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [bulkStudents])

  const handleDownloadSingle = (index: number) => {
    const bs = bulkStudents[index]
    if (!bs?.pdfBlob) return
    const url = URL.createObjectURL(bs.pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `certificate-${bs.formData.name || `student-${index + 1}`}-${new Date().toISOString().split('T')[0]}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ─── Database Mode Handlers ──────────────────────────────────────────────

  const handleDbSearch = useCallback(async (query?: string) => {
    const searchTerm = query ?? dbSearchQuery
    if (searchTerm.length < 2) {
      setDbSearchResults([])
      return
    }
    setDbSearching(true)
    try {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(searchTerm)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setDbSearchResults(mergeSearchResults(data))
    } catch (err) {
      console.error('Student search error:', err)
      setDbSearchResults([])
    } finally {
      setDbSearching(false)
    }
  }, [dbSearchQuery])

  // Auto-search as user types (debounced)
  useEffect(() => {
    if (dbSearchQuery.length < 2) {
      setDbSearchResults([])
      return
    }
    const timer = setTimeout(() => {
      handleDbSearch(dbSearchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [dbSearchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDbSelectStudent = async (student: DBStudent) => {
    setDbSelectedStudent(student)
    // Parse the name: database has "First Last" format, certificate needs "Last, First"
    const nameParts = student.full_name.trim().split(/\s+/)
    let formattedName = student.full_name
    if (nameParts.length >= 2) {
      const lastName = nameParts[0]
      const firstName = nameParts.slice(1).join(' ')
      formattedName = `${lastName}, ${firstName}`
    }

    // contract_number in DB = attestation number (barcode)
    // user_defined_contract_number in DB = contract number (school's internal #)
    const attestationRaw = String(student.contract_number || '')
    const formattedAttestation = attestationRaw ? attestationRaw.split('').join('  ') : ''

    const baseData = {
      ...initialFormData,
      name: formattedName,
      licenceNumber: student.permit_number || '',
      address: student.full_address || '',
      municipality: student.city || 'Montreal',
      province: 'QC',
      postalCode: student.postal_code || '',
      phone: student.phone_number || '',
      contractNumber: String(student.user_defined_contract_number || ''),
      attestationNumber: formattedAttestation,
    }

    setDbFormData(baseData)

    // Fetch dates from local SQLite (saved), Teamup events + Zoom theory classes in parallel
    try {
      const phone = student.phone_number || ''
      const name = student.full_name || ''
      const params = new URLSearchParams()
      if (phone) params.set('phone', phone)
      if (name) params.set('studentName', name)

      const [eventsRes, theoryRes, profileRes] = await Promise.all([
        fetch(`/api/scheduling/student-events?${params}`).catch(() => null),
        fetch(`/api/scheduling/student-theory?${params}`).catch(() => null),
        fetch(`/api/students/profile?${params}`).catch(() => null),
      ])

      const dates: Record<string, string> = {}

      // First: load saved dates from local SQLite (lowest priority — will be overridden by Teamup/Zoom)
      if (profileRes?.ok) {
        const profile = await profileRes.json()
        if (profile.localStudent) {
          const s = profile.localStudent
          const dateFields = [
            'module1Date', 'module2Date', 'module3Date', 'module4Date', 'module5Date',
            'module6Date', 'module7Date', 'module8Date', 'module9Date', 'module10Date',
            'module11Date', 'module12Date',
            'sortie1Date', 'sortie2Date', 'sortie3Date', 'sortie4Date', 'sortie5Date',
            'sortie6Date', 'sortie7Date', 'sortie8Date', 'sortie9Date', 'sortie10Date',
            'sortie11Date', 'sortie12Date', 'sortie13Date', 'sortie14Date', 'sortie15Date',
            'registrationDate', 'expiryDate',
          ]
          for (const field of dateFields) {
            if (s[field]) dates[field] = s[field]
          }
        }
      }

      // Second: Theory module dates from Zoom (higher priority)
      if (theoryRes?.ok) {
        const theoryData: { moduleNumber: number; date: string }[] = await theoryRes.json()
        for (const tc of theoryData) {
          const d = new Date(tc.date)
          const dateStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`
          if (tc.moduleNumber >= 1 && tc.moduleNumber <= 12) {
            dates[`module${tc.moduleNumber}Date`] = dateStr
          }
        }
      }

      // Third: In-car session dates from Teamup (highest priority)
      if (eventsRes?.ok) {
        const events: { id: string; title: string; start_dt: string }[] = await eventsRes.json()
        const now = new Date()
        for (const event of events) {
          if (new Date(event.start_dt) >= now) continue // skip future
          const parts = event.title.split(' - ')
          const first = parts[0]?.trim() || ''
          const sMatch = first.match(/^Session (\d+)$/)
          const mMatch = first.match(/^M(\d+)$/)
          const moduleMatch = first.match(/^Module (\d+)$/)
          const eventDate = new Date(event.start_dt)
          const dateStr = `${(eventDate.getMonth() + 1).toString().padStart(2, '0')}/${eventDate.getDate().toString().padStart(2, '0')}/${eventDate.getFullYear()}`

          if (sMatch) {
            const sNum = parseInt(sMatch[1])
            if (sNum >= 1 && sNum <= 15) dates[`sortie${sNum}Date`] = dateStr
          } else if (mMatch) {
            const mNum = parseInt(mMatch[1])
            if (mNum >= 1 && mNum <= 12 && !dates[`module${mNum}Date`]) dates[`module${mNum}Date`] = dateStr
          } else if (moduleMatch) {
            const mNum = parseInt(moduleMatch[1])
            if (mNum >= 1 && mNum <= 12 && !dates[`module${mNum}Date`]) dates[`module${mNum}Date`] = dateStr
          }
        }
      }

      // Update form data with auto-populated dates
      if (Object.keys(dates).length > 0) {
        setDbFormData(prev => ({ ...prev, ...dates }))
      }
    } catch (error) {
      console.error('Failed to fetch class dates:', error)
      // Non-critical — user can still enter dates via OCR or manually
    }

    // Clear previous scan images
    setDbLicenceImage(null)
    setDbAttendanceImage(null)
    setDbCombinedImage(null)
    setDbStep('scan')
  }

  const handleDbGeneratePDF = async () => {
    if (!templateStatus?.template) return
    let finalFormData = { ...dbFormData }

    // For database mode, attestation + contract numbers come from the DB
    // We only need school info from settings (don't auto-increment numbers)
    try {
      const res = await fetch('/api/certificate/settings')
      if (res.ok) {
        const settings = await res.json()
        finalFormData = {
          ...finalFormData,
          schoolName: settings.schoolName || '',
          schoolAddress: settings.schoolAddress || '',
          schoolCity: settings.schoolCity || '',
          schoolProvince: settings.schoolProvince || '',
          schoolPostalCode: settings.schoolPostalCode || '',
          schoolNumber: settings.schoolNumber || '',
        }
      }
    } catch (error) {
      console.error('Error fetching school settings:', error)
    }

    pdfMutation.mutate({ ...finalFormData, templatePdf: templateStatus.template })
    setDbStep('download')
  }

  const handleDbInputChange = (field: keyof CertificateFormData, value: string) => {
    setDbFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleDbImageUpload = (type: 'licence' | 'attendance' | 'combined') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressedBase64 = await compressImage(file, 2500, 0.85)
      if (type === 'licence') setDbLicenceImage(compressedBase64)
      else if (type === 'attendance') setDbAttendanceImage(compressedBase64)
      else setDbCombinedImage(compressedBase64)
    } catch (error) {
      console.error('Image compression failed:', error)
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        if (type === 'licence') setDbLicenceImage(base64)
        else if (type === 'attendance') setDbAttendanceImage(base64)
        else setDbCombinedImage(base64)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDbPhoneCameraCapture = (base64: string) => {
    if (!dbPhoneCameraTarget) return
    if (dbPhoneCameraTarget === 'licence') setDbLicenceImage(base64)
    else if (dbPhoneCameraTarget === 'attendance') setDbAttendanceImage(base64)
    else setDbCombinedImage(base64)
  }

  const handleDbProcessImages = async () => {
    setDbProcessing(true)
    try {
      const payload = dbUploadMode === 'combined'
        ? { licenceImage: null, attendanceImage: null, combinedImage: dbCombinedImage }
        : { licenceImage: dbLicenceImage, attendanceImage: dbAttendanceImage, combinedImage: null }

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || errorData.details || 'OCR failed')
      }
      const ocrData: ExtractedData = await res.json()

      // Merge OCR dates into DB form data (keep student info from database, take dates from OCR)
      setDbFormData(prev => ({
        ...prev,
        // Only override dates and fields that OCR provides — keep DB student data
        module1Date: ocrData.module1Date || prev.module1Date,
        module2Date: ocrData.module2Date || prev.module2Date,
        module3Date: ocrData.module3Date || prev.module3Date,
        module4Date: ocrData.module4Date || prev.module4Date,
        module5Date: ocrData.module5Date || prev.module5Date,
        module6Date: ocrData.module6Date || prev.module6Date,
        sortie1Date: ocrData.sortie1Date || prev.sortie1Date,
        sortie2Date: ocrData.sortie2Date || prev.sortie2Date,
        module7Date: ocrData.module7Date || prev.module7Date,
        sortie3Date: ocrData.sortie3Date || prev.sortie3Date,
        sortie4Date: ocrData.sortie4Date || prev.sortie4Date,
        module8Date: ocrData.module8Date || prev.module8Date,
        sortie5Date: ocrData.sortie5Date || prev.sortie5Date,
        sortie6Date: ocrData.sortie6Date || prev.sortie6Date,
        module9Date: ocrData.module9Date || prev.module9Date,
        sortie7Date: ocrData.sortie7Date || prev.sortie7Date,
        sortie8Date: ocrData.sortie8Date || prev.sortie8Date,
        module10Date: ocrData.module10Date || prev.module10Date,
        sortie9Date: ocrData.sortie9Date || prev.sortie9Date,
        sortie10Date: ocrData.sortie10Date || prev.sortie10Date,
        module11Date: ocrData.module11Date || prev.module11Date,
        sortie11Date: ocrData.sortie11Date || prev.sortie11Date,
        sortie12Date: ocrData.sortie12Date || prev.sortie12Date,
        sortie13Date: ocrData.sortie13Date || prev.sortie13Date,
        module12Date: ocrData.module12Date || prev.module12Date,
        sortie14Date: ocrData.sortie14Date || prev.sortie14Date,
        sortie15Date: ocrData.sortie15Date || prev.sortie15Date,
        registrationDate: ocrData.registrationDate || prev.registrationDate,
        expiryDate: ocrData.expiryDate || prev.expiryDate,
      }))
      setDbStep('review')
    } catch (error) {
      console.error('DB scan OCR error:', error)
      alert(error instanceof Error ? error.message : 'Failed to process images')
    } finally {
      setDbProcessing(false)
    }
  }

  const dbCanProcessScan = dbUploadMode === 'combined' ? !!dbCombinedImage : !!(dbLicenceImage || dbAttendanceImage)

  const isStudentDataComplete = (fd: CertificateFormData) => !!(fd.name && fd.licenceNumber && fd.module1Date)
  const successCount = bulkStudents.filter(bs => bs.pdfBlob).length
  const ocrEntriesCount = bulkStudents.filter(bs => bs.source === 'ocr' && !bs.datesFetched).length

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Mode Toggle */}
          <div className="flex justify-center mb-6">
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <Button variant={pageMode === 'single' ? 'default' : 'ghost'} size="sm" onClick={() => setPageMode('single')} className="gap-1.5">
                <User className="h-3.5 w-3.5" /> Single
              </Button>
              <Button variant={pageMode === 'database' ? 'default' : 'ghost'} size="sm" onClick={() => setPageMode('database')} className="gap-1.5">
                <Database className="h-3.5 w-3.5" /> Database
              </Button>
              <Button variant={pageMode === 'bulk' ? 'default' : 'ghost'} size="sm" onClick={() => setPageMode('bulk')} className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Bulk
              </Button>
            </div>
          </div>

          {/* ═══════════════════ SINGLE MODE ═══════════════════ */}
          {pageMode === 'single' && (
            <>
              {/* Progress Steps */}
              <div className="flex items-center justify-center mb-8">
                {STEP_ORDER.map((s, idx) => (
                  <div key={s} className="flex items-center">
                    {idx > 0 && <div className="w-4 sm:w-12 h-0.5 bg-muted mx-1 sm:mx-2" />}
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-base ${step === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{idx + 1}</div>
                      <span className={`hidden sm:inline ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>{['Scan', 'Review', 'Done'][idx]}</span>
                    </div>
                  </div>
                ))}
              </div>

              <AnimatePresence mode="wait" custom={direction}>
              {/* Step 1: Template */}
              {/* Step 1: Search & Scan */}
              {step === 'upload-docs' && (
                <motion.div key="upload-docs" custom={direction} initial={{ opacity: 0, x: direction * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -30 }} transition={{ duration: 0.25 }} className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Student & Documents</h2>
                    <p className="text-muted-foreground">Search for a student to auto-fill, then scan documents for dates</p>
                  </div>

                  {/* Student Search */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Search Student</CardTitle>
                      <CardDescription>Search by name, phone, or permit to auto-fill student info and class dates</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={singleSearchQuery}
                          onChange={(e) => setSingleSearchQuery(e.target.value)}
                          placeholder="Type a name, phone number, or permit..."
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSingleSearch() }}
                          className="flex-1"
                        />
                        <Button onClick={() => handleSingleSearch()} disabled={singleSearching || singleSearchQuery.length < 2} size="sm">
                          {singleSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </div>
                      {selectedStudentId && (
                        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                          <span className="text-sm text-green-800 dark:text-green-300 font-medium truncate">{formData.name}</span>
                          <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => { setSelectedStudentId(null); setFormData(initialFormData) }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {singleSearchResults.length > 0 && !selectedStudentId && (
                        <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                          {singleSearchResults.map((student) => (
                            <button
                              key={`${student.status || 'ext'}-${student.student_id}`}
                              onClick={() => handleSingleSelectStudent(student)}
                              className="w-full text-left p-2.5 rounded-lg border hover:border-primary hover:bg-accent transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm">{student.full_name}</p>
                                    {student.status === 'whatsapp' && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">WhatsApp</Badge>}
                                    {student.status === 'local' && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Local</Badge>}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                                    {student.phone_number && <span>📞 {student.phone_number}</span>}
                                    {student.permit_number && <span className="font-mono">🪪 {student.permit_number}</span>}
                                  </div>
                                </div>
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {singleSearchResults.length === 0 && singleSearchQuery.length >= 2 && !singleSearching && !selectedStudentId && (
                        <p className="text-xs text-muted-foreground text-center py-2">No students found</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Document Upload */}
                  <div className="flex justify-center gap-2 mb-4">
                    <Button variant={uploadMode === 'combined' ? 'default' : 'outline'} onClick={() => setUploadMode('combined')} size="sm">Single Photo (Both Documents)</Button>
                    <Button variant={uploadMode === 'separate' ? 'default' : 'outline'} onClick={() => setUploadMode('separate')} size="sm">Separate Photos</Button>
                  </div>

                  {uploadMode === 'combined' ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Combined Photo</CardTitle>
                        <CardDescription>Upload a single photo containing both the driver&apos;s licence and attendance sheet</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                          <input type="file" accept="image/*" onChange={handleImageUpload('combined')} className="hidden" id="combined-upload" />
                          <label htmlFor="combined-upload" className="cursor-pointer">
                            {combinedImage ? (
                              <div className="space-y-2">
                                <img src={combinedImage} alt="Uploaded documents" className="max-h-60 mx-auto rounded-lg" />
                                <div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm">Uploaded</span></div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                                <p className="font-medium">Click to upload</p>
                                <p className="text-sm text-muted-foreground">Photo with licence + attendance sheet</p>
                              </div>
                            )}
                          </label>
                        </div>
                        <Button variant="outline" className="w-full" onClick={() => setPhoneCameraTarget('combined')}><Smartphone className="h-4 w-4 mr-2" /> Use Phone Camera</Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-6 md:grid-cols-2">
                      <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Driver&apos;s Licence</CardTitle><CardDescription>Upload photo or scan of the licence</CardDescription></CardHeader>
                        <CardContent className="space-y-3">
                          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                            <input type="file" accept="image/*" onChange={handleImageUpload('licence')} className="hidden" id="licence-upload" />
                            <label htmlFor="licence-upload" className="cursor-pointer">
                              {licenceImage ? (
                                <div className="space-y-2"><img src={licenceImage} alt="Uploaded licence" className="max-h-40 mx-auto rounded-lg" /><div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm">Uploaded</span></div></div>
                              ) : (
                                <div className="space-y-2"><Upload className="h-10 w-10 mx-auto text-muted-foreground" /><p className="font-medium">Click to upload</p><p className="text-sm text-muted-foreground">PNG, JPG</p></div>
                              )}
                            </label>
                          </div>
                          <Button variant="outline" size="sm" className="w-full" onClick={() => setPhoneCameraTarget('licence')}><Smartphone className="h-3.5 w-3.5 mr-1.5" /> Phone Camera</Button>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Attendance Sheet</CardTitle><CardDescription>Upload the Qazi attendance sheet with all dates</CardDescription></CardHeader>
                        <CardContent className="space-y-3">
                          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                            <input type="file" accept="image/*" onChange={handleImageUpload('attendance')} className="hidden" id="attendance-upload" />
                            <label htmlFor="attendance-upload" className="cursor-pointer">
                              {attendanceImage ? (
                                <div className="space-y-2"><img src={attendanceImage} alt="Uploaded attendance" className="max-h-40 mx-auto rounded-lg" /><div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm">Uploaded</span></div></div>
                              ) : (
                                <div className="space-y-2"><Upload className="h-10 w-10 mx-auto text-muted-foreground" /><p className="font-medium">Click to upload</p><p className="text-sm text-muted-foreground">PNG, JPG</p></div>
                              )}
                            </label>
                          </div>
                          <Button variant="outline" size="sm" className="w-full" onClick={() => setPhoneCameraTarget('attendance')}><Smartphone className="h-3.5 w-3.5 mr-1.5" /> Phone Camera</Button>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    {selectedStudentId && (
                      <Button variant="outline" onClick={() => navigateStep('review')}>Skip Scan <ArrowRight className="h-4 w-4 ml-2" /></Button>
                    )}
                    <Button size="lg" onClick={handleProcessImages} disabled={!canProceedToReview || isProcessing}>
                      {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing with AI...</> : <>Process & Continue <ArrowRight className="h-4 w-4 ml-2" /></>}
                    </Button>
                  </div>
                  {ocrMutation.isError && <p className="text-destructive text-sm text-center">{ocrMutation.error instanceof Error ? ocrMutation.error.message : 'Failed to process images. Please try again.'}</p>}
                </motion.div>
              )}

              {/* Step 3: Review */}
              {step === 'review' && (
                <motion.div key="review" custom={direction} initial={{ opacity: 0, x: direction * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -30 }} transition={{ duration: 0.25 }} className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Review & Edit</h2>
                    <p className="text-muted-foreground">Verify the extracted information and make any corrections</p>
                  </div>

                  <ReviewForm formData={formData} onChange={handleInputChange} />

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => navigateStep('upload-docs')}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
                    <Button size="lg" onClick={handleGeneratePDF} disabled={pdfMutation.isPending || !formData.name}>
                      {pdfMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <>Generate Certificate <ArrowRight className="h-4 w-4 ml-2" /></>}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Download */}
              {step === 'download' && (
                <motion.div key="download" custom={direction} initial={{ opacity: 0, x: direction * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -30 }} transition={{ duration: 0.25 }} className="space-y-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mx-auto mb-4"><CheckCircle2 className="h-10 w-10 text-green-600" /></div>
                    <h2 className="text-2xl font-bold mb-2">Certificate Generated!</h2>
                    <p className="text-muted-foreground mb-6">Your certificate has been downloaded automatically.</p>
                    <div className="flex justify-center gap-4">
                      <Button variant="outline" onClick={() => templatePdf && pdfMutation.mutate({ ...formData, templatePdf })}><Download className="h-4 w-4 mr-2" /> Download Again</Button>
                      <Button onClick={() => { navigateStep('upload-docs'); setLicenceImage(null); setAttendanceImage(null); setCombinedImage(null); setFormData(initialFormData); setSelectedStudentId(null) }}>Create Another</Button>
                    </div>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>

              {pdfMutation.isError && <p className="text-destructive text-sm text-center mt-4">Failed to generate PDF. Please try again.</p>}
            </>
          )}

          {/* ═══════════════════ DATABASE MODE ═══════════════════ */}
          {pageMode === 'database' && (
            <>
              {/* Database Progress Steps */}
              <div className="flex items-center justify-center mb-8">
                {[
                  { key: 'search', label: 'Search', num: 1 },
                  { key: 'scan', label: 'Scan', num: 2 },
                  { key: 'review', label: 'Review', num: 3 },
                  { key: 'download', label: 'Done', num: 4 },
                ].map((s, idx) => (
                  <div key={s.key} className="flex items-center">
                    {idx > 0 && <div className="w-4 sm:w-12 h-0.5 bg-muted mx-1 sm:mx-2" />}
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-base ${dbStep === s.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s.num}</div>
                      <span className={`hidden sm:inline ${dbStep === s.key ? 'font-medium' : 'text-muted-foreground'}`}>{s.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* DB Step 1: Search */}
              {dbStep === 'search' && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Search Student</h2>
                    <p className="text-muted-foreground">Search by name, phone, permit or contract number</p>
                  </div>

                  {!templateStatus?.exists && (
                    <div className="border-2 border-dashed rounded-lg p-6 text-center border-amber-300 bg-amber-50">
                      <AlertCircle className="h-8 w-8 mx-auto text-amber-600 mb-2" />
                      <p className="font-medium text-amber-800">Blank template required</p>
                      <p className="text-sm text-muted-foreground mt-1">Go to <Link href="/certificate/settings" className="underline">Settings</Link> to upload a blank template first</p>
                    </div>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Student Search</CardTitle>
                      <CardDescription>Search the driving school database for a student</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          value={dbSearchQuery}
                          onChange={(e) => setDbSearchQuery(e.target.value)}
                          placeholder="Type a name, phone number, or permit..."
                          onKeyDown={(e) => { if (e.key === 'Enter') handleDbSearch() }}
                          className="flex-1"
                        />
                        <Button onClick={() => handleDbSearch()} disabled={dbSearching || dbSearchQuery.length < 2}>
                          {dbSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </div>

                      {/* Search Results */}
                      {dbSearchResults.length > 0 && (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {dbSearchResults.map((student) => (
                            <button
                              key={student.student_id}
                              onClick={() => handleDbSelectStudent(student)}
                              className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-accent transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{student.full_name}</p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                                    {student.phone_number && <span>📞 {student.phone_number}</span>}
                                    {student.permit_number && <span className="font-mono">🪪 {student.permit_number}</span>}
                                    {student.contract_number && <span className="font-mono">🔖 Att: {student.contract_number}</span>}
                                    {student.user_defined_contract_number && <span>📄 Contract: {student.user_defined_contract_number}</span>}
                                  </div>
                                  {student.full_address && (
                                    <p className="text-xs text-muted-foreground mt-0.5">📍 {student.full_address}, {student.city} {student.postal_code}</p>
                                  )}
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {dbSearchResults.length === 0 && dbSearchQuery.length >= 2 && !dbSearching && (
                        <p className="text-sm text-muted-foreground text-center py-4">No students found. Try a different search.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* DB Step 2: Scan Documents */}
              {dbStep === 'scan' && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Scan Documents</h2>
                    <p className="text-muted-foreground">
                      Upload licence & attendance for <span className="font-medium text-foreground">{dbSelectedStudent?.full_name}</span> to auto-fill dates
                    </p>
                  </div>

                  <div className="flex justify-center gap-2 mb-4">
                    <Button variant={dbUploadMode === 'combined' ? 'default' : 'outline'} onClick={() => setDbUploadMode('combined')} size="sm">Single Photo (Both)</Button>
                    <Button variant={dbUploadMode === 'separate' ? 'default' : 'outline'} onClick={() => setDbUploadMode('separate')} size="sm">Separate Photos</Button>
                  </div>

                  {dbUploadMode === 'combined' ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Combined Photo</CardTitle>
                        <CardDescription>Upload a single photo containing both the driver&apos;s licence and attendance sheet</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                          <input type="file" accept="image/*" onChange={handleDbImageUpload('combined')} className="hidden" id="db-combined-upload" />
                          <label htmlFor="db-combined-upload" className="cursor-pointer">
                            {dbCombinedImage ? (
                              <div className="space-y-2">
                                <img src={dbCombinedImage} alt="Uploaded documents" className="max-h-60 mx-auto rounded-lg" />
                                <div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm">Uploaded</span></div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                                <p className="font-medium">Click to upload</p>
                                <p className="text-sm text-muted-foreground">Photo with licence + attendance sheet</p>
                              </div>
                            )}
                          </label>
                        </div>
                        <Button variant="outline" className="w-full" onClick={() => setDbPhoneCameraTarget('combined')}><Smartphone className="h-4 w-4 mr-2" /> Use Phone Camera</Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-6 md:grid-cols-2">
                      <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Driver&apos;s Licence</CardTitle><CardDescription>Upload photo of the licence</CardDescription></CardHeader>
                        <CardContent className="space-y-3">
                          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                            <input type="file" accept="image/*" onChange={handleDbImageUpload('licence')} className="hidden" id="db-licence-upload" />
                            <label htmlFor="db-licence-upload" className="cursor-pointer">
                              {dbLicenceImage ? (
                                <div className="space-y-2"><img src={dbLicenceImage} alt="Uploaded licence" className="max-h-40 mx-auto rounded-lg" /><div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm">Uploaded</span></div></div>
                              ) : (
                                <div className="space-y-2"><Upload className="h-10 w-10 mx-auto text-muted-foreground" /><p className="font-medium">Click to upload</p><p className="text-sm text-muted-foreground">PNG, JPG</p></div>
                              )}
                            </label>
                          </div>
                          <Button variant="outline" size="sm" className="w-full" onClick={() => setDbPhoneCameraTarget('licence')}><Smartphone className="h-3.5 w-3.5 mr-1.5" /> Phone Camera</Button>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Attendance Sheet</CardTitle><CardDescription>Upload the attendance sheet with all dates</CardDescription></CardHeader>
                        <CardContent className="space-y-3">
                          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                            <input type="file" accept="image/*" onChange={handleDbImageUpload('attendance')} className="hidden" id="db-attendance-upload" />
                            <label htmlFor="db-attendance-upload" className="cursor-pointer">
                              {dbAttendanceImage ? (
                                <div className="space-y-2"><img src={dbAttendanceImage} alt="Uploaded attendance" className="max-h-40 mx-auto rounded-lg" /><div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm">Uploaded</span></div></div>
                              ) : (
                                <div className="space-y-2"><Upload className="h-10 w-10 mx-auto text-muted-foreground" /><p className="font-medium">Click to upload</p><p className="text-sm text-muted-foreground">PNG, JPG</p></div>
                              )}
                            </label>
                          </div>
                          <Button variant="outline" size="sm" className="w-full" onClick={() => setDbPhoneCameraTarget('attendance')}><Smartphone className="h-3.5 w-3.5 mr-1.5" /> Phone Camera</Button>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setDbStep('search')}><ArrowLeft className="h-4 w-4 mr-2" /> Back to Search</Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setDbStep('review')}>Skip Scan <ArrowRight className="h-4 w-4 ml-2" /></Button>
                      <Button size="lg" onClick={handleDbProcessImages} disabled={!dbCanProcessScan || dbProcessing}>
                        {dbProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing with AI...</> : <>Process & Continue <ArrowRight className="h-4 w-4 ml-2" /></>}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* DB Phone Camera Dialog */}
              {dbPhoneCameraTarget && (
                <Dialog open={!!dbPhoneCameraTarget} onOpenChange={() => setDbPhoneCameraTarget(null)}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Phone Camera Upload</DialogTitle>
                      <DialogDescription>Scan the QR code with your phone to take a photo</DialogDescription>
                    </DialogHeader>
                    <PhoneCameraUpload
                      onCapture={(base64) => { handleDbPhoneCameraCapture(base64); setDbPhoneCameraTarget(null) }}
                      onClose={() => setDbPhoneCameraTarget(null)}
                    />
                  </DialogContent>
                </Dialog>
              )}

              {/* DB Step 3: Review */}
              {dbStep === 'review' && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Review & Edit</h2>
                    <p className="text-muted-foreground">
                      {dbSelectedStudent && <span className="font-medium text-foreground">{dbSelectedStudent.full_name}</span>}
                      {' — '}Verify info and add module dates, then generate
                    </p>
                  </div>

                  <ReviewForm formData={dbFormData} onChange={handleDbInputChange} />

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setDbStep('scan')}><ArrowLeft className="h-4 w-4 mr-2" /> Back to Scan</Button>
                    <Button size="lg" onClick={handleDbGeneratePDF} disabled={pdfMutation.isPending || !dbFormData.name || !templateStatus?.exists}>
                      {pdfMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <>Generate Certificate <ArrowRight className="h-4 w-4 ml-2" /></>}
                    </Button>
                  </div>
                </div>
              )}

              {/* DB Step 4: Download */}
              {dbStep === 'download' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mx-auto mb-4"><CheckCircle2 className="h-10 w-10 text-green-600" /></div>
                    <h2 className="text-2xl font-bold mb-2">Certificate Generated!</h2>
                    <p className="text-muted-foreground mb-6">Certificate for <span className="font-medium text-foreground">{dbSelectedStudent?.full_name}</span> has been downloaded.</p>
                    <div className="flex justify-center gap-4">
                      <Button variant="outline" onClick={() => templateStatus?.template && pdfMutation.mutate({ ...dbFormData, templatePdf: templateStatus.template })}><Download className="h-4 w-4 mr-2" /> Download Again</Button>
                      <Button onClick={() => { setDbStep('search'); setDbSelectedStudent(null); setDbFormData(initialFormData); setDbSearchQuery(''); setDbSearchResults([]) }}>Search Another</Button>
                    </div>
                  </div>
                </div>
              )}

              {pdfMutation.isError && <p className="text-destructive text-sm text-center mt-4">Failed to generate PDF. Please try again.</p>}
            </>
          )}

          {/* ═══════════════════ BULK MODE ═══════════════════ */}
          {pageMode === 'bulk' && (
            <>
              {/* Bulk Progress Steps */}
              <div className="flex items-center justify-center mb-8">
                {[
                  { key: 'select', label: 'Select', num: 1 },
                  { key: 'review', label: 'Review', num: 2 },
                  { key: 'download', label: 'Download', num: 3 },
                ].map((s, idx) => (
                  <div key={s.key} className="flex items-center">
                    {idx > 0 && <div className="w-4 sm:w-12 h-0.5 bg-muted mx-1 sm:mx-2" />}
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-base ${bulkStep === s.key || (bulkStep === 'processing' && s.key === 'review') ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s.num}</div>
                      <span className={`hidden sm:inline ${bulkStep === s.key || (bulkStep === 'processing' && s.key === 'review') ? 'font-medium' : 'text-muted-foreground'}`}>{s.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bulk Step 1: Select Students */}
              {bulkStep === 'select' && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Select Students</h2>
                    <p className="text-muted-foreground">Search the database to add students, or upload photos for OCR</p>
                  </div>

                  {!templateStatus?.exists && (
                    <div className="border-2 border-dashed rounded-lg p-6 text-center border-amber-300 bg-amber-50">
                      <AlertCircle className="h-8 w-8 mx-auto text-amber-600 mb-2" />
                      <p className="font-medium text-amber-800">Blank template required for bulk mode</p>
                      <p className="text-sm text-muted-foreground mt-1">Go to <Link href="/certificate/settings" className="underline">Settings</Link> to upload a blank template first</p>
                    </div>
                  )}

                  <Card>
                    <CardHeader><CardTitle>Certificate Type (all students)</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex gap-4">
                        <Button variant={bulkCertType === 'phase1' ? 'default' : 'outline'} onClick={() => setBulkCertType('phase1')} className="flex-1">
                          Phase 1 Only <Badge variant="secondary" className="ml-2">5 modules</Badge>
                        </Button>
                        <Button variant={bulkCertType === 'full' ? 'default' : 'outline'} onClick={() => setBulkCertType('full')} className="flex-1">
                          Full Course <Badge variant="secondary" className="ml-2">12 + 15</Badge>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Search from Database */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Search Database</CardTitle>
                      <CardDescription>Search by name, phone, or permit to add students with auto-filled info and dates</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={bulkSearchQuery}
                          onChange={(e) => setBulkSearchQuery(e.target.value)}
                          placeholder="Type a name, phone number, or permit..."
                          onKeyDown={(e) => { if (e.key === 'Enter') handleBulkSearch() }}
                          className="flex-1"
                        />
                        <Button onClick={() => handleBulkSearch()} disabled={bulkSearching || bulkSearchQuery.length < 2} size="sm">
                          {bulkSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </div>
                      {bulkSearchResults.length > 0 && (
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                          {bulkSearchResults.map((student) => {
                            const alreadyAdded = bulkStudents.some(bs => bs.student?.student_id === student.student_id)
                            return (
                              <button
                                key={student.student_id}
                                onClick={() => !alreadyAdded && handleBulkAddStudent(student)}
                                disabled={alreadyAdded}
                                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${alreadyAdded ? 'opacity-50 cursor-not-allowed bg-muted' : 'hover:border-primary hover:bg-accent'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-sm">{student.full_name}</p>
                                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                                      {student.phone_number && <span>📞 {student.phone_number}</span>}
                                      {student.permit_number && <span className="font-mono">🪪 {student.permit_number}</span>}
                                    </div>
                                  </div>
                                  {alreadyAdded ? (
                                    <Badge variant="secondary" className="text-xs">Added</Badge>
                                  ) : (
                                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {bulkSearchResults.length === 0 && bulkSearchQuery.length >= 2 && !bulkSearching && (
                        <p className="text-xs text-muted-foreground text-center py-2">No students found</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Upload Photos for OCR */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Upload Photos (OCR)</CardTitle>
                      <CardDescription>Upload combined photos (licence + attendance) to extract student info via AI</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                        <input type="file" accept="image/*" multiple onChange={handleBulkImageUpload} className="hidden" id="bulk-upload" />
                        <label htmlFor="bulk-upload" className="cursor-pointer">
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                          <p className="font-medium mt-2">Click to select photos</p>
                          <p className="text-sm text-muted-foreground">Select multiple images at once</p>
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Selected Students List */}
                  {bulkStudents.length > 0 && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Selected ({bulkStudents.length})</CardTitle>
                          <Button variant="ghost" size="sm" onClick={() => setBulkStudents([])} className="text-muted-foreground text-xs">Clear all</Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {bulkStudents.map((bs) => (
                            <div key={bs.id} className="flex items-center justify-between p-2.5 rounded-lg border">
                              <div className="flex items-center gap-3 min-w-0">
                                <Badge variant={bs.source === 'database' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                                  {bs.source === 'database' ? 'DB' : 'OCR'}
                                </Badge>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {bs.source === 'database' ? bs.student?.full_name : (bs.fileName || 'Photo')}
                                  </p>
                                  {bs.source === 'database' && !bs.datesFetched && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Fetching dates...</p>
                                  )}
                                  {bs.source === 'database' && bs.datesFetched && (
                                    <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Dates loaded</p>
                                  )}
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => removeBulkStudent(bs.id)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="flex justify-center">
                    <Button size="lg" onClick={handleBulkProcess} disabled={bulkStudents.length === 0 || !templateStatus?.exists}>
                      {ocrEntriesCount > 0 ? (
                        <>Process & Review {bulkStudents.length} Student{bulkStudents.length !== 1 ? 's' : ''} <ArrowRight className="h-4 w-4 ml-2" /></>
                      ) : (
                        <>Review {bulkStudents.length} Student{bulkStudents.length !== 1 ? 's' : ''} <ArrowRight className="h-4 w-4 ml-2" /></>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Bulk Step 2: Processing OCR */}
              {bulkStep === 'processing' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Processing Documents</h2>
                    <p className="text-muted-foreground">Scanning photo {processingIndex + 1} of {bulkStudents.filter(bs => bs.source === 'ocr' && !bs.datesFetched).length}...</p>
                  </div>
                  <div className="max-w-md mx-auto">
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${((processingIndex + 1) / Math.max(1, bulkStudents.filter(bs => bs.source === 'ocr' && !bs.datesFetched).length)) * 100}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-2">This may take a moment per student...</p>
                  </div>
                </div>
              )}

              {/* Bulk Step 3: Review (Tabs) */}
              {bulkStep === 'review' && (
                <div className="space-y-6">
                  <div className="text-center mb-2">
                    <h2 className="text-2xl font-bold mb-2">Review Students</h2>
                    <p className="text-muted-foreground">Check each student&apos;s data. Upload a photo per student to OCR missing dates.</p>
                  </div>

                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
                      {bulkStudents.map((bs, idx) => {
                        const complete = isStudentDataComplete(bs.formData)
                        const hasError = !!bs.ocrError
                        return (
                          <TabsTrigger key={bs.id} value={String(idx)} className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <span className={`h-2 w-2 rounded-full ${hasError ? 'bg-red-500' : complete ? 'bg-green-500' : 'bg-amber-500'}`} />
                            {bs.formData.name ? bs.formData.name.split(',')[0].trim().substring(0, 12) : `Student ${idx + 1}`}
                          </TabsTrigger>
                        )
                      })}
                    </TabsList>

                    {bulkStudents.map((bs, idx) => (
                      <TabsContent key={bs.id} value={String(idx)}>
                        {bs.ocrError && (
                          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-red-800">OCR Error</p>
                              <p className="text-xs text-red-600">{bs.ocrError}</p>
                              <p className="text-xs text-muted-foreground mt-1">You can fill in the data manually below.</p>
                            </div>
                          </div>
                        )}

                        {/* Per-student OCR upload for missing dates */}
                        <Card className="mb-4">
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm flex items-center gap-2"><Camera className="h-4 w-4" /> Scan for Missing Dates</CardTitle>
                          </CardHeader>
                          <CardContent className="py-2">
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleBulkStudentOcrUpload(idx, e)}
                                  className="hidden"
                                  id={`bulk-ocr-${idx}`}
                                />
                                <label htmlFor={`bulk-ocr-${idx}`} className="cursor-pointer">
                                  <div className="border border-dashed rounded-lg p-3 text-center hover:border-primary transition-colors">
                                    {bs.ocrImage ? (
                                      <div className="flex items-center justify-center gap-2">
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <span className="text-sm text-green-700">Photo uploaded</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-2">
                                        <Upload className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">Upload licence + attendance photo</span>
                                      </div>
                                    )}
                                  </div>
                                </label>
                              </div>
                              {bs.ocrImage && (
                                <Button size="sm" onClick={() => handleBulkStudentOcrProcess(idx)} disabled={bs.ocrProcessing}>
                                  {bs.ocrProcessing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Processing...</> : <>Run OCR</>}
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>

                        <ReviewForm formData={bs.formData} onChange={(field, value) => handleBulkFieldChange(idx, field, value)} showCertType={false} />
                      </TabsContent>
                    ))}
                  </Tabs>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setBulkStep('select')}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
                    <Button size="lg" onClick={handleBulkGenerate} disabled={isGenerating || bulkStudents.length === 0}>
                      {isGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating {generateIndex + 1} of {bulkStudents.length}...</> : <>Generate All Certificates <ArrowRight className="h-4 w-4 ml-2" /></>}
                    </Button>
                  </div>
                </div>
              )}

              {/* Bulk Step 4: Download */}
              {bulkStep === 'download' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mx-auto mb-4"><CheckCircle2 className="h-10 w-10 text-green-600" /></div>
                    <h2 className="text-2xl font-bold mb-2">{successCount} Certificate{successCount !== 1 ? 's' : ''} Generated!</h2>
                    <p className="text-muted-foreground mb-6">Download all certificates as a single ZIP file, or download individually.</p>
                    <Button size="lg" onClick={handleDownloadZip} className="gap-2"><Archive className="h-5 w-5" /> Download All as ZIP</Button>
                  </div>

                  <Card>
                    <CardHeader><CardTitle>Individual Downloads</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {bulkStudents.map((bs, idx) => (
                          <div key={bs.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <div className={`h-2.5 w-2.5 rounded-full ${bs.pdfBlob ? 'bg-green-500' : 'bg-red-500'}`} />
                              <div>
                                <p className="text-sm font-medium">{bs.formData.name || `Student ${idx + 1}`}</p>
                                {bs.formData.licenceNumber && <p className="text-xs text-muted-foreground font-mono">{bs.formData.licenceNumber}</p>}
                              </div>
                            </div>
                            {bs.pdfBlob ? (
                              <Button variant="outline" size="sm" onClick={() => handleDownloadSingle(idx)}><Download className="h-3.5 w-3.5 mr-1.5" /> Download</Button>
                            ) : (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => { setBulkStep('select'); setBulkStudents([]) }}>Create Another Batch</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Phone Camera Dialog */}
      <Dialog open={phoneCameraTarget !== null} onOpenChange={(open) => { if (!open) setPhoneCameraTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Phone Camera</DialogTitle>
            <DialogDescription>Scan the QR code with your phone to take a photo directly</DialogDescription>
          </DialogHeader>
          {phoneCameraTarget && <PhoneCameraUpload onCapture={handlePhoneCameraCapture} onClose={() => setPhoneCameraTarget(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
