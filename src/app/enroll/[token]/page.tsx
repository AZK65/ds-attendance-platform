'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Calendar,
} from 'lucide-react'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'

type PageStatus = 'loading' | 'form' | 'submitting' | 'submitted' | 'expired' | 'error'

interface FormData {
  fullName: string
  phoneNumber: string
  permitNumber: string
  fullAddress: string
  city: string
  postalCode: string
  dob: string
  email: string
}

const EMPTY_FORM: FormData = {
  fullName: '',
  phoneNumber: '',
  permitNumber: '',
  fullAddress: '',
  city: 'Montréal',
  postalCode: '',
  dob: '',
  email: '',
}

export default function EnrollPage() {
  const params = useParams()
  const token = params.token as string

  const [pageStatus, setPageStatus] = useState<PageStatus>('loading')
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, boolean>>>({})

  // Check token status on load
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`/api/enroll/${token}`)
        if (res.status === 410) {
          setPageStatus('expired')
          return
        }
        if (res.status === 404) {
          setError('This registration link is not valid.')
          setPageStatus('error')
          return
        }
        if (!res.ok) {
          setError('Something went wrong. Please try again.')
          setPageStatus('error')
          return
        }
        const data = await res.json()
        if (data.status === 'submitted' || data.status === 'confirmed') {
          setPageStatus('submitted')
        } else if (data.status === 'pending_scan') {
          setPageStatus('form')
        } else {
          setPageStatus('expired')
        }
      } catch {
        setError('Unable to connect. Please check your internet connection.')
        setPageStatus('error')
      }
    }
    checkStatus()
  }, [token])

  const updateField = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setFieldErrors(prev => ({ ...prev, [field]: false }))
  }

  const handleSubmit = async () => {
    // Validate all fields
    const required: (keyof FormData)[] = [
      'fullName', 'phoneNumber', 'permitNumber', 'fullAddress',
      'city', 'postalCode', 'dob', 'email',
    ]
    const errors: Partial<Record<keyof FormData, boolean>> = {}
    let hasError = false
    for (const field of required) {
      if (!formData[field]?.trim()) {
        errors[field] = true
        hasError = true
      }
    }
    setFieldErrors(errors)
    if (hasError) return

    setPageStatus('submitting')
    setError('')

    try {
      const res = await fetch(`/api/enroll/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.status === 410) {
        setPageStatus('expired')
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to submit. Please try again.')
        setPageStatus('form')
        return
      }

      setPageStatus('submitted')
    } catch {
      setError('Unable to submit. Please check your internet connection.')
      setPageStatus('form')
    }
  }

  // Loading state
  if (pageStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Expired state
  if (pageStatus === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Link Expired</h2>
            <p className="text-muted-foreground">
              This registration link has expired. Please ask the school to generate a new QR code.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (pageStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Submitted state
  if (pageStatus === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/qazi-logo.png"
              alt="Qazi Driving School"
              className="h-10 w-auto mx-auto mb-4"
            />
            <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Registration Submitted!</h2>
            <p className="text-muted-foreground">
              Thank you! Your information has been submitted. The school will review and confirm your registration.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              You can close this page now.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Form state (pending_scan or submitting)
  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header with logo */}
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qazi-logo.png"
            alt="Qazi Driving School"
            className="h-12 w-auto mx-auto mb-3"
          />
          <h1 className="text-xl font-bold">Student Registration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Please fill in your information below
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Your Information</CardTitle>
            <CardDescription>All fields are required</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Full Name */}
            <div>
              <Label htmlFor="fullName" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <User className="h-3.5 w-3.5" />
                Full Name
              </Label>
              <Input
                id="fullName"
                placeholder="Your full name"
                value={formData.fullName}
                onChange={e => updateField('fullName', e.target.value)}
                className={fieldErrors.fullName ? 'border-destructive' : ''}
                autoComplete="name"
              />
              {fieldErrors.fullName && <p className="text-xs text-destructive mt-1">Full name is required</p>}
            </div>

            {/* Phone */}
            <div>
              <Label htmlFor="phoneNumber" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Phone className="h-3.5 w-3.5" />
                Phone Number
              </Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="514-555-1234"
                value={formData.phoneNumber}
                onChange={e => updateField('phoneNumber', e.target.value)}
                className={fieldErrors.phoneNumber ? 'border-destructive' : ''}
                autoComplete="tel"
              />
              {fieldErrors.phoneNumber && <p className="text-xs text-destructive mt-1">Phone number is required</p>}
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={e => updateField('email', e.target.value)}
                className={fieldErrors.email ? 'border-destructive' : ''}
                autoComplete="email"
              />
              {fieldErrors.email && <p className="text-xs text-destructive mt-1">Email is required</p>}
            </div>

            {/* Permit Number */}
            <div>
              <Label htmlFor="permitNumber" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                Permit Number
              </Label>
              <Input
                id="permitNumber"
                placeholder="Q1234-567890-01"
                value={formData.permitNumber}
                onChange={e => updateField('permitNumber', e.target.value)}
                className={fieldErrors.permitNumber ? 'border-destructive' : ''}
              />
              {fieldErrors.permitNumber && <p className="text-xs text-destructive mt-1">Permit number is required</p>}
            </div>

            {/* Date of Birth */}
            <div>
              <Label htmlFor="dob" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Date of Birth
              </Label>
              <Input
                id="dob"
                type="date"
                value={formData.dob}
                onChange={e => updateField('dob', e.target.value)}
                className={fieldErrors.dob ? 'border-destructive' : ''}
              />
              {fieldErrors.dob && <p className="text-xs text-destructive mt-1">Date of birth is required</p>}
            </div>

            {/* Address with Google Places autocomplete */}
            <div>
              <Label htmlFor="fullAddress" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Address
              </Label>
              <AddressAutocomplete
                id="fullAddress"
                value={formData.fullAddress}
                onChange={val => updateField('fullAddress', val)}
                onAddressSelect={result => {
                  if (result.city) updateField('city', result.city)
                  if (result.postalCode) updateField('postalCode', result.postalCode)
                }}
                placeholder="Start typing your address..."
                className={fieldErrors.fullAddress ? 'border-destructive' : ''}
              />
              {fieldErrors.fullAddress && <p className="text-xs text-destructive mt-1">Address is required</p>}
            </div>

            {/* City + Postal Code side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="city" className="text-sm font-medium mb-1.5">City</Label>
                <Input
                  id="city"
                  placeholder="Montréal"
                  value={formData.city}
                  onChange={e => updateField('city', e.target.value)}
                  className={fieldErrors.city ? 'border-destructive' : ''}
                  autoComplete="address-level2"
                />
                {fieldErrors.city && <p className="text-xs text-destructive mt-1">Required</p>}
              </div>
              <div>
                <Label htmlFor="postalCode" className="text-sm font-medium mb-1.5">Postal Code</Label>
                <Input
                  id="postalCode"
                  placeholder="H1A 2B3"
                  value={formData.postalCode}
                  onChange={e => updateField('postalCode', e.target.value)}
                  className={fieldErrors.postalCode ? 'border-destructive' : ''}
                  autoComplete="postal-code"
                />
                {fieldErrors.postalCode && <p className="text-xs text-destructive mt-1">Required</p>}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Submit button */}
            <Button
              className="w-full h-12 text-base"
              onClick={handleSubmit}
              disabled={pageStatus === 'submitting'}
            >
              {pageStatus === 'submitting' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                'Submit Registration'
              )}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Your information will be reviewed by the school before being registered.
        </p>
      </div>
    </div>
  )
}
