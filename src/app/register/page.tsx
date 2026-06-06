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
  AlertCircle, CreditCard, Receipt, Car, Truck, Clock,
  Shield,
} from 'lucide-react'
import NextImage from 'next/image'
import { QaziNav } from '@/components/qazi-nav'
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad'
import { QaziFooter } from '@/components/qazi-footer'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { LangProvider, useT } from './i18n'

type Step =
  | 'select'
  | 'truck-contact'
  | 'personal'
  | 'address'
  | 'documents'
  | 'agreements'
  | 'rep-handoff'    // truck only — "hand the iPad to the school rep"
  | 'rep-sign'       // truck only — rep signs
  | 'payment-method' // truck only — pick cash or card before Clover
  | 'payment'
  | 'submitting'
  | 'done'

// Default flow (car). Truck inserts rep-handoff + rep-sign + payment-method
// before payment — computed dynamically below so the progress bar reflects
// the right path.
const CAR_STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'personal', label: 'Personal Info', icon: User },
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'agreements', label: 'Agreement', icon: PenTool },
  { key: 'payment', label: 'Payment', icon: CreditCard },
]
const TRUCK_STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'personal', label: 'Personal Info', icon: User },
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'agreements', label: 'Student Sign', icon: PenTool },
  { key: 'rep-handoff', label: 'Hand to School', icon: User },
  { key: 'rep-sign', label: 'School Sign', icon: PenTool },
  { key: 'payment-method', label: 'Payment Method', icon: CreditCard },
  { key: 'payment', label: 'Payment', icon: CreditCard },
]

const PAYMENT_SCHEDULE = [
  { num: 1, amount: 250, phase: 'On Registration', roadClass: null, first: true },
  { num: 2, amount: 150, phase: '1st Certificate', roadClass: null },
  { num: 3, amount: 150, phase: 'Phase 2', roadClass: 'Road Class 1' },
  { num: 4, amount: 150, phase: 'Phase 3', roadClass: 'Road Class 6' },
  { num: 5, amount: 150, phase: 'Phase 3', roadClass: 'Road Class 9' },
  { num: 6, amount: 150, phase: 'Phase 4', roadClass: 'Road Class 12' },
]

export default function RegisterPage() {
  return (
    <LangProvider>
      <RegisterPageInner />
    </LangProvider>
  )
}

/**
 * Inner component, exported so the iPad kiosk route can reuse the
 * whole multi-step flow without duplicating 800+ lines of state. The
 * `kiosk` prop toggles chrome — no QaziNav/Footer, beefier touch
 * targets on the select screen, auto-reset back to select after a
 * completed submission so the next walk-in starts fresh.
 */
