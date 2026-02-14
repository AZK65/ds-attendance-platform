'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, Download, Loader2, Camera, ArrowLeft, ArrowRight, CheckCircle2, Edit3, Settings, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'

interface ExtractedData {
  // From licence
  licenceNumber: string
  name: string
  address: string

  // From attendance sheet
  contractNumber: string
  phone: string
  registrationDate: string
  expiryDate: string

  // Phase 1 dates
  module1Date: string
  module2Date: string
  module3Date: string
  module4Date: string
  module5Date: string

  // Phase 2 dates
  module6Date: string
  sortie1Date: string
  sortie2Date: string
  module7Date: string
  sortie3Date: string
  sortie4Date: string

  // Phase 3 dates
  module8Date: string
  sortie5Date: string
  sortie6Date: string
  module9Date: string
  sortie7Date: string
  sortie8Date: string
  module10Date: string
  sortie9Date: string
  sortie10Date: string

  // Phase 4 dates
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

type Step = 'upload-pdf' | 'upload-docs' | 'review' | 'download'
type UploadMode = 'separate' | 'combined'
type TemplateMode = 'new' | 'upload'

const STEP_ORDER: Step[] = ['upload-pdf', 'upload-docs', 'review', 'download']

export default function CertificatePage() {
  const [step, setStep] = useState<Step>('upload-pdf')
  const [direction, setDirection] = useState(1) // 1 = forward, -1 = back

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

  // Check if blank template exists
  const { data: templateStatus, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['certificate-template'],
    queryFn: async () => {
      const res = await fetch('/api/certificate/template')
      if (res.status === 404) return { exists: false, template: null }
      if (!res.ok) throw new Error('Failed to check template')
      return res.json() as Promise<{ exists: boolean; template: string | null }>
    }
  })

  // If blank template exists and mode is 'new', use it
  useEffect(() => {
    if (templateMode === 'new' && templateStatus?.exists && templateStatus?.template) {
      setTemplatePdf(templateStatus.template)
      setTemplatePdfName('Blank Template (from settings)')
    } else if (templateMode === 'upload') {
      // Clear template when switching to upload mode
      setTemplatePdf(null)
      setTemplatePdfName('')
    }
  }, [templateMode, templateStatus])

