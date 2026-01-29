'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, Loader2, Settings, FileText, Upload, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

interface CertificateSettings {
  id: string
  nextContractNumber: number
  nextAttestationNumber: number
  attestationNumberEnd: number
  schoolName: string
  schoolAddress: string
  schoolCity: string
  schoolProvince: string
  schoolPostalCode: string
  schoolNumber: string
}

export default function CertificateSettingsPage() {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Partial<CertificateSettings>>({
    nextContractNumber: 1,
    nextAttestationNumber: 1,
    attestationNumberEnd: 9999,
    schoolName: 'École de Conduite Qazi',
    schoolAddress: '786 rue Jean-Talon Ouest',
    schoolCity: 'Montréal',
    schoolProvince: 'QC',
    schoolPostalCode: 'H3N 1S2',
    schoolNumber: 'L526',
  })
  const [blankTemplate, setBlankTemplate] = useState<File | null>(null)
  const [templateUploaded, setTemplateUploaded] = useState(false)

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['certificate-settings'],
    queryFn: async () => {
      const res = await fetch('/api/certificate/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      return res.json() as Promise<CertificateSettings>
    }
  })

  // Check if template exists
  const { data: templateStatus } = useQuery({
    queryKey: ['certificate-template-status'],
    queryFn: async () => {
      const res = await fetch('/api/certificate/template')
      if (res.status === 404) return { exists: false }
      if (!res.ok) throw new Error('Failed to check template')
      return { exists: true }
    }
  })

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  // Update template uploaded state
  useEffect(() => {
    if (templateStatus?.exists) {
      setTemplateUploaded(true)
    }
  }, [templateStatus])

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<CertificateSettings>) => {
      const res = await fetch('/api/certificate/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Failed to save settings')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-settings'] })
    }
  })

  // Upload template mutation
  const uploadTemplateMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/certificate/template', {
        method: 'POST',
        body: formData
      })
      if (!res.ok) throw new Error('Failed to upload template')
      return res.json()
    },
    onSuccess: () => {
      setTemplateUploaded(true)
      queryClient.invalidateQueries({ queryKey: ['certificate-template-status'] })
    }
  })

  const handleInputChange = (field: keyof CertificateSettings, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setBlankTemplate(file)
      uploadTemplateMutation.mutate(file)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/certificate">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Certificate Settings</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Blank Template Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Blank Certificate Template
              </CardTitle>
              <CardDescription>
                Upload a blank certificate PDF to use as the default template for new certificates.
                This template will be used when creating a &quot;New Certificate&quot; instead of uploading one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleTemplateUpload}
                  className="hidden"
                  id="template-upload"
                />
                <label htmlFor="template-upload" className="cursor-pointer">
                  {templateUploaded || blankTemplate ? (
                    <div className="space-y-2">
                      <FileText className="h-10 w-10 mx-auto text-primary" />
                      <div className="flex items-center justify-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {blankTemplate?.name || 'Template uploaded'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Click to replace</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p className="font-medium">Click to upload blank template</p>
                      <p className="text-sm text-muted-foreground">PDF file without barcode</p>
                    </div>
                  )}
                </label>
              </div>
              {uploadTemplateMutation.isPending && (
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </p>
              )}
              {uploadTemplateMutation.isError && (
                <p className="text-sm text-destructive mt-2">Failed to upload template</p>
              )}
            </CardContent>
          </Card>

          {/* Certificate Number Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Certificate Numbering
              </CardTitle>
              <CardDescription>
                Configure the starting numbers for contracts and attestations.
                Numbers will auto-increment with each certificate generated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nextContractNumber">Next Contract Number</Label>
                  <Input
                    id="nextContractNumber"
                    type="number"
                    min={1}
                    value={formData.nextContractNumber || ''}
                    onChange={(e) => handleInputChange('nextContractNumber', parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Current: {settings?.nextContractNumber || 1}</p>
                </div>
                <div>
                  <Label htmlFor="nextAttestationNumber">Next Attestation Number</Label>
                  <Input
                    id="nextAttestationNumber"
                    type="number"
                    min={1}
                    value={formData.nextAttestationNumber || ''}
                    onChange={(e) => handleInputChange('nextAttestationNumber', parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">For barcode generation</p>
                </div>
              </div>
              <div>
                <Label htmlFor="attestationNumberEnd">Attestation Number End</Label>
                <Input
                  id="attestationNumberEnd"
                  type="number"
                  min={formData.nextAttestationNumber || 1}
                  value={formData.attestationNumberEnd || ''}
                  onChange={(e) => handleInputChange('attestationNumberEnd', parseInt(e.target.value) || 9999)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Range: {formData.nextAttestationNumber} - {formData.attestationNumberEnd}
                  ({(formData.attestationNumberEnd || 9999) - (formData.nextAttestationNumber || 1) + 1} certificates remaining)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* School Information */}
          <Card>
            <CardHeader>
              <CardTitle>School Information</CardTitle>
              <CardDescription>
                Default school details used when generating certificates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="schoolName">School Name</Label>
                  <Input
                    id="schoolName"
                    value={formData.schoolName || ''}
                    onChange={(e) => handleInputChange('schoolName', e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="schoolAddress">Address</Label>
                  <Input
                    id="schoolAddress"
                    value={formData.schoolAddress || ''}
                    onChange={(e) => handleInputChange('schoolAddress', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="schoolCity">City</Label>
                  <Input
                    id="schoolCity"
                    value={formData.schoolCity || ''}
                    onChange={(e) => handleInputChange('schoolCity', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="schoolProvince">Province</Label>
                    <Input
                      id="schoolProvince"
                      value={formData.schoolProvince || ''}
                      onChange={(e) => handleInputChange('schoolProvince', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="schoolPostalCode">Postal Code</Label>
                    <Input
                      id="schoolPostalCode"
                      value={formData.schoolPostalCode || ''}
                      onChange={(e) => handleInputChange('schoolPostalCode', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="schoolNumber">School Number</Label>
                  <Input
                    id="schoolNumber"
                    value={formData.schoolNumber || ''}
                    onChange={(e) => handleInputChange('schoolNumber', e.target.value)}
                    placeholder="L526"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {saveMutation.isSuccess && (
            <p className="text-sm text-green-600 text-center">Settings saved successfully!</p>
          )}
          {saveMutation.isError && (
            <p className="text-sm text-destructive text-center">Failed to save settings. Please try again.</p>
          )}
        </div>
      </main>
    </div>
  )
}
