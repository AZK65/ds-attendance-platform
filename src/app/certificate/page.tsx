'use client'

import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, Download, Loader2, Camera, ArrowLeft, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

interface ExtractedData {
  licenceNumber: string
  expiryDate: string
  issueDate: string
  birthDate: string
  name: string
  address: string
}

interface CertificateFormData {
  // Student info
  name: string
  address: string
  municipality: string
  province: string
  postalCode: string
  contractNumber: string
  phone: string
  phoneAlt: string
  licenceNumber: string

  // Module dates (Phase 1)
  module1Date: string
  module2Date: string
  module3Date: string
  module4Date: string
  module5Date: string

  // Phase 2
  module6Date: string
  sortie1Date: string
  sortie2Date: string
  module7Date: string
  sortie3Date: string
  sortie4Date: string

  // Phase 3
  module8Date: string
  sortie5Date: string
  sortie6Date: string
  module9Date: string
  sortie7Date: string
  sortie8Date: string
  module10Date: string
  sortie9Date: string
  sortie10Date: string

  // Phase 4
  module11Date: string
  sortie11Date: string
  sortie12Date: string
  sortie13Date: string
  module12Date: string
  sortie14Date: string
  sortie15Date: string

  // Certificate type
  certificateType: 'phase1' | 'full'
}