  // OCR mutation for processing images
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
      // Check if any meaningful data was extracted
      const hasData = data.name || data.licenceNumber || data.module1Date
      if (!hasData) {
        console.warn('OCR completed but no data extracted')
      }
      setFormData(prev => ({
        ...prev,
        ...data,
      }))
      navigateStep('review')
    }
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
    }
  })

  // Handle PDF template upload
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setTemplatePdf(base64)
      setTemplatePdfName(file.name)
    }
    reader.readAsDataURL(file)
  }

  // Compress image to reduce file size for upload
  const compressImage = (file: File, maxWidth: number = 2000, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let { width, height } = img

          // Scale down if needed
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }
          ctx.drawImage(img, 0, 0, width, height)

          // Convert to JPEG with compression
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality)
          resolve(compressedBase64)
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = event.target?.result as string
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = (type: 'licence' | 'attendance' | 'combined') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // Compress image to reduce size (max 2500px width, 85% quality for better OCR)
      const compressedBase64 = await compressImage(file, 2500, 0.85)

      if (type === 'licence') {
        setLicenceImage(compressedBase64)
      } else if (type === 'attendance') {
        setAttendanceImage(compressedBase64)
      } else {
        setCombinedImage(compressedBase64)
      }
    } catch (error) {
      console.error('Image compression failed:', error)
      // Fallback to original file if compression fails
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        if (type === 'licence') {
          setLicenceImage(base64)
        } else if (type === 'attendance') {
          setAttendanceImage(base64)
        } else {
          setCombinedImage(base64)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleProcessImages = async () => {
    if (uploadMode === 'combined') {
      if (!combinedImage) return
      setIsProcessing(true)
      try {
        await ocrMutation.mutateAsync({ licenceImage: null, attendanceImage: null, combinedImage })
      } finally {
        setIsProcessing(false)
      }
    } else {
      if (!licenceImage && !attendanceImage) return
      setIsProcessing(true)
      try {
        await ocrMutation.mutateAsync({ licenceImage, attendanceImage, combinedImage: null })
      } finally {
        setIsProcessing(false)
      }
    }
  }

  const handleInputChange = (field: keyof CertificateFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleGeneratePDF = async () => {
    if (!templatePdf) return

    let finalFormData = { ...formData }

    // If using "New Certificate" mode, fetch next numbers and school info from settings
    if (templateMode === 'new') {
      try {
        const res = await fetch('/api/certificate/next-number', { method: 'POST' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to get certificate numbers' }))
          alert(err.error || 'Failed to get certificate numbers from settings')
          return
        }
        const numbers = await res.json()

        // Format attestation number with spaces (e.g., "5190414" -> "5  1  9  0  4  1  4")
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

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center gap-1 sm:gap-2">
              <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-base ${step === 'upload-pdf' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                1
              </div>
              <span className={`hidden sm:inline ${step === 'upload-pdf' ? 'font-medium' : 'text-muted-foreground'}`}>Template</span>
            </div>
            <div className="w-4 sm:w-12 h-0.5 bg-muted mx-1 sm:mx-2" />
            <div className="flex items-center gap-1 sm:gap-2">
              <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-base ${step === 'upload-docs' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                2
              </div>
              <span className={`hidden sm:inline ${step === 'upload-docs' ? 'font-medium' : 'text-muted-foreground'}`}>Scan</span>
            </div>
            <div className="w-4 sm:w-12 h-0.5 bg-muted mx-1 sm:mx-2" />
            <div className="flex items-center gap-1 sm:gap-2">
              <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-base ${step === 'review' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                3
              </div>
              <span className={`hidden sm:inline ${step === 'review' ? 'font-medium' : 'text-muted-foreground'}`}>Review</span>
            </div>
            <div className="w-4 sm:w-12 h-0.5 bg-muted mx-1 sm:mx-2" />
            <div className="flex items-center gap-1 sm:gap-2">
              <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-base ${step === 'download' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                4
              </div>
              <span className={`hidden sm:inline ${step === 'download' ? 'font-medium' : 'text-muted-foreground'}`}>Done</span>
            </div>
          </div>

          <AnimatePresence mode="wait" custom={direction}>
          {/* Step 1: Upload PDF Template */}
          {step === 'upload-pdf' && (
            <motion.div
              key="upload-pdf"
              custom={direction}
              initial={{ opacity: 0, x: direction * 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -30 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h2 className="text-2xl font-bold">Certificate Template</h2>
                  <Link href="/certificate/settings">
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                <p className="text-muted-foreground">Choose to use a new certificate or upload one with a unique barcode</p>
              </div>

              {/* Template Mode Toggle */}
              <div className="flex justify-center gap-2 mb-4">
                <Button
                  variant={templateMode === 'new' ? 'default' : 'outline'}
                  onClick={() => setTemplateMode('new')}
                  disabled={!templateStatus?.exists}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  New Certificate
                  {!templateStatus?.exists && (
                    <Badge variant="secondary" className="ml-1 text-xs">No template</Badge>
                  )}
                </Button>
                <Button
                  variant={templateMode === 'upload' ? 'default' : 'outline'}
                  onClick={() => setTemplateMode('upload')}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload PDF
                </Button>
              </div>

              {templateMode === 'new' ? (
                /* New Certificate - Uses blank template from settings */
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Plus className="h-5 w-5" />
                      New Certificate
                    </CardTitle>
                    <CardDescription>
                      Uses the blank template from settings. Contract and attestation numbers will auto-increment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingTemplate ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : templateStatus?.exists ? (
                      <div className="border-2 border-dashed rounded-lg p-8 text-center border-green-300 bg-green-50">
                        <FileText className="h-12 w-12 mx-auto text-green-600 mb-2" />
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm font-medium">Blank template ready</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Numbers will auto-increment from settings
                        </p>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-lg p-8 text-center border-amber-300 bg-amber-50">
                        <FileText className="h-12 w-12 mx-auto text-amber-600 mb-2" />
                        <p className="font-medium text-amber-800">No blank template configured</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Go to <Link href="/certificate/settings" className="underline">Settings</Link> to upload a blank template
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                /* Upload PDF - Manual upload */
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Upload Certificate PDF
                    </CardTitle>
                    <CardDescription>
                      Upload a certificate PDF with the student&apos;s unique barcode from SAAQ.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handlePdfUpload}
                        className="hidden"
                        id="pdf-upload"
                      />
                      <label htmlFor="pdf-upload" className="cursor-pointer">
                        {templatePdf && templateMode === 'upload' ? (
                          <div className="space-y-2">
                            <FileText className="h-12 w-12 mx-auto text-primary" />
                            <div className="flex items-center justify-center gap-1 text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm font-medium">{templatePdfName}</span>
                            </div>
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
                <Button
                  size="lg"
                  onClick={() => navigateStep('upload-docs')}
                  disabled={!canProceedToOcr}
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Upload Documents for OCR */}
          {step === 'upload-docs' && (
            <motion.div
              key="upload-docs"
              custom={direction}
              initial={{ opacity: 0, x: direction * 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -30 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Scan Documents</h2>
                <p className="text-muted-foreground">Upload the driver&apos;s licence and attendance sheet to auto-fill</p>
              </div>

              {/* Upload Mode Toggle */}
              <div className="flex justify-center gap-2 mb-4">
                <Button
                  variant={uploadMode === 'combined' ? 'default' : 'outline'}
                  onClick={() => setUploadMode('combined')}
                  size="sm"
                >
                  Single Photo (Both Documents)
                </Button>
                <Button
                  variant={uploadMode === 'separate' ? 'default' : 'outline'}
                  onClick={() => setUploadMode('separate')}
                  size="sm"
                >
                  Separate Photos
                </Button>
              </div>

              {uploadMode === 'combined' ? (
                /* Combined Upload - Single image with both documents */
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Camera className="h-5 w-5" />
                      Combined Photo
                    </CardTitle>
                    <CardDescription>
                      Upload a single photo containing both the driver&apos;s licence and attendance sheet
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload('combined')}
                        className="hidden"
                        id="combined-upload"
                      />
                      <label htmlFor="combined-upload" className="cursor-pointer">
                        {combinedImage ? (
                          <div className="space-y-2">
                            <img
                              src={combinedImage}
                              alt="Uploaded documents"
                              className="max-h-60 mx-auto rounded-lg"
                            />
                            <div className="flex items-center justify-center gap-1 text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm">Uploaded</span>
                            </div>
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
                  </CardContent>
                </Card>
              ) : (
                /* Separate Uploads */
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Licence Upload */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Camera className="h-5 w-5" />
                        Driver&apos;s Licence
                      </CardTitle>
                      <CardDescription>
                        Upload photo or scan of the licence
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload('licence')}
                          className="hidden"
                          id="licence-upload"
                        />
                        <label htmlFor="licence-upload" className="cursor-pointer">
                          {licenceImage ? (
                            <div className="space-y-2">
                              <img
                                src={licenceImage}
                                alt="Uploaded licence"
                                className="max-h-40 mx-auto rounded-lg"
                              />
                              <div className="flex items-center justify-center gap-1 text-green-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-sm">Uploaded</span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                              <p className="font-medium">Click to upload</p>
                              <p className="text-sm text-muted-foreground">PNG, JPG</p>
                            </div>
                          )}
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Attendance Sheet Upload */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Attendance Sheet
                      </CardTitle>
                      <CardDescription>
                        Upload the Qazi attendance sheet with all dates
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload('attendance')}
                          className="hidden"
                          id="attendance-upload"
                        />
                        <label htmlFor="attendance-upload" className="cursor-pointer">
                          {attendanceImage ? (
                            <div className="space-y-2">
                              <img
                                src={attendanceImage}
                                alt="Uploaded attendance"
                                className="max-h-40 mx-auto rounded-lg"
                              />
                              <div className="flex items-center justify-center gap-1 text-green-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-sm">Uploaded</span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                              <p className="font-medium">Click to upload</p>
                              <p className="text-sm text-muted-foreground">PNG, JPG</p>
                            </div>
                          )}
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => navigateStep('upload-pdf')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  size="lg"
                  onClick={handleProcessImages}
                  disabled={!canProceedToReview || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing with AI...
                    </>
                  ) : (
                    <>
                      Process & Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>

              {ocrMutation.isError && (
                <p className="text-destructive text-sm text-center">
                  {ocrMutation.error instanceof Error ? ocrMutation.error.message : 'Failed to process images. Please try again.'}
                </p>
              )}
            </motion.div>
          )}

          {/* Step 3: Review & Edit */}
          {step === 'review' && (
            <motion.div
              key="review"
              custom={direction}
              initial={{ opacity: 0, x: direction * 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -30 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Review & Edit</h2>
                <p className="text-muted-foreground">Verify the extracted information and make any corrections</p>
              </div>

              {/* Certificate Type */}
              <Card>
                <CardHeader>
                  <CardTitle>Certificate Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Button
                      variant={formData.certificateType === 'phase1' ? 'default' : 'outline'}
                      onClick={() => handleInputChange('certificateType', 'phase1')}
                      className="flex-1"
                    >
                      Phase 1 Only
                      <Badge variant="secondary" className="ml-2">5 modules</Badge>
                    </Button>
                    <Button
                      variant={formData.certificateType === 'full' ? 'default' : 'outline'}
                      onClick={() => handleInputChange('certificateType', 'full')}
                      className="flex-1"
                    >
                      Full Course
                      <Badge variant="secondary" className="ml-2">12 + 15</Badge>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Student Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Edit3 className="h-5 w-5" />
                    Student Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="name">Full Name (Last, First)</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Lastname, Firstname"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        placeholder="123 Street Name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="municipality">Municipality</Label>
                      <Input
                        id="municipality"
                        value={formData.municipality}
                        onChange={(e) => handleInputChange('municipality', e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="province">Province</Label>
                        <Input
                          id="province"
                          value={formData.province}
                          onChange={(e) => handleInputChange('province', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="postalCode">Postal Code</Label>
                        <Input
                          id="postalCode"
                          value={formData.postalCode}
                          onChange={(e) => handleInputChange('postalCode', e.target.value)}
                          placeholder="H1N 1K4"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="contractNumber">Contract #</Label>
                      <Input
                        id="contractNumber"
                        value={formData.contractNumber}
                        onChange={(e) => handleInputChange('contractNumber', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="licenceNumber">Driver&apos;s Licence Number</Label>
                      <Input
                        id="licenceNumber"
                        value={formData.licenceNumber}
                        onChange={(e) => handleInputChange('licenceNumber', e.target.value)}
                        placeholder="N1326100391 07"
                        className="font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="attestationNumber">Attestation Number (for Barcode)</Label>
                      <Input
                        id="attestationNumber"
                        value={formData.attestationNumber}
                        onChange={(e) => handleInputChange('attestationNumber', e.target.value)}
                        placeholder="M23662011870"
                        className="font-mono"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Phase 1 Dates */}
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
                        <Input
                          type="date"
                          value={formData[field]}
                          onChange={(e) => handleInputChange(field, e.target.value)}
                          className="text-xs px-1"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Phase 2-4 (Only if full course) */}
              {formData.certificateType === 'full' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Phase 2</CardTitle>
                      <CardDescription>M6 (Accompanied Driving) + In-Car Sessions 1-4</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">M6</Label>
                          <Input type="date" value={formData.module6Date} onChange={(e) => handleInputChange('module6Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 1</Label>
                          <Input type="date" value={formData.sortie1Date} onChange={(e) => handleInputChange('sortie1Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 2</Label>
                          <Input type="date" value={formData.sortie2Date} onChange={(e) => handleInputChange('sortie2Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">M7</Label>
                          <Input type="date" value={formData.module7Date} onChange={(e) => handleInputChange('module7Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 3</Label>
                          <Input type="date" value={formData.sortie3Date} onChange={(e) => handleInputChange('sortie3Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 4</Label>
                          <Input type="date" value={formData.sortie4Date} onChange={(e) => handleInputChange('sortie4Date', e.target.value)} className="text-xs px-1" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Phase 3</CardTitle>
                      <CardDescription>M8 (Speed), M9 (Sharing Road), M10 (Alcohol/Drugs) + Sessions 5-10</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">M8</Label>
                          <Input type="date" value={formData.module8Date} onChange={(e) => handleInputChange('module8Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 5</Label>
                          <Input type="date" value={formData.sortie5Date} onChange={(e) => handleInputChange('sortie5Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 6</Label>
                          <Input type="date" value={formData.sortie6Date} onChange={(e) => handleInputChange('sortie6Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">M9</Label>
                          <Input type="date" value={formData.module9Date} onChange={(e) => handleInputChange('module9Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 7</Label>
                          <Input type="date" value={formData.sortie7Date} onChange={(e) => handleInputChange('sortie7Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 8</Label>
                          <Input type="date" value={formData.sortie8Date} onChange={(e) => handleInputChange('sortie8Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">M10</Label>
                          <Input type="date" value={formData.module10Date} onChange={(e) => handleInputChange('module10Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 9</Label>
                          <Input type="date" value={formData.sortie9Date} onChange={(e) => handleInputChange('sortie9Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 10</Label>
                          <Input type="date" value={formData.sortie10Date} onChange={(e) => handleInputChange('sortie10Date', e.target.value)} className="text-xs px-1" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Phase 4</CardTitle>
                      <CardDescription>M11 (Fatigue), M12 (Eco-driving) + Sessions 11-15</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">M11</Label>
                          <Input type="date" value={formData.module11Date} onChange={(e) => handleInputChange('module11Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 11</Label>
                          <Input type="date" value={formData.sortie11Date} onChange={(e) => handleInputChange('sortie11Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 12</Label>
                          <Input type="date" value={formData.sortie12Date} onChange={(e) => handleInputChange('sortie12Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 13</Label>
                          <Input type="date" value={formData.sortie13Date} onChange={(e) => handleInputChange('sortie13Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">M12</Label>
                          <Input type="date" value={formData.module12Date} onChange={(e) => handleInputChange('module12Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 14</Label>
                          <Input type="date" value={formData.sortie14Date} onChange={(e) => handleInputChange('sortie14Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Session 15</Label>
                          <Input type="date" value={formData.sortie15Date} onChange={(e) => handleInputChange('sortie15Date', e.target.value)} className="text-xs px-1" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => navigateStep('upload-docs')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  size="lg"
                  onClick={handleGeneratePDF}
                  disabled={pdfMutation.isPending || !formData.name}
                >
                  {pdfMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      Generate Certificate
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Download */}
          {step === 'download' && (
            <motion.div
              key="download"
              custom={direction}
              initial={{ opacity: 0, x: direction * 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -30 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div className="text-center">
                <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mx-auto mb-4">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Certificate Generated!</h2>
                <p className="text-muted-foreground mb-6">Your certificate has been downloaded automatically.</p>

                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={() => templatePdf && pdfMutation.mutate({ ...formData, templatePdf })}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Again
                  </Button>
                  <Button onClick={() => {
                    navigateStep('upload-pdf')
                    setTemplatePdf(null)
                    setTemplatePdfName('')
                    setLicenceImage(null)
                    setAttendanceImage(null)
                    setCombinedImage(null)
                    setFormData(initialFormData)
                  }}>
                    Create Another
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {pdfMutation.isError && (
            <p className="text-destructive text-sm text-center mt-4">
              Failed to generate PDF. Please try again.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