export function RegisterPageInner({ kiosk = false }: { kiosk?: boolean } = {}) {
  const { t } = useT()
  const [step, setStep] = useState<Step>('select')
  const [error, setError] = useState('')
  // Whether the visitor is logged in as admin. Drives admin-only paths
  // like the truck registration form. Checked once on mount.
  const [isAdmin, setIsAdmin] = useState(false)
  // Tracks which path the student is on. "car" is the default (anyone);
  // "truck" can only be selected by an admin.
  const [vehicleType, setVehicleType] = useState<'car' | 'truck'>('car')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth')
        if (!cancelled && res.ok) {
          const data = await res.json()
          setIsAdmin(!!data.authed)
        }
      } catch { /* not authed — public mode */ }
    })()
    return () => { cancelled = true }
  }, [])

  // In kiosk mode, after a successful submission the next walk-in student
  // shouldn't see the previous student's confirmation screen. Reset back
  // to the select screen after a short pause so they can read "thank you"
  // first.
  useEffect(() => {
    if (!kiosk) return
    if (step !== 'done') return
    const timer = setTimeout(() => {
      setStep('select')
      setError('')
      setFullName(''); setPhoneNumber(''); setEmail(''); setDob('')
      setAddress(''); setCity('Montreal'); setProvince('QC'); setPostalCode('')
      setPermitNumber(''); setPermitExpiry(''); setPermitImage(null); setIdImage(null); setAvatarImage(null)
      setSignatureImage(null); setAgreedTerms(false); setAgreedPolicy(false)
      setVehicleType('car')
      setConsentSaaqTransmission(false); setConsentFileTransfer(false)
      setConsentContactInfo(false); setSignedAtPlace('Montréal'); setFirstCourseDate('')
    }, 15_000)
    return () => clearTimeout(timer)
  }, [kiosk, step])

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
  const [permitExpiry, setPermitExpiry] = useState('')
  const [permitImage, setPermitImage] = useState<string | null>(null)
  const [permitOcrLoading, setPermitOcrLoading] = useState(false)
  const [idImage, setIdImage] = useState<string | null>(null)
  // Student selfie used as the avatar on every student profile page in
  // the admin app. Captured via the iPad's front camera (capture="user").
  const [avatarImage, setAvatarImage] = useState<string | null>(null)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPolicy, setAgreedPolicy] = useState(false)
  // Truck-only state — these capture the extra fields the SAAQ Class 1
  // service contract requires. Ignored when vehicleType === 'car'.
  const [consentSaaqTransmission, setConsentSaaqTransmission] = useState(false)
  const [consentFileTransfer, setConsentFileTransfer] = useState(false)
  const [consentContactInfo, setConsentContactInfo] = useState(false)
  const [signedAtPlace, setSignedAtPlace] = useState('Montréal')
  const [firstCourseDate, setFirstCourseDate] = useState('')
  // Rep counter-signature captured at the iPad (rep-sign step).
  const [repSignatureDataUrl, setRepSignatureDataUrl] = useState<string | null>(null)
  const [repName, setRepName] = useState('')
  // Truck initial-fee payment method choice — drives whether we run the
  // Clover Hosted Checkout step or just record cash and submit.
  const [truckPaymentMethod, setTruckPaymentMethod] = useState<'cash' | 'card' | ''>('')

  const permitInputRef = useRef<HTMLInputElement>(null)
  const idInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  // SignaturePad imperatives — used to clear strokes from outside.
  const studentSigRef = useRef<SignaturePadHandle>(null)
  const repSigRef = useRef<SignaturePadHandle>(null)

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

  // Fire OCR on a compressed licence image. Auto-fills permit number,
  // expiry, DOB, name and address — but only sets fields the student
  // hasn't already typed in themselves so we don't clobber their input.
  const runLicenceOcr = useCallback(async (dataUrl: string) => {
    setPermitOcrLoading(true)
    try {
      const res = await fetch('/api/register/ocr-licence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceImage: dataUrl }),
      })
      if (!res.ok) return
      const data = await res.json() as { licenceNumber?: string; expiryDate?: string; dob?: string; name?: string; address?: string }
      if (data.licenceNumber) setPermitNumber(prev => prev || data.licenceNumber || '')
      if (data.expiryDate) setPermitExpiry(prev => prev || data.expiryDate || '')
      if (data.dob) setDob(prev => prev || data.dob || '')
      if (data.name) setFullName(prev => prev || data.name || '')
      if (data.address) setAddress(prev => prev || data.address || '')
    } catch (err) {
      console.warn('Licence OCR failed:', err)
    } finally {
      setPermitOcrLoading(false)
    }
  }, [])

  const handleImageUpload = (setter: (v: string | null) => void, opts: { ocr?: boolean } = {}) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Compress if needed
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        // Match the certificate flow's settings (2500px / 0.85). At the old
        // 1200px / 0.7 the small Quebec licence number was too degraded for
        // the OCR model to read, so it returned empty fields.
        const maxSize = 2500
        let w = img.width, h = img.height
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = (h / w) * maxSize; w = maxSize }
          else { w = (w / h) * maxSize; h = maxSize }
        }
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
        const compressed = canvas.toDataURL('image/jpeg', 0.85)
        setter(compressed)
        if (opts.ocr) runLicenceOcr(compressed)
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // Switch which steps appear in the progress bar / next-prev navigation
  // based on whether the visitor is going down the car or truck path.
  const STEPS = vehicleType === 'truck' ? TRUCK_STEPS : CAR_STEPS
  const stepIndex = STEPS.findIndex(s => s.key === step)

  const canProceed = () => {
    switch (step) {
      case 'personal': return fullName.trim().length >= 2 && phoneNumber.replace(/\D/g, '').length >= 10
      case 'address': return province.trim().toUpperCase() === 'QC'
      // Driver licence + ID + selfie photos all required for both car and
      // truck. The selfie becomes the avatar on every student profile page.
      case 'documents': return !!permitImage && !!idImage && !!avatarImage
      case 'agreements': {
        const base = agreedTerms && agreedPolicy && signatureImage
        if (vehicleType !== 'truck') return base
        // Truck adds 3 SAAQ consents + first-course date + signed-at place.
        return base
          && consentSaaqTransmission
          && consentFileTransfer
          && consentContactInfo
          && !!firstCourseDate
          && signedAtPlace.trim().length >= 2
      }
      case 'rep-handoff': return true
      case 'rep-sign': return !!repSignatureDataUrl && repName.trim().length >= 2
      case 'payment-method': return truckPaymentMethod === 'cash' || truckPaymentMethod === 'card'
      case 'payment': return true
      default: return false
    }
  }

  const nextStep = () => {
    setError('')
    const idx = STEPS.findIndex(s => s.key === step)
    if (step === 'payment') {
      handleSubmit()
      return
    }
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].key)
    }
  }

  const prevStep = () => {
    if (step === 'personal') {
      setStep('select')
      return
    }
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
          permitNumber, permitExpiry, permitImage, idImage, avatarImage,
          signatureImage, agreedToTerms: agreedTerms && agreedPolicy,
          vehicleType, // server cross-checks against the admin cookie
          // Truck-only — server ignores these when vehicleType === 'car'
          consentSaaqTransmission, consentFileTransfer, consentContactInfo,
          signedAtPlace, firstCourseDate,
          repSignatureDataUrl, repName,
          truckPaymentMethod,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Registration failed')
        setStep('payment')
        return
      }

      const { registrationId } = await res.json()

      // Truck + cash → no Clover checkout. Registration is already saved
      // with truckPaymentMethod='cash' so the admin sees the cash flag in
      // the review dialog. Go straight to the done screen.
      if (vehicleType === 'truck' && truckPaymentMethod === 'cash') {
        setStep('done')
        return
      }

      // Attempt to create a Clover checkout link for the first payment
      try {
        const checkoutRes = await fetch('/api/register/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId }),
        })
        if (checkoutRes.ok) {
          const { paymentUrl } = await checkoutRes.json()
          if (paymentUrl) {
            window.location.href = paymentUrl
            return
          }
        }
      } catch {
        // Fall through to done — registration succeeded even if checkout failed
      }

      setStep('done')
    } catch {
      setError('Network error. Please try again.')
      setStep('payment')
    }
  }

  return (
    <div className={`min-h-screen bg-[#F7F7F5] text-[#0B0B0F] ${kiosk ? 'kiosk-mode' : ''}`}>
      {!kiosk && <QaziNav />}
      {kiosk && (
        // Kiosk header — just the logo in the corner so the iPad is
        // unmistakably branded but stays focused on the form.
        <div className="absolute top-5 left-5 z-20">
          <NextImage
            src="/qazi-logo.png"
            alt="Qazi Driving School"
            width={96}
            height={36}
            priority
            className="h-9 w-auto drop-shadow"
          />
        </div>
      )}
      {/* Hero */}
      {!kiosk && (
      <section className="relative overflow-hidden bg-[#0B0B0F] text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at top left, rgba(225,29,46,0.45) 0%, transparent 55%), radial-gradient(ellipse at bottom right, rgba(30,58,138,0.45) 0%, transparent 55%)',
          }}
        />
        <div className="relative mx-auto max-w-2xl px-6 pt-20 pb-14 md:pt-28 md:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 text-[12px] tracking-[0.18em] uppercase text-white/60"
          >
            <span className="h-px w-10 bg-white/40" />
            {t.hero.eyebrow}
          </motion.div>

          <h1 className="mt-6 text-[44px] md:text-[64px] leading-[0.92] tracking-[-0.04em] max-w-[14ch] font-sans">
            <motion.span
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="block"
            >
              {t.hero.h1a}
            </motion.span>
            <motion.span
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="block font-serif italic font-normal text-[#E11D2E]"
            >
              {t.hero.h1Accent}
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-6 max-w-[52ch] text-[15px] md:text-[16px] leading-[1.6] text-white/75"
          >
            {t.hero.lead}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-10 grid gap-3 sm:grid-cols-2 max-w-[640px]"
          >
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                {t.hero.class5Label}
              </div>
              <div className="mt-2 font-sans text-[22px] font-medium tracking-tight text-white">
                {t.hero.class5Date}
              </div>
              <div className="mt-1 text-[12px] text-white/55">
                {t.hero.class5Cadence}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-5 py-4 flex flex-col">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                {t.hero.truckLabel}
              </div>
              <div className="mt-2 text-[15px] text-white/85 leading-snug">
                {t.hero.truckNote}
              </div>
              <a
                href={`${process.env.NEXT_PUBLIC_MARKETING_URL || ''}/#contact`}
                className="mt-2 inline-flex items-center gap-1 text-[13px] text-white/85 hover:text-[#E11D2E] transition-colors self-start"
              >
                {t.hero.truckCta} <span aria-hidden>→</span>
              </a>
            </div>
          </motion.div>
        </div>
      </section>
      )}

      <div className={kiosk ? 'max-w-2xl mx-auto px-6 py-8' : 'max-w-2xl mx-auto px-6 py-10 md:py-14'}>

        {/* Progress — three high-level phases with a sub-step dot row
            under the active phase so the long truck flow doesn't turn
            into 8 cramped columns. */}
        {step !== 'submitting' && step !== 'done' && step !== 'select' && step !== 'truck-contact' && (() => {
          // Phase membership — driven by step key so it works for both
          // car (5 steps) and truck (8 steps) without separate config.
          const phases: { key: 'info' | 'agreement' | 'payment'; label: string; icon: React.ElementType; steps: Step[] }[] = [
            { key: 'info', label: t.steps.personal, icon: User, steps: ['personal', 'address', 'documents'] },
            { key: 'agreement', label: t.steps.agreement, icon: PenTool, steps: ['agreements', 'rep-handoff', 'rep-sign'] },
            { key: 'payment', label: t.steps.payment, icon: CreditCard, steps: ['payment-method', 'payment'] },
          ]
          const activePhaseIdx = phases.findIndex(p => p.steps.includes(step))
          const activePhase = phases[activePhaseIdx]
          // Sub-step index within the active phase, scoped to whatever
          // steps actually appear in the current STEPS list (so the row
          // only shows dots that the car flow doesn't skip).
          const subSteps = (activePhase?.steps ?? []).filter(s => STEPS.some(x => x.key === s))
          const subIdx = subSteps.indexOf(step as Step)
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-10"
            >
              <div className="flex items-start justify-between px-1">
                {phases.map((p, i) => {
                  const isActive = i === activePhaseIdx
                  const isDone = i < activePhaseIdx
                  return (
                    <div key={p.key} className="flex items-start flex-1 min-w-0">
                      <div className="flex flex-col items-center gap-2 min-w-0">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-all shrink-0 ${
                          isDone ? 'bg-[#E11D2E] text-white' :
                          isActive ? 'bg-[#0B0B0F] text-white scale-110' :
                          'bg-white border border-ink/10 text-ink/40'
                        }`}>
                          {isDone ? <CheckCircle2 className="h-5 w-5" /> : <p.icon className="h-4.5 w-4.5" />}
                        </div>
                        <span className={`text-[11px] uppercase tracking-[0.14em] text-center leading-tight transition-colors ${
                          isActive ? 'text-ink font-semibold' : isDone ? 'text-[#E11D2E]' : 'text-ink/40'
                        }`}>
                          {p.label}
                        </span>
                      </div>
                      {i < phases.length - 1 && (
                        <div className={`flex-1 h-px mt-[20px] mx-2 sm:mx-3 ${isDone ? 'bg-[#E11D2E]' : 'bg-ink/10'}`} />
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Sub-step dots — only when there's more than one step in
                  the active phase (car's Payment phase has only one step,
                  so we skip the row to avoid clutter). */}
              {subSteps.length > 1 && (
                <div className="mt-3 flex justify-center items-center gap-1.5">
                  {subSteps.map((s, i) => (
                    <span
                      key={s}
                      className={`h-1.5 rounded-full transition-all ${
                        i === subIdx ? 'w-6 bg-[#0B0B0F]' : i < subIdx ? 'w-1.5 bg-[#E11D2E]' : 'w-1.5 bg-ink/20'
                      }`}
                      aria-hidden
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )
        })()}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-xl bg-white border border-[#E11D2E]/30 text-[#C5121F] text-sm flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={step === 'submitting' || step === 'done' || step === 'select' || step === 'truck-contact' ? '' : 'rounded-2xl border border-ink/10 bg-white p-6 md:p-10 shadow-sm'}>
        {/* Form Steps */}
        <AnimatePresence mode="wait">
          {step === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className={kiosk ? 'space-y-10 py-8' : 'space-y-8'}
            >
              <div className={kiosk ? 'text-center max-w-[44ch] mx-auto' : 'text-center max-w-[44ch] mx-auto'}>
                <h2 className={kiosk
                  ? 'text-[32px] md:text-[40px] tracking-tight leading-[1.05]'
                  : 'text-[28px] md:text-[34px] tracking-tight leading-[1.1]'}>
                  {t.select.heading}
                </h2>
                <p className={kiosk ? 'mt-4 text-[16px] md:text-[17px] text-ink/65' : 'mt-3 text-[15px] text-ink/60'}>
                  {t.select.sub}
                </p>
                {isAdmin && (
                  <p className={kiosk
                    ? 'mt-5 inline-flex items-center gap-2 rounded-full bg-ink/5 px-4 py-1.5 text-[13px] text-ink/70'
                    : 'mt-4 inline-flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1 text-[12px] text-ink/70'}>
                    <Shield className={kiosk ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5'} />
                    Admin mode — truck registration available
                  </p>
                )}
              </div>

              <div className={kiosk
                ? 'grid gap-5 md:grid-cols-2 max-w-[720px] mx-auto'
                : 'grid gap-4 md:grid-cols-2'}>
                <button
                  type="button"
                  onClick={() => { setVehicleType('car'); setStep('personal') }}
                  className={kiosk
                    ? 'group text-left rounded-2xl border border-ink/10 bg-white p-7 shadow-sm active:scale-[0.98] hover:border-[#E11D2E] hover:shadow-md transition-all'
                    : 'group text-left rounded-2xl border border-ink/10 bg-white p-6 md:p-7 shadow-sm hover:border-[#E11D2E] hover:shadow-md transition-all'}
                >
                  <div className="flex items-start justify-between">
                    <span className={kiosk
                      ? 'inline-flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white group-hover:bg-[#E11D2E] transition-colors'
                      : 'inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white group-hover:bg-[#E11D2E] transition-colors'}>
                      <Car className={kiosk ? 'h-5.5 w-5.5' : 'h-5 w-5'} />
                    </span>
                    <span className={kiosk
                      ? 'text-[11px] uppercase tracking-[0.18em] text-ink/40'
                      : 'text-[11px] uppercase tracking-[0.18em] text-ink/40'}>01</span>
                  </div>
                  <h3 className={kiosk
                    ? 'mt-5 text-[26px] font-sans tracking-tight leading-tight'
                    : 'mt-5 text-[24px] font-sans tracking-tight'}>
                    {t.select.class5Title}
                  </h3>
                  <p className={kiosk
                    ? 'mt-1.5 text-[14px] text-ink/60 leading-snug'
                    : 'mt-1 text-[13.5px] text-ink/60'}>
                    {t.select.class5Sub}
                  </p>
                  <span className={kiosk
                    ? 'mt-6 inline-flex items-center gap-1.5 text-[14px] text-ink group-hover:text-[#E11D2E] transition-colors'
                    : 'mt-6 inline-flex items-center gap-1 text-[13px] text-ink group-hover:text-[#E11D2E] transition-colors'}>
                    {t.select.class5Cta}
                    <ArrowRight className={kiosk ? 'h-4 w-4 transition-transform group-hover:translate-x-0.5' : 'h-4 w-4 transition-transform group-hover:translate-x-0.5'} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    // Admins skip the public contact card and go straight to
                    // the full registration form, tagged as truck.
                    if (isAdmin) {
                      setVehicleType('truck')
                      setStep('personal')
                    } else {
                      setStep('truck-contact')
                    }
                  }}
                  className={kiosk
                    ? 'group text-left rounded-2xl border border-ink/10 bg-white p-7 shadow-sm active:scale-[0.98] hover:border-[#E11D2E] hover:shadow-md transition-all'
                    : 'group text-left rounded-2xl border border-ink/10 bg-white p-6 md:p-7 shadow-sm hover:border-[#E11D2E] hover:shadow-md transition-all'}
                >
                  <div className="flex items-start justify-between">
                    <span className={kiosk
                      ? 'inline-flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white group-hover:bg-[#E11D2E] transition-colors'
                      : 'inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white group-hover:bg-[#E11D2E] transition-colors'}>
                      <Truck className={kiosk ? 'h-5.5 w-5.5' : 'h-5 w-5'} />
                    </span>
                    <span className={kiosk
                      ? 'text-[11px] uppercase tracking-[0.18em] text-ink/40'
                      : 'text-[11px] uppercase tracking-[0.18em] text-ink/40'}>02</span>
                  </div>
                  <h3 className={kiosk
                    ? 'mt-5 text-[26px] font-sans tracking-tight leading-tight'
                    : 'mt-5 text-[24px] font-sans tracking-tight'}>
                    {t.select.truckTitle}
                  </h3>
                  <p className={kiosk
                    ? 'mt-1.5 text-[14px] text-ink/60 leading-snug'
                    : 'mt-1 text-[13.5px] text-ink/60'}>
                    {t.select.truckSub}
                  </p>
                  <span className={kiosk
                    ? 'mt-6 inline-flex items-center gap-1.5 text-[14px] text-ink group-hover:text-[#E11D2E] transition-colors'
                    : 'mt-6 inline-flex items-center gap-1 text-[13px] text-ink group-hover:text-[#E11D2E] transition-colors'}>
                    {t.select.truckCta}
                    <ArrowRight className={kiosk ? 'h-4 w-4 transition-transform group-hover:translate-x-0.5' : 'h-4 w-4 transition-transform group-hover:translate-x-0.5'} />
                  </span>
                </button>
              </div>
            </motion.div>
          )}

          {step === 'truck-contact' && (
            <motion.div
              key="truck-contact"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-ink/10 bg-white p-8 md:p-12 shadow-sm"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#E11D2E]/10 text-[#E11D2E]">
                <Truck className="h-6 w-6" />
              </span>
              <h2 className="mt-6 text-[28px] md:text-[36px] tracking-tight">
                <span className="font-sans">{t.truck.heading.split('—')[0].trim()} </span>
                <span className="font-serif italic text-[#E11D2E]">— {t.truck.heading.split('—')[1]?.trim()}</span>
              </h2>
              <p className="mt-4 text-[15px] text-ink/70 leading-relaxed max-w-[54ch]">
                {t.truck.body}
              </p>

              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 mt-0.5 shrink-0 text-[#E11D2E]" />
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.15em] text-ink/45">
                      {t.truck.visitLabel}
                    </div>
                    <div className="mt-1 text-[14.5px] text-ink leading-snug">
                      {t.truck.address}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 mt-0.5 shrink-0 text-[#E11D2E]" />
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.15em] text-ink/45">
                      {t.truck.callLabel}
                    </div>
                    <a href={`tel:${t.truck.phone.replace(/\D/g, '')}`} className="mt-1 block text-[14.5px] text-ink hover:text-[#E11D2E] transition-colors">
                      {t.truck.phone}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 sm:col-span-2">
                  <Clock className="h-5 w-5 mt-0.5 shrink-0 text-[#E11D2E]" />
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.15em] text-ink/45">
                      {t.truck.hoursLabel}
                    </div>
                    <div className="mt-1 text-[14.5px] text-ink/80 leading-snug">
                      {t.truck.hours}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep('select')}
                className="mt-10 inline-flex items-center gap-2 text-[14px] text-ink/60 hover:text-ink transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> {t.truck.backToChoice}
              </button>
            </motion.div>
          )}

          {step === 'personal' && (
            <motion.div
              key="personal"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2"><User className="h-5 w-5" /> {t.personal.heading}</h2>

              <div>
                <Label>{t.personal.fullName} *</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t.personal.fullNamePh} className="mt-1" autoFocus />
              </div>

              <div>
                <Label>{t.personal.phone} *</Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder={t.personal.phonePh} className="pl-10" type="tel" />
                </div>
              </div>

              <div>
                <Label>{t.personal.email}</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder={t.personal.emailPh} className="mt-1" type="email" />
              </div>

              <div>
                <Label>{t.personal.dob}</Label>
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
              <h2 className="text-lg font-semibold flex items-center gap-2"><MapPin className="h-5 w-5" /> {t.address.heading}</h2>

              <div>
                <Label>{t.address.street}</Label>
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  onAddressSelect={({ street, city: c, province: pv, postalCode: pc }) => {
                    setAddress(street)
                    if (c) setCity(c)
                    if (pv) setProvince(pv)
                    if (pc) setPostalCode(pc)
                  }}
                  placeholder={t.address.streetPh}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t.address.city}</Label>
                  <Input value={city} onChange={e => setCity(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>{t.address.province}</Label>
                  <Input value={province} onChange={e => setProvince(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div>
                <Label>{t.address.postal}</Label>
                <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder={t.address.postalPh} className="mt-1" />
              </div>

              {province.trim() && province.trim().toUpperCase() !== 'QC' && (
                <div className="mt-2 rounded-xl border border-[#E11D2E]/30 bg-[#E11D2E]/5 p-4">
                  <p className="text-[14px] font-semibold text-[#C5121F] flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {t.errors.qcOnlyTitle}
                  </p>
                  <p className="text-[13px] text-ink/70 mt-1.5 leading-relaxed">
                    {t.errors.qcOnlyBody}
                  </p>
                </div>
              )}
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
              <h2 className="text-lg font-semibold flex items-center gap-2"><FileText className="h-5 w-5" /> {t.documents.heading}</h2>
              <p className="text-sm text-muted-foreground">{t.documents.sub}</p>

              {/* Driver's Licence (Quebec) — the permit number + expiry are
                  extracted automatically when the photo is taken. We hide
                  the manual permit-number field; the student doesn't need
                  to retype something the OCR already pulled. */}
              <div>
                <Label>Driver Licence (Quebec) <span className="text-red-500">*</span></Label>
                <input
                  ref={permitInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleImageUpload((v) => {
                    setPermitImage(v)
                    if (!v) { setPermitNumber(''); setPermitExpiry('') }
                  }, { ocr: true })}
                />
                {permitImage ? (
                  <div className="mt-2 space-y-3">
                    <div className="relative">
                      <img src={permitImage} alt="Driver licence" className="w-full rounded-lg border" />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => { setPermitImage(null); setPermitNumber(''); setPermitExpiry('') }}
                      >
                        {t.documents.remove}
                      </Button>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      {permitOcrLoading ? (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Reading licence — extracting number and expiry date…
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span className="text-xs text-muted-foreground">Auto-extracted from your licence:</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="ocr-permit-num" className="text-xs">Licence number</Label>
                              <Input
                                id="ocr-permit-num"
                                value={permitNumber}
                                onChange={e => setPermitNumber(e.target.value)}
                                placeholder="—"
                                className="mt-1 font-mono text-sm"
                              />
                            </div>
                            <div>
                              <Label htmlFor="ocr-permit-exp" className="text-xs">Expiration</Label>
                              <Input
                                id="ocr-permit-exp"
                                type="date"
                                value={permitExpiry}
                                onChange={e => setPermitExpiry(e.target.value)}
                                className="mt-1 text-sm"
                              />
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground">If anything looks off, correct it above.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => permitInputRef.current?.click()}
                    className="mt-2 w-full border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors"
                  >
                    <Camera className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">{t.documents.takePhoto}</p>
                    <p className="text-xs text-muted-foreground mt-1">We'll automatically read the licence number and expiration date.</p>
                  </button>
                )}
              </div>

              {/* ID Photo */}
              <div>
                <Label>{t.documents.idPhoto} <span className="text-red-500">*</span></Label>
                <input ref={idInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload(setIdImage)} />
                {idImage ? (
                  <div className="mt-2 relative">
                    <img src={idImage} alt="ID" className="w-full rounded-lg border" />
                    <Button variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => setIdImage(null)}>{t.documents.remove}</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => idInputRef.current?.click()}
                    className="mt-2 w-full border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors"
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">{t.documents.takePhoto}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.documents.idHint}</p>
                  </button>
                )}
              </div>

              {/* Selfie / Avatar — front camera by default on tablets and
                  phones (capture="user"). Becomes the student's avatar on
                  every profile page in the admin app. */}
              <div>
                <Label>Your Photo <span className="text-red-500">*</span></Label>
                <input ref={avatarInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleImageUpload(setAvatarImage)} />
                {avatarImage ? (
                  <div className="mt-2 flex items-center gap-4">
                    <img src={avatarImage} alt="Student" className="h-28 w-28 rounded-full object-cover border-2 border-amber-300" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Looking good 👋</p>
                      <p className="text-xs text-muted-foreground max-w-[36ch]">
                        We'll use this photo on your student profile so your teachers can recognize you.
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => setAvatarImage(null)} className="text-xs h-7 px-2">
                        Retake
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="mt-2 w-full border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors"
                  >
                    <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Take a selfie</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      A clear photo of your face so your teachers can recognize you. We don't share this.
                    </p>
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
              <h2 className="text-lg font-semibold flex items-center gap-2"><PenTool className="h-5 w-5" /> {t.agreement.heading}</h2>

              <div className="rounded-lg border bg-background max-h-[420px] overflow-y-auto">
                <article className="p-5 text-[13px] leading-relaxed text-foreground/90">
                  <header className="text-center mb-5">
                    <h3 className="text-[15px] font-semibold tracking-tight">{t.tc.title}</h3>
                    <p className="text-muted-foreground text-xs mt-1">{t.tc.subtitle}</p>
                  </header>

                  <p className="mb-4">{t.tc.p1}</p>
                  <p className="mb-5">{t.tc.p2}</p>
                  <p className="mb-4">{t.tc.feeIntro}</p>

                  <h4 className="font-semibold mt-5 mb-2">{t.tc.s1Title}</h4>
                  <p className="mb-4">{t.tc.s1}</p>

                  <h4 className="font-semibold mt-5 mb-2">{t.tc.s2Title}</h4>
                  <p className="mb-4">{t.tc.s2}</p>

                  <h4 className="font-semibold mt-5 mb-2">{t.tc.s3Title}</h4>
                  <p className="mb-2">{t.tc.s3a}</p>
                  <ul className="list-disc pl-6 space-y-1 mb-4">
                    {t.tc.s3b.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>

                  <h4 className="font-semibold mt-5 mb-2">{t.tc.s4Title}</h4>
                  <p className="mb-4">{t.tc.s4}</p>

                  <h4 className="font-semibold mt-5 mb-2">{t.tc.s5Title}</h4>
                  <p className="mb-4">{t.tc.s5}</p>

                  <h4 className="font-semibold mt-5 mb-2">{t.tc.s6Title}</h4>
                  <p className="mb-2">{t.tc.s6}</p>
                </article>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox id="terms" checked={agreedTerms} onCheckedChange={v => setAgreedTerms(!!v)} className="mt-0.5" />
                  <label htmlFor="terms" className="text-sm cursor-pointer">{t.agreement.agreeTerms} *</label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox id="policy" checked={agreedPolicy} onCheckedChange={v => setAgreedPolicy(!!v)} className="mt-0.5" />
                  <label htmlFor="policy" className="text-sm cursor-pointer">{t.agreement.agreeAccurate} *</label>
                </div>
              </div>

              {/* Truck-only: SAAQ Class 1 service contract extras
                  (Art. 83 consents + first-course date + signed-at). */}
              {vehicleType === 'truck' && (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-4">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4" /> Class 1 Service Contract (SAAQ Article 83)
                  </p>

                  {/* Plain-language checklist. Mirrors the dense paragraphs in
                      the terms scroll so students can see the things they're
                      most likely to ask about at a glance. The contract PDF
                      remains the legally controlling document. */}
                  <div className="rounded-md border border-amber-200 bg-white/70 dark:bg-amber-950/30 p-3">
                    <p className="text-[12px] uppercase tracking-[0.14em] text-amber-700 font-semibold mb-2">
                      Key points — at a glance
                    </p>
                    <ul className="space-y-2 text-[13px] leading-relaxed">
                      {[
                        { strong: 'Course length', body: '75 hours of theory + 50 hours of practical driving = 125 hours total.' },
                        { strong: 'Contract duration', body: 'You have 18 months from your first class to finish the program.' },
                        { strong: 'Missed theory class', body: '$30 per hour for any theory hour you miss. You must make it up before progressing.' },
                        { strong: 'Cancelling a road class', body: 'Cancel at least 48 hours in advance. Less than 48h notice = $65 fee.' },
                        { strong: 'Total cost', body: '$8,750 before taxes — $2,250 theory + $6,500 practical. Paid in 4 installments.' },
                        { strong: 'If you stop the course', body: 'You only pay for what you used + the lesser of $50 or 10% of unused services. Refunds within 10 days.' },
                        { strong: 'Receipts', body: 'You receive a receipt for every payment — keep them until you get your licence.' },
                        { strong: 'Course attestation', body: 'Provided free at the end of training (or within 10 days if you cancel).' },
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                          <span>
                            <strong className="font-semibold">{item.strong}.</strong>{' '}
                            <span className="text-foreground/80">{item.body}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-muted-foreground italic">
                      This summary is a plain-language overview. The full SAAQ Class 1 service
                      contract — signed by both you and the school — is the legally binding document.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Checkbox id="consent-saaq" checked={consentSaaqTransmission} onCheckedChange={v => setConsentSaaqTransmission(!!v)} className="mt-0.5" />
                      <label htmlFor="consent-saaq" className="text-[13px] leading-relaxed cursor-pointer">
                        <strong>Transmission to SAAQ.</strong> I authorize the school to transmit the
                        information in my file to the SAAQ for complaint follow-up, quality
                        control and validation of course attestations.
                      </label>
                    </div>
                    <div className="flex items-start gap-3">
                      <Checkbox id="consent-transfer" checked={consentFileTransfer} onCheckedChange={v => setConsentFileTransfer(!!v)} className="mt-0.5" />
                      <label htmlFor="consent-transfer" className="text-[13px] leading-relaxed cursor-pointer">
                        <strong>File transfer on closure.</strong> I authorize the transfer of my
                        file to the SAAQ or another school if Qazi Driving School ceases
                        activity or has its recognition withdrawn.
                      </label>
                    </div>
                    <div className="flex items-start gap-3">
                      <Checkbox id="consent-contact" checked={consentContactInfo} onCheckedChange={v => setConsentContactInfo(!!v)} className="mt-0.5" />
                      <label htmlFor="consent-contact" className="text-[13px] leading-relaxed cursor-pointer">
                        <strong>Contact info for surveys.</strong> I authorize the school to
                        transmit my contact information and email to the SAAQ for survey
                        purposes or to send me required documents if I can't complete training.
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 pt-2">
                    <div>
                      <Label htmlFor="firstCourseDate" className="text-xs">First course date *</Label>
                      <Input
                        id="firstCourseDate"
                        type="date"
                        value={firstCourseDate}
                        onChange={e => setFirstCourseDate(e.target.value)}
                        required
                      />
                      {firstCourseDate && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Must complete by:{' '}
                          {(() => {
                            try {
                              const [y, m, d] = firstCourseDate.split('-').map(Number)
                              const max = new Date(y, m - 1, d)
                              max.setMonth(max.getMonth() + 18)
                              return max.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            } catch { return '—' }
                          })()}
                          {' '}(18 months)
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="signedAtPlace" className="text-xs">Signed at *</Label>
                      <Input
                        id="signedAtPlace"
                        value={signedAtPlace}
                        onChange={e => setSignedAtPlace(e.target.value)}
                        placeholder="Montréal"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Signature */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>{t.agreement.signature} *</Label>
                  {signatureImage && (
                    <Button variant="ghost" size="sm" onClick={() => { studentSigRef.current?.clear(); setSignatureImage(null) }} className="text-xs">{t.agreement.clear}</Button>
                  )}
                </div>
                <SignaturePad
                  ref={studentSigRef}
                  className="mt-2"
                  height={170}
                  placeholder={t.agreement.signHint}
                  strokeWidth={2.5}
                  onChange={setSignatureImage}
                />
              </div>
            </motion.div>
          )}

          {/* === rep-handoff (truck only) ============================ */}
          {step === 'rep-handoff' && (
            <motion.div
              key="rep-handoff"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="rounded-2xl border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 p-8 text-center space-y-5"
            >
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 mx-auto">
                <User className="h-7 w-7" />
              </div>
              <h2 className="text-[24px] tracking-tight">Please hand this device to a Qazi Driving School representative.</h2>
              <p className="text-sm text-muted-foreground max-w-[48ch] mx-auto">
                The next step requires the school representative to print their name and counter-sign the contract.
                Once they confirm, you'll be brought to the payment step.
              </p>
              <p className="text-xs text-muted-foreground">Tap <strong>Next</strong> when the representative is ready.</p>
            </motion.div>
          )}

          {/* === rep-sign (truck only) =============================== */}
          {step === 'rep-sign' && (
            <motion.div
              key="rep-sign"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <PenTool className="h-5 w-5" /> School Representative — counter-signature
              </h2>
              <p className="text-sm text-muted-foreground">
                Please print your name and sign below to counter-sign the Class 1 service contract.
              </p>
              <div>
                <Label htmlFor="rep-name">Representative name *</Label>
                <Input id="rep-name" value={repName} onChange={e => setRepName(e.target.value)} placeholder="Printed name" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Representative signature *</Label>
                  {repSignatureDataUrl && (
                    <Button variant="ghost" size="sm" onClick={() => { repSigRef.current?.clear(); setRepSignatureDataUrl(null) }} className="text-xs">
                      Clear
                    </Button>
                  )}
                </div>
                <SignaturePad
                  ref={repSigRef}
                  className="mt-2"
                  height={170}
                  placeholder="Sign here"
                  strokeWidth={2.5}
                  onChange={setRepSignatureDataUrl}
                />
              </div>
            </motion.div>
          )}

          {/* === payment-method (truck only) ========================= */}
          {step === 'payment-method' && (
            <motion.div
              key="payment-method"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> How will the student pay the initial fees?
              </h2>
              <p className="text-sm text-muted-foreground">
                The first installment ($250) at the start of training. You can record cash now or
                run a card through Clover Hosted Checkout on the next step.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setTruckPaymentMethod('cash')}
                  className={`text-left rounded-xl border-2 p-5 transition-all ${truckPaymentMethod === 'cash' ? 'border-amber-500 bg-amber-50/60' : 'border-ink/10 bg-white hover:border-amber-300'}`}
                >
                  <p className="text-[18px] font-medium">Cash</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Recorded as paid in cash. No card capture step.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTruckPaymentMethod('card')}
                  className={`text-left rounded-xl border-2 p-5 transition-all ${truckPaymentMethod === 'card' ? 'border-amber-500 bg-amber-50/60' : 'border-ink/10 bg-white hover:border-amber-300'}`}
                >
                  <p className="text-[18px] font-medium">Card</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Run through Clover Hosted Checkout on the next step.
                  </p>
                </button>
              </div>
            </motion.div>
          )}

          {step === 'payment' && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-5"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2"><Receipt className="h-5 w-5" /> {t.payment.heading}</h2>
              <p className="text-sm text-muted-foreground">{t.payment.intro}</p>

              <div className="rounded-xl border bg-card overflow-hidden">
                {PAYMENT_SCHEDULE.map((p, i) => (
                  <div
                    key={p.num}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      i !== PAYMENT_SCHEDULE.length - 1 ? 'border-b' : ''
                    } ${p.first ? 'bg-primary/5' : ''}`}
                  >
                    <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-semibold shrink-0 ${
                      p.first ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {p.num}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.payment.rows[i].phase}</p>
                      {t.payment.rows[i].roadClass && (
                        <p className="text-xs text-muted-foreground">{t.payment.rows[i].roadClass}</p>
                      )}
                      {p.first && (
                        <p className="text-xs text-primary font-medium mt-0.5">{t.payment.dueToday}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">${p.amount}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-t">
                  <p className="text-sm font-semibold">{t.payment.total}</p>
                  <p className="text-sm font-bold tabular-nums">$1,000</p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
                <CreditCard className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium">{t.payment.firstDue} <span className="text-primary">$250</span></p>
                  <p className="text-xs text-muted-foreground mt-1">{t.payment.firstDueNote}</p>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'submitting' && (
            <motion.div
              key="submitting"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-ink/10 bg-white p-10 md:p-14 text-center shadow-sm"
            >
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-[#E11D2E] mb-5" />
              <p className="font-serif italic text-[24px] text-ink">{t.submitting.title}</p>
              <p className="text-[14px] text-ink/60 mt-2">{t.submitting.sub}</p>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-ink/10 bg-white p-10 md:p-14 text-center shadow-sm"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#E11D2E]/10 text-[#E11D2E]"
              >
                <CheckCircle2 className="h-7 w-7" />
              </motion.span>
              <h2 className="mt-6 text-[32px] md:text-[40px] tracking-tight">
                <span className="font-sans">{t.done.titleA}</span>
                <span className="font-serif italic text-[#E11D2E]">{t.done.titleB}</span>
              </h2>
              <p className="mt-3 text-[16px] text-ink/65 max-w-[46ch] mx-auto">
                {t.done.body}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons */}
        {step !== 'submitting' && step !== 'done' && step !== 'select' && step !== 'truck-contact' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-between items-center mt-10 pt-6 border-t border-ink/10"
          >
            <button
              type="button"
              onClick={prevStep}
              className="inline-flex items-center gap-2 text-[14px] text-ink/60 hover:text-ink transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> {t.actions.back}
            </button>

            <button
              type="button"
              onClick={nextStep}
              disabled={!canProceed()}
              className="group inline-flex items-center gap-2 h-12 px-7 rounded-full bg-[#0B0B0F] text-white text-[15px] font-medium hover:bg-[#E11D2E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0B0B0F]"
            >
              {step === 'payment' ? (
                <>{t.actions.checkout} <CreditCard className="h-4 w-4" /></>
              ) : (
                <>{t.actions.next} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </button>
          </motion.div>
        )}
        </div>

      </div>
      {!kiosk && <QaziFooter />}
    </div>
  )
}