export default function CertificatePage() {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [formData, setFormData] = useState<CertificateFormData>({
    name: '',
    address: '',
    municipality: 'Montreal',
    province: 'QC',
    postalCode: '',
    contractNumber: '',
    phone: '',
    phoneAlt: '',
    licenceNumber: '',
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
    certificateType: 'phase1'
  })

  // OCR mutation
  const ocrMutation = useMutation({
    mutationFn: async (imageBase64: string) => {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64 })
      })
      if (!res.ok) throw new Error('OCR failed')
      return res.json() as Promise<ExtractedData>
    },
    onSuccess: (data) => {
      setExtractedData(data)
      // Auto-fill form with extracted data
      setFormData(prev => ({
        ...prev,
        licenceNumber: data.licenceNumber || prev.licenceNumber,
        name: data.name || prev.name,
        address: data.address || prev.address,
      }))
    }
  })

  // PDF generation mutation
  const pdfMutation = useMutation({
    mutationFn: async (data: CertificateFormData) => {
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

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setUploadedImage(base64)
      // Trigger OCR
      ocrMutation.mutate(base64)
    }
    reader.readAsDataURL(file)
  }, [ocrMutation])

  const handleInputChange = (field: keyof CertificateFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleGeneratePDF = () => {
    pdfMutation.mutate(formData)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Certificate Maker</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column - OCR Upload */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    Scan Driver&apos;s Licence
                  </CardTitle>
                  <CardDescription>
                    Upload a photo of the driver&apos;s licence to auto-extract information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="licence-upload"
                      />
                      <label htmlFor="licence-upload" className="cursor-pointer">
                        {uploadedImage ? (
                          <div className="space-y-2">
                            <img
                              src={uploadedImage}
                              alt="Uploaded licence"
                              className="max-h-48 mx-auto rounded-lg"
                            />
                            <p className="text-sm text-muted-foreground">Click to upload a different image</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                            <p className="font-medium">Click to upload licence image</p>
                            <p className="text-sm text-muted-foreground">PNG, JPG up to 10MB</p>
                          </div>
                        )}
                      </label>
                    </div>

                    {ocrMutation.isPending && (
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing with Kimi K2.5...
                      </div>
                    )}

                    {ocrMutation.isError && (
                      <div className="text-destructive text-sm text-center">
                        Failed to process image. Please try again.
                      </div>
                    )}

                    {extractedData && (
                      <div className="bg-accent/50 rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Extracted Information
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Licence #:</span>{' '}
                            <span className="font-mono">{extractedData.licenceNumber || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Name:</span>{' '}
                            {extractedData.name || 'N/A'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Issue Date:</span>{' '}
                            {extractedData.issueDate || 'N/A'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Expiry Date:</span>{' '}
                            {extractedData.expiryDate || 'N/A'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Certificate Type Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Certificate Type
                  </CardTitle>
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
            </div>

            {/* Right Column - Form */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Student Information</CardTitle>
                  <CardDescription>Fill in or edit the student details</CardDescription>
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
                        placeholder="708"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="5141234567"
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
                  </div>
                </CardContent>
              </Card>

              {/* Phase 1 Dates */}
              <Card>
                <CardHeader>
                  <CardTitle>Phase 1 - Module Dates</CardTitle>
                  <CardDescription>Theory modules 1-5</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <div key={num}>
                        <Label htmlFor={`module${num}Date`} className="text-xs">Module {num}</Label>
                        <Input
                          type="date"
                          id={`module${num}Date`}
                          value={formData[`module${num}Date` as keyof CertificateFormData] as string}
                          onChange={(e) => handleInputChange(`module${num}Date` as keyof CertificateFormData, e.target.value)}
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
                      <CardDescription>Module 6-7 + Sorties 1-4</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Module 6</Label>
                          <Input type="date" value={formData.module6Date} onChange={(e) => handleInputChange('module6Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 1</Label>
                          <Input type="date" value={formData.sortie1Date} onChange={(e) => handleInputChange('sortie1Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 2</Label>
                          <Input type="date" value={formData.sortie2Date} onChange={(e) => handleInputChange('sortie2Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Module 7</Label>
                          <Input type="date" value={formData.module7Date} onChange={(e) => handleInputChange('module7Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 3</Label>
                          <Input type="date" value={formData.sortie3Date} onChange={(e) => handleInputChange('sortie3Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 4</Label>
                          <Input type="date" value={formData.sortie4Date} onChange={(e) => handleInputChange('sortie4Date', e.target.value)} className="text-xs px-1" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Phase 3</CardTitle>
                      <CardDescription>Module 8-10 + Sorties 5-10</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Module 8</Label>
                          <Input type="date" value={formData.module8Date} onChange={(e) => handleInputChange('module8Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 5</Label>
                          <Input type="date" value={formData.sortie5Date} onChange={(e) => handleInputChange('sortie5Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 6</Label>
                          <Input type="date" value={formData.sortie6Date} onChange={(e) => handleInputChange('sortie6Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Module 9</Label>
                          <Input type="date" value={formData.module9Date} onChange={(e) => handleInputChange('module9Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 7</Label>
                          <Input type="date" value={formData.sortie7Date} onChange={(e) => handleInputChange('sortie7Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 8</Label>
                          <Input type="date" value={formData.sortie8Date} onChange={(e) => handleInputChange('sortie8Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Module 10</Label>
                          <Input type="date" value={formData.module10Date} onChange={(e) => handleInputChange('module10Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 9</Label>
                          <Input type="date" value={formData.sortie9Date} onChange={(e) => handleInputChange('sortie9Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 10</Label>
                          <Input type="date" value={formData.sortie10Date} onChange={(e) => handleInputChange('sortie10Date', e.target.value)} className="text-xs px-1" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Phase 4</CardTitle>
                      <CardDescription>Module 11-12 + Sorties 11-15</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Module 11</Label>
                          <Input type="date" value={formData.module11Date} onChange={(e) => handleInputChange('module11Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 11</Label>
                          <Input type="date" value={formData.sortie11Date} onChange={(e) => handleInputChange('sortie11Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 12</Label>
                          <Input type="date" value={formData.sortie12Date} onChange={(e) => handleInputChange('sortie12Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 13</Label>
                          <Input type="date" value={formData.sortie13Date} onChange={(e) => handleInputChange('sortie13Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Module 12</Label>
                          <Input type="date" value={formData.module12Date} onChange={(e) => handleInputChange('module12Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 14</Label>
                          <Input type="date" value={formData.sortie14Date} onChange={(e) => handleInputChange('sortie14Date', e.target.value)} className="text-xs px-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Sortie 15</Label>
                          <Input type="date" value={formData.sortie15Date} onChange={(e) => handleInputChange('sortie15Date', e.target.value)} className="text-xs px-1" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Generate Button */}
              <Button
                size="lg"
                className="w-full"
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
                    <Download className="h-4 w-4 mr-2" />
                    Generate & Download Certificate
                  </>
                )}
              </Button>

              {pdfMutation.isError && (
                <p className="text-destructive text-sm text-center">
                  Failed to generate PDF. Please try again.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
