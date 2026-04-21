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
} from 'lucide-react'
import { QaziNav } from '@/components/qazi-nav'
import { QaziFooter } from '@/components/qazi-footer'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { LangProvider, useT } from './i18n'

type Step = 'select' | 'truck-contact' | 'personal' | 'address' | 'documents' | 'agreements' | 'payment' | 'submitting' | 'done'

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'personal', label: 'Personal Info', icon: User },
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'agreements', label: 'Agreement', icon: PenTool },
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

function RegisterPageInner() {
  const { t } = useT()
  const [step, setStep] = useState<Step>('select')
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
      case 'address': return province.trim().toUpperCase() === 'QC'
      case 'documents': return true // documents are optional
      case 'agreements': return agreedTerms && agreedPolicy && signatureImage
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
          permitNumber, permitImage, idImage,
          signatureImage, agreedToTerms: agreedTerms && agreedPolicy,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Registration failed')
        setStep('payment')
        return
      }

      const { registrationId } = await res.json()

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
    <div className="min-h-screen bg-[#F7F7F5] text-[#0B0B0F]">
      <QaziNav />
      {/* Hero */}
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

      <div className="max-w-2xl mx-auto px-6 py-10 md:py-14">

        {/* Progress */}
        {step !== 'submitting' && step !== 'done' && step !== 'select' && step !== 'truck-contact' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start justify-between mb-10 px-1"
          >
            {STEPS.map((s, i) => {
              const labels = [t.steps.personal, t.steps.address, t.steps.documents, t.steps.agreement, t.steps.payment]
              const isActive = i === stepIndex
              const isDone = i < stepIndex
              return (
                <div key={s.key} className="flex items-start flex-1 min-w-0">
                  <div className="flex flex-col items-center gap-2 min-w-0">
                    <div className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-medium transition-all shrink-0 ${
                      isDone ? 'bg-[#E11D2E] text-white' :
                      isActive ? 'bg-[#0B0B0F] text-white scale-110' :
                      'bg-white border border-ink/10 text-ink/40'
                    }`}>
                      {isDone ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
                    </div>
                    <span className={`text-[10.5px] uppercase tracking-[0.12em] text-center leading-tight transition-colors ${
                      isActive ? 'text-ink font-semibold' : isDone ? 'text-[#E11D2E]' : 'text-ink/40'
                    }`}>
                      {labels[i]}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-px mt-[18px] mx-1 sm:mx-2 ${isDone ? 'bg-[#E11D2E]' : 'bg-ink/10'}`} />
                  )}
                </div>
              )
            })}
          </motion.div>
        )}

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
              className="space-y-8"
            >
              <div className="text-center max-w-[44ch] mx-auto">
                <h2 className="text-[28px] md:text-[34px] tracking-tight leading-[1.1]">
                  {t.select.heading}
                </h2>
                <p className="mt-3 text-[15px] text-ink/60">{t.select.sub}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setStep('personal')}
                  className="group text-left rounded-2xl border border-ink/10 bg-white p-6 md:p-7 shadow-sm hover:border-[#E11D2E] hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white group-hover:bg-[#E11D2E] transition-colors">
                      <Car className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-ink/40">01</span>
                  </div>
                  <h3 className="mt-5 text-[24px] font-sans tracking-tight">{t.select.class5Title}</h3>
                  <p className="mt-1 text-[13.5px] text-ink/60">{t.select.class5Sub}</p>
                  <span className="mt-6 inline-flex items-center gap-1 text-[13px] text-ink group-hover:text-[#E11D2E] transition-colors">
                    {t.select.class5Cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('truck-contact')}
                  className="group text-left rounded-2xl border border-ink/10 bg-white p-6 md:p-7 shadow-sm hover:border-[#E11D2E] hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white group-hover:bg-[#E11D2E] transition-colors">
                      <Truck className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-ink/40">02</span>
                  </div>
                  <h3 className="mt-5 text-[24px] font-sans tracking-tight">{t.select.truckTitle}</h3>
                  <p className="mt-1 text-[13.5px] text-ink/60">{t.select.truckSub}</p>
                  <span className="mt-6 inline-flex items-center gap-1 text-[13px] text-ink group-hover:text-[#E11D2E] transition-colors">
                    {t.select.truckCta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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

              <div>
                <Label>{t.documents.permitNumber}</Label>
                <Input value={permitNumber} onChange={e => setPermitNumber(e.target.value)} placeholder="N1234-567890-01" className="mt-1 font-mono" />
              </div>

              {/* Permit Photo */}
              <div>
                <Label>{t.documents.permitPhoto}</Label>
                <input ref={permitInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload(setPermitImage)} />
                {permitImage ? (
                  <div className="mt-2 relative">
                    <img src={permitImage} alt="Permit" className="w-full rounded-lg border" />
                    <Button variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => setPermitImage(null)}>{t.documents.remove}</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => permitInputRef.current?.click()}
                    className="mt-2 w-full border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors"
                  >
                    <Camera className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">{t.documents.takePhoto}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.documents.takePhotoHint}</p>
                  </button>
                )}
              </div>

              {/* ID Photo */}
              <div>
                <Label>{t.documents.idPhoto}</Label>
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

              {/* Signature */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>{t.agreement.signature} *</Label>
                  {signatureImage && (
                    <Button variant="ghost" size="sm" onClick={clearSignature} className="text-xs">{t.agreement.clear}</Button>
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
                      {t.agreement.signHint}
                    </p>
                  )}
                </div>
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
      <QaziFooter />
    </div>
  )
}
