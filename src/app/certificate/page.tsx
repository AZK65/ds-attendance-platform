'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Upload, FileText, Download, Loader2, Camera, ArrowLeft, ArrowRight, CheckCircle2, Edit3, Settings, Plus, Smartphone, X, Users, User, AlertCircle, Archive, Search, Database } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PhoneCameraUpload } from '@/components/PhoneCameraUpload'

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

interface DBStudent {
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

type Step = 'upload-pdf' | 'upload-docs' | 'review' | 'download'
type UploadMode = 'separate' | 'combined'
type TemplateMode = 'new' | 'upload'
type PageMode = 'single' | 'bulk' | 'database'
type BulkStep = 'upload' | 'processing' | 'review' | 'download'

interface BulkImage {
  id: string
  image: string
  fileName: string
}

interface BulkResult {
  id: string
  formData: CertificateFormData
  ocrError?: string
  pdfBlob?: Blob
}

const STEP_ORDER: Step[] = ['upload-pdf', 'upload-docs', 'review', 'download']

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
              <Input value={formData.address} onChange={(e) => onChange('address', e.target.value)} placeholder="123 Street Name" />
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
              <Input value={formData.phone} onChange={(e) => onChange('phone', e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Driver&apos;s Licence Number</Label>
              <Input value={formData.licenceNumber} onChange={(e) => onChange('licenceNumber', e.target.value)} placeholder="N1326100391 07" className="font-mono" />
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
  const [step, setStep] = useState<Step>('upload-pdf')
  const [direction, setDirection] = useState(1)

  const navigateStep = (newStep: Step) => {
    const oldIdx = STEP_ORDER.indexOf(step)
    const newIdx = STEP_ORDER.indexOf(newStep)
    setDirection(newIdx >= oldIdx ? 1 : -1)
    setStep(newStep)
  }

  const [uploadMode, setUploadMode] = useState<UploadMode>('combined')
  const [templateMode, setTemplateMode] = useState<TemplateMode>('new')
  const [templatePdf, setTemplatePdf] = useState<string | null>(null)
  const [templatePdfName, setTemplatePdfName] = useState<string>('')
  const [licenceImage, setLicenceImage] = useState<string | null>(null)
  const [attendanceImage, setAttendanceImage] = useState<string | null>(null)
  const [combinedImage, setCombinedImage] = useState<string | null>(null)
  const [formData, setFormData] = useState<CertificateFormData>(initialFormData)
  const [isProcessing, setIsProcessing] = useState(false)
  const [phoneCameraTarget, setPhoneCameraTarget] = useState<'combined' | 'licence' | 'attendance' | null>(null)

  // ─── Bulk Mode State ────────────────────────────────────────────────────
  const [bulkStep, setBulkStep] = useState<BulkStep>('upload')
  const [bulkImages, setBulkImages] = useState<BulkImage[]>([])
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([])
  const [bulkCertType, setBulkCertType] = useState<'phase1' | 'full'>('full')
  const [processingIndex, setProcessingIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('0')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateIndex, setGenerateIndex] = useState(0)

  // ─── Database Mode State ────────────────────────────────────────────────
  const [dbSearchQuery, setDbSearchQuery] = useState('')
  const [dbSearchResults, setDbSearchResults] = useState<DBStudent[]>([])
  const [dbSearching, setDbSearching] = useState(false)
  const [dbSelectedStudent, setDbSelectedStudent] = useState<DBStudent | null>(null)
  const [dbStep, setDbStep] = useState<'search' | 'review' | 'download'>('search')
  const [dbFormData, setDbFormData] = useState<CertificateFormData>(initialFormData)

  // ─── Shared Queries ─────────────────────────────────────────────────────
  const { data: templateStatus, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['certificate-template'],
    queryFn: async () => {
      const res = await fetch('/api/certificate/template')
      if (res.status === 404) return { exists: false, template: null }
      if (!res.ok) throw new Error('Failed to check template')
      return res.json() as Promise<{ exists: boolean; template: string | null }>
    }
  })

  useEffect(() => {
    if (templateMode === 'new' && templateStatus?.exists && templateStatus?.template) {
      setTemplatePdf(templateStatus.template)
      setTemplatePdfName('Blank Template (from settings)')
    } else if (templateMode === 'upload') {
      setTemplatePdf(null)
      setTemplatePdfName('')
    }
  }, [templateMode, templateStatus])

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
    }
  })

  // ─── Single Mode Handlers ──────────────────────────────────────────────

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      setTemplatePdf(event.target?.result as string)
      setTemplatePdfName(file.name)
    }
    reader.readAsDataURL(file)
  }

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

    if (templateMode === 'new') {
      try {
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
          attestationNumber: formattedAttestation,
          schoolName: numbers.schoolName || '',
          schoolAddress: numbers.schoolAddress || '',
          schoolCity: numbers.schoolCity || '',
          schoolProvince: numbers.schoolProvince || '',
          schoolPostalCode: numbers.schoolPostalCode || '',
          schoolNumber: numbers.schoolNumber || '',
        }
      } catch (error) {
        console.error('Error fetching next numbers:', error)
        alert('Failed to get certificate numbers. Check settings.')
        return
      }
    }

    pdfMutation.mutate({ ...finalFormData, templatePdf })
    navigateStep('download')
  }

  const canProceedToOcr = templatePdf
  const canProceedToReview = uploadMode === 'combined' ? combinedImage : (licenceImage || attendanceImage)

  // ─── Bulk Mode Handlers ────────────────────────────────────────────────

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const newImages: BulkImage[] = []
    for (let i = 0; i < files.length; i++) {
      try {
        const compressed = await compressImage(files[i], 2500, 0.85)
        newImages.push({ id: `${Date.now()}-${i}`, image: compressed, fileName: files[i].name })
      } catch {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target?.result as string)
          reader.readAsDataURL(files[i])
        })
        newImages.push({ id: `${Date.now()}-${i}`, image: base64, fileName: files[i].name })
      }
    }
    setBulkImages(prev => [...prev, ...newImages])
    e.target.value = ''
  }

  const removeBulkImage = (id: string) => {
    setBulkImages(prev => prev.filter(img => img.id !== id))
  }

  const handleBulkProcess = useCallback(async () => {
    setBulkStep('processing')
    const results: BulkResult[] = []
    for (let i = 0; i < bulkImages.length; i++) {
      setProcessingIndex(i)
      try {
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenceImage: null, attendanceImage: null, combinedImage: bulkImages[i].image })
        })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'OCR failed' }))
          results.push({ id: bulkImages[i].id, formData: { ...initialFormData, certificateType: bulkCertType }, ocrError: errorData.error || 'OCR failed' })
          continue
        }
        const data: ExtractedData = await res.json()
        results.push({ id: bulkImages[i].id, formData: { ...initialFormData, ...data, certificateType: bulkCertType } })
      } catch (err) {
        results.push({ id: bulkImages[i].id, formData: { ...initialFormData, certificateType: bulkCertType }, ocrError: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
    setBulkResults(results)
    setActiveTab('0')
    setBulkStep('review')
  }, [bulkImages, bulkCertType])

  const handleBulkFieldChange = (index: number, field: keyof CertificateFormData, value: string) => {
    setBulkResults(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], formData: { ...updated[index].formData, [field]: value } }
      return updated
    })
  }

  const handleBulkGenerate = useCallback(async () => {
    if (!templateStatus?.template) return
    setIsGenerating(true)
    const updatedResults = [...bulkResults]

    for (let i = 0; i < updatedResults.length; i++) {
      setGenerateIndex(i)

      // Fetch next numbers for each student
      let finalFormData = { ...updatedResults[i].formData }
      try {
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
      } catch { /* continue without numbers */ }

      try {
        const res = await fetch('/api/certificate/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...finalFormData, templatePdf: templateStatus.template })
        })
        if (!res.ok) throw new Error('PDF generation failed')
        updatedResults[i] = { ...updatedResults[i], pdfBlob: await res.blob() }
      } catch {
        updatedResults[i] = { ...updatedResults[i], ocrError: (updatedResults[i].ocrError || '') + ' | PDF generation failed' }
      }
    }

    setBulkResults(updatedResults)
    setIsGenerating(false)
    setBulkStep('download')
  }, [bulkResults, templateStatus])

  const handleDownloadZip = useCallback(async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    bulkResults.forEach((result, index) => {
      if (result.pdfBlob) {
        const name = result.formData.name ? result.formData.name.replace(/[^a-zA-Z0-9À-ÿ\s,-]/g, '').trim() : `student-${index + 1}`
        zip.file(`${name}.pdf`, result.pdfBlob)
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
  }, [bulkResults])

  const handleDownloadSingle = (index: number) => {
    const result = bulkResults[index]
    if (!result?.pdfBlob) return
    const url = URL.createObjectURL(result.pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `certificate-${result.formData.name || `student-${index + 1}`}-${new Date().toISOString().split('T')[0]}.pdf`
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
      setDbSearchResults(data.students || [])
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

  const handleDbSelectStudent = (student: DBStudent) => {
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

    setDbFormData({
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
    })
    setDbStep('review')
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

  const isStudentDataComplete = (fd: CertificateFormData) => !!(fd.name && fd.licenceNumber && fd.module1Date)
  const successCount = bulkResults.filter(r => r.pdfBlob).length

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
                      <span className={`hidden sm:inline ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>{['Template', 'Scan', 'Review', 'Done'][idx]}</span>
                    </div>
                  </div>
                ))}
              </div>

              <AnimatePresence mode="wait" custom={direction}>
              {/* Step 1: Template */}
              {step === 'upload-pdf' && (
                <motion.div key="upload-pdf" custom={direction} initial={{ opacity: 0, x: direction * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -30 }} transition={{ duration: 0.25 }} className="space-y-6">
                  <div className="text-center mb-6">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <h2 className="text-2xl font-bold">Certificate Template</h2>
                      <Link href="/certificate/settings"><Button variant="ghost" size="sm"><Settings className="h-4 w-4" /></Button></Link>
                    </div>
                    <p className="text-muted-foreground">Choose to use a new certificate or upload one with a unique barcode</p>
                  </div>

                  <div className="flex justify-center gap-2 mb-4">
                    <Button variant={templateMode === 'new' ? 'default' : 'outline'} onClick={() => setTemplateMode('new')} disabled={!templateStatus?.exists} className="flex items-center gap-2">
                      <Plus className="h-4 w-4" /> New Certificate
                      {!templateStatus?.exists && <Badge variant="secondary" className="ml-1 text-xs">No template</Badge>}
                    </Button>
                    <Button variant={templateMode === 'upload' ? 'default' : 'outline'} onClick={() => setTemplateMode('upload')} className="flex items-center gap-2">
                      <Upload className="h-4 w-4" /> Upload PDF
                    </Button>
                  </div>

                  {templateMode === 'new' ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> New Certificate</CardTitle>
                        <CardDescription>Uses the blank template from settings. Contract and attestation numbers will auto-increment.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingTemplate ? (
                          <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                        ) : templateStatus?.exists ? (
                          <div className="border-2 border-dashed rounded-lg p-8 text-center border-green-300 bg-green-50">
                            <FileText className="h-12 w-12 mx-auto text-green-600 mb-2" />
                            <div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm font-medium">Blank template ready</span></div>
                            <p className="text-xs text-muted-foreground mt-2">Numbers will auto-increment from settings</p>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed rounded-lg p-8 text-center border-amber-300 bg-amber-50">
                            <FileText className="h-12 w-12 mx-auto text-amber-600 mb-2" />
                            <p className="font-medium text-amber-800">No blank template configured</p>
                            <p className="text-sm text-muted-foreground mt-2">Go to <Link href="/certificate/settings" className="underline">Settings</Link> to upload a blank template</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Upload Certificate PDF</CardTitle>
                        <CardDescription>Upload a certificate PDF with the student&apos;s unique barcode from SAAQ.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                          <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" id="pdf-upload" />
                          <label htmlFor="pdf-upload" className="cursor-pointer">
                            {templatePdf && templateMode === 'upload' ? (
                              <div className="space-y-2">
                                <FileText className="h-12 w-12 mx-auto text-primary" />
                                <div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm font-medium">{templatePdfName}</span></div>
                                <p className="text-xs text-muted-foreground">Click to replace</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                                <p className="font-medium">Click to upload PDF</p>
                                <p className="text-sm text-muted-foreground">Certificate with unique barcode</p>
                              </div>
                            )}
                          </label>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="flex justify-center">
                    <Button size="lg" onClick={() => navigateStep('upload-docs')} disabled={!canProceedToOcr}>Continue <ArrowRight className="h-4 w-4 ml-2" /></Button>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Scan */}
              {step === 'upload-docs' && (
                <motion.div key="upload-docs" custom={direction} initial={{ opacity: 0, x: direction * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -30 }} transition={{ duration: 0.25 }} className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Scan Documents</h2>
                    <p className="text-muted-foreground">Upload the driver&apos;s licence and attendance sheet to auto-fill</p>
                  </div>

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

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => navigateStep('upload-pdf')}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
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
                      <Button onClick={() => { navigateStep('upload-pdf'); setTemplatePdf(null); setTemplatePdfName(''); setLicenceImage(null); setAttendanceImage(null); setCombinedImage(null); setFormData(initialFormData) }}>Create Another</Button>
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
                  { key: 'review', label: 'Review', num: 2 },
                  { key: 'download', label: 'Done', num: 3 },
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
                        <Button onClick={handleDbSearch} disabled={dbSearching || dbSearchQuery.length < 2}>
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

              {/* DB Step 2: Review */}
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
                    <Button variant="outline" onClick={() => setDbStep('search')}><ArrowLeft className="h-4 w-4 mr-2" /> Back to Search</Button>
                    <Button size="lg" onClick={handleDbGeneratePDF} disabled={pdfMutation.isPending || !dbFormData.name || !templateStatus?.exists}>
                      {pdfMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <>Generate Certificate <ArrowRight className="h-4 w-4 ml-2" /></>}
                    </Button>
                  </div>
                </div>
              )}

              {/* DB Step 3: Download */}
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
                  { key: 'upload', label: 'Upload', num: 1 },
                  { key: 'processing', label: 'Processing', num: 2 },
                  { key: 'review', label: 'Review', num: 3 },
                  { key: 'download', label: 'Download', num: 4 },
                ].map((s, idx) => (
                  <div key={s.key} className="flex items-center">
                    {idx > 0 && <div className="w-4 sm:w-12 h-0.5 bg-muted mx-1 sm:mx-2" />}
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-base ${bulkStep === s.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s.num}</div>
                      <span className={`hidden sm:inline ${bulkStep === s.key ? 'font-medium' : 'text-muted-foreground'}`}>{s.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bulk Step 1: Upload */}
              {bulkStep === 'upload' && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Upload Student Photos</h2>
                    <p className="text-muted-foreground">Select multiple combined photos (licence + attendance in one image per student)</p>
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Combined Photos</CardTitle>
                      <CardDescription>Each photo should contain both the driver&apos;s licence and attendance sheet for one student</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                        <input type="file" accept="image/*" multiple onChange={handleBulkUpload} className="hidden" id="bulk-upload" />
                        <label htmlFor="bulk-upload" className="cursor-pointer">
                          <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                          <p className="font-medium mt-2">Click to select photos</p>
                          <p className="text-sm text-muted-foreground">Select multiple images at once</p>
                        </label>
                      </div>

                      {bulkImages.length > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium">{bulkImages.length} student{bulkImages.length !== 1 ? 's' : ''} ready</p>
                            <Button variant="ghost" size="sm" onClick={() => setBulkImages([])} className="text-muted-foreground">Clear all</Button>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                            {bulkImages.map((img) => (
                              <div key={img.id} className="relative group">
                                <img src={img.image} alt={img.fileName} className="w-full aspect-square object-cover rounded-lg border" />
                                <button onClick={() => removeBulkImage(img.id)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                                <p className="text-[10px] text-muted-foreground truncate mt-1">{img.fileName}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="flex justify-center">
                    <Button size="lg" onClick={handleBulkProcess} disabled={bulkImages.length === 0 || !templateStatus?.exists}>
                      Process {bulkImages.length} Student{bulkImages.length !== 1 ? 's' : ''} <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Bulk Step 2: Processing */}
              {bulkStep === 'processing' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Processing Documents</h2>
                    <p className="text-muted-foreground">Scanning student {processingIndex + 1} of {bulkImages.length}...</p>
                  </div>
                  <div className="max-w-md mx-auto">
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${((processingIndex + 1) / bulkImages.length) * 100}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-2">This may take a moment per student...</p>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-w-2xl mx-auto">
                    {bulkImages.map((img, idx) => (
                      <div key={img.id} className="relative">
                        <img src={img.image} alt={img.fileName} className={`w-full aspect-square object-cover rounded-lg border-2 ${idx < processingIndex ? 'border-green-400 opacity-60' : idx === processingIndex ? 'border-primary animate-pulse' : 'border-muted opacity-40'}`} />
                        {idx < processingIndex && <div className="absolute inset-0 flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bulk Step 3: Review (Tabs) */}
              {bulkStep === 'review' && (
                <div className="space-y-6">
                  <div className="text-center mb-2">
                    <h2 className="text-2xl font-bold mb-2">Review Students</h2>
                    <p className="text-muted-foreground">Check each student&apos;s extracted data and make corrections</p>
                  </div>

                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
                      {bulkResults.map((result, idx) => {
                        const complete = isStudentDataComplete(result.formData)
                        const hasError = !!result.ocrError
                        return (
                          <TabsTrigger key={result.id} value={String(idx)} className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <span className={`h-2 w-2 rounded-full ${hasError ? 'bg-red-500' : complete ? 'bg-green-500' : 'bg-amber-500'}`} />
                            {result.formData.name ? result.formData.name.split(',')[0].trim().substring(0, 12) : `Student ${idx + 1}`}
                          </TabsTrigger>
                        )
                      })}
                    </TabsList>

                    {bulkResults.map((result, idx) => (
                      <TabsContent key={result.id} value={String(idx)}>
                        {result.ocrError && (
                          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-red-800">OCR Error</p>
                              <p className="text-xs text-red-600">{result.ocrError}</p>
                              <p className="text-xs text-muted-foreground mt-1">You can fill in the data manually below.</p>
                            </div>
                          </div>
                        )}
                        <ReviewForm formData={result.formData} onChange={(field, value) => handleBulkFieldChange(idx, field, value)} showCertType={false} />
                      </TabsContent>
                    ))}
                  </Tabs>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => { setBulkStep('upload'); setBulkResults([]) }}><ArrowLeft className="h-4 w-4 mr-2" /> Start Over</Button>
                    <Button size="lg" onClick={handleBulkGenerate} disabled={isGenerating}>
                      {isGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating {generateIndex + 1} of {bulkResults.length}...</> : <>Generate All Certificates <ArrowRight className="h-4 w-4 ml-2" /></>}
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
                        {bulkResults.map((result, idx) => (
                          <div key={result.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <div className={`h-2.5 w-2.5 rounded-full ${result.pdfBlob ? 'bg-green-500' : 'bg-red-500'}`} />
                              <div>
                                <p className="text-sm font-medium">{result.formData.name || `Student ${idx + 1}`}</p>
                                {result.formData.licenceNumber && <p className="text-xs text-muted-foreground font-mono">{result.formData.licenceNumber}</p>}
                              </div>
                            </div>
                            {result.pdfBlob ? (
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
                    <Button variant="outline" onClick={() => { setBulkStep('upload'); setBulkImages([]); setBulkResults([]) }}>Create Another Batch</Button>
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
