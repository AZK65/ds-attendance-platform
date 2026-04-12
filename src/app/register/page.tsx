'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  User, Phone, MapPin, Camera, FileText, PenTool,
  ArrowRight, ArrowLeft, Loader2, CheckCircle2, Upload,
  AlertCircle,
} from 'lucide-react'

type Step = 'personal' | 'address' | 'documents' | 'agreements' | 'submitting' | 'done'

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'personal', label: 'Personal Info', icon: User },
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'agreements', label: 'Agreement', icon: PenTool },
]

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('personal')
  const [error, setError] = useState('')

  // Form data
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('Montreal')
  const [province, setProvince] = useState('QC')
  const [postalCode, setPostalCode] = useState('')
  const [permitNumber, setPermitNumber] = useState('')
  const [permitImage, setPermitImage] = useState<string | null>(null)
  const [idImage, setIdImage] = useState<string | null>(null)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPolicy, setAgreedPolicy] = useState(false)

  const permitInputRef = useRef<HTMLInputElement>(null)
  const idInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  // Signature canvas
  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsDrawing(true)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.lineTo(x, y)
    ctx.stroke()
  }, [isDrawing])

  const stopDrawing = useCallback(() => {
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      setSignatureImage(canvas.toDataURL('image/png'))
    }
  }, [])

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureImage(null)
  }

  // Set canvas size on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }
  }, [step])

  const handleImageUpload = (setter: (v: string | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Compress if needed
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxSize = 1200
        let w = img.width, h = img.height
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = (h / w) * maxSize; w = maxSize }
          else { w = (w / h) * maxSize; h = maxSize }
        }
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
        setter(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const stepIndex = STEPS.findIndex(s => s.key === step)

  const canProceed = () => {
    switch (step) {
      case 'personal': return fullName.trim().length >= 2 && phoneNumber.replace(/\D/g, '').length >= 10
      case 'address': return true // address is optional
      case 'documents': return true // documents are optional
      case 'agreements': return agreedTerms && agreedPolicy && signatureImage
      default: return false
    }
  }

  const nextStep = () => {
    setError('')
    const idx = STEPS.findIndex(s => s.key === step)
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].key)
    } else {
      handleSubmit()
    }
  }

  const prevStep = () => {
    const idx = STEPS.findIndex(s => s.key === step)
    if (idx > 0) setStep(STEPS[idx - 1].key)
  }

  const handleSubmit = async () => {
    setStep('submitting')
    setError('')

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName, phoneNumber, email, dob,
          address, city, province, postalCode,
          permitNumber, permitImage, idImage,
          signatureImage, agreedToTerms: agreedTerms && agreedPolicy,
        }),
      })

      if (res.ok) {
        setStep('done')
      } else {
        const data = await res.json()
        setError(data.error || 'Registration failed')
        setStep('agreements')
      }
    } catch {
      setError('Network error. Please try again.')
      setStep('agreements')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold">Student Registration</h1>
          <p className="text-sm text-muted-foreground mt-1">Qazi Driving School</p>
        </motion.div>

        {/* Progress */}
        {step !== 'submitting' && step !== 'done' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-between mb-8 px-2"
          >
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center">
                <div className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-medium transition-all ${
                  i < stepIndex ? 'bg-green-500 text-white' :
                  i === stepIndex ? 'bg-primary text-primary-foreground scale-110' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {i < stepIndex ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 sm:w-12 h-0.5 mx-1 ${i < stepIndex ? 'bg-green-500' : 'bg-muted'}`} />
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 text-red-700 dark:text-red-400 text-sm flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Steps */}
        <AnimatePresence mode="wait">
          {step === 'personal' && (
            <motion.div
              key="personal"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2"><User className="h-5 w-5" /> Personal Information</h2>

              <div>
                <Label>Full Name *</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="First and Last Name" className="mt-1" autoFocus />
              </div>

              <div>
                <Label>Phone Number *</Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="(514) 123-4567" className="pl-10" type="tel" />
                </div>
              </div>

              <div>
                <Label>Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className="mt-1" type="email" />
              </div>

              <div>
                <Label>Date of Birth</Label>
                <Input value={dob} onChange={e => setDob(e.target.value)} className="mt-1" type="date" />
              </div>
            </motion.div>
          )}

          {step === 'address' && (
            <motion.div
              key="address"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2"><MapPin className="h-5 w-5" /> Address</h2>

              <div>
                <Label>Street Address</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main Street, Apt 4" className="mt-1" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>City</Label>
                  <Input value={city} onChange={e => setCity(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Province</Label>
                  <Input value={province} onChange={e => setProvince(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div>
                <Label>Postal Code</Label>
                <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="H1N 1K4" className="mt-1" />
              </div>
            </motion.div>
          )}

          {step === 'documents' && (
            <motion.div
              key="documents"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2"><FileText className="h-5 w-5" /> Documents</h2>
              <p className="text-sm text-muted-foreground">Upload photos of your learner's permit and ID (optional but recommended)</p>

              <div>
                <Label>Learner&apos;s Permit Number</Label>
                <Input value={permitNumber} onChange={e => setPermitNumber(e.target.value)} placeholder="N1234-567890-01" className="mt-1 font-mono" />
              </div>

              {/* Permit Photo */}
              <div>
                <Label>Learner&apos;s Permit Photo</Label>
                <input ref={permitInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload(setPermitImage)} />
                {permitImage ? (
                  <div className="mt-2 relative">
                    <img src={permitImage} alt="Permit" className="w-full rounded-lg border" />
                    <Button variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => setPermitImage(null)}>Remove</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => permitInputRef.current?.click()}
                    className="mt-2 w-full border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors"
                  >
                    <Camera className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Take Photo or Upload</p>
                    <p className="text-xs text-muted-foreground mt-1">Tap to open camera</p>
                  </button>
                )}
              </div>

              {/* ID Photo */}
              <div>
                <Label>Government ID Photo</Label>
                <input ref={idInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload(setIdImage)} />
                {idImage ? (
                  <div className="mt-2 relative">
                    <img src={idImage} alt="ID" className="w-full rounded-lg border" />
                    <Button variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => setIdImage(null)}>Remove</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => idInputRef.current?.click()}
                    className="mt-2 w-full border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors"
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Take Photo or Upload</p>
                    <p className="text-xs text-muted-foreground mt-1">Passport, health card, or other government ID</p>
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {step === 'agreements' && (
            <motion.div
              key="agreements"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2"><PenTool className="h-5 w-5" /> Agreement & Signature</h2>

              <div className="space-y-3 p-4 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium">By registering, you agree to:</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>- Follow all school policies and regulations</li>
                  <li>- Attend scheduled classes on time</li>
                  <li>- Provide accurate personal information</li>
                  <li>- Notify the school of any changes to your information</li>
                  <li>- Pay all fees as outlined in the course agreement</li>
                </ul>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox id="terms" checked={agreedTerms} onCheckedChange={v => setAgreedTerms(!!v)} className="mt-0.5" />
                  <label htmlFor="terms" className="text-sm cursor-pointer">I agree to the terms and conditions of Qazi Driving School *</label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox id="policy" checked={agreedPolicy} onCheckedChange={v => setAgreedPolicy(!!v)} className="mt-0.5" />
                  <label htmlFor="policy" className="text-sm cursor-pointer">I confirm that all information provided is accurate *</label>
                </div>
              </div>

              {/* Signature */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Signature *</Label>
                  {signatureImage && (
                    <Button variant="ghost" size="sm" onClick={clearSignature} className="text-xs">Clear</Button>
                  )}
                </div>
                <div className="mt-2 border-2 rounded-lg bg-white dark:bg-gray-900 relative" style={{ touchAction: 'none' }}>
                  <canvas
                    ref={canvasRef}
                    className="w-full cursor-crosshair"
                    style={{ height: 150 }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {!signatureImage && (
                    <p className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
                      Draw your signature here
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 'submitting' && (
            <motion.div
              key="submitting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
              <p className="font-medium">Submitting your registration...</p>
              <p className="text-sm text-muted-foreground mt-1">Please wait</p>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              >
                <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
              </motion.div>
              <h2 className="text-xl font-bold mb-2">Registration Submitted!</h2>
              <p className="text-muted-foreground">Thank you for registering with Qazi Driving School.</p>
              <p className="text-muted-foreground mt-1">We will review your registration and contact you shortly.</p>
              <p className="text-sm text-muted-foreground mt-4">You can close this page now.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons */}
        {step !== 'submitting' && step !== 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-between mt-8"
          >
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={stepIndex === 0}
              className={stepIndex === 0 ? 'invisible' : ''}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>

            <Button
              onClick={nextStep}
              disabled={!canProceed()}
            >
              {stepIndex === STEPS.length - 1 ? 'Submit Registration' : <>Next <ArrowRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </motion.div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          Qazi Driving School - Montreal, QC
        </p>
      </div>
    </div>
  )
}
