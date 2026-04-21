'use client'

import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { Phone, User, Calendar, Car, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react'
import { QaziNav } from '@/components/qazi-nav'
import { QaziFooter } from '@/components/qazi-footer'
import { LangProvider, useT as useRegisterT } from '../register/i18n'

type LookupResult = {
  matched: true
  student: { id: string; name: string }
  completed: number[]
  scheduled?: number[]
  remaining: number[]
  theoryCompleted?: number[]
  sortieDates?: Record<number, string>
  sortieUpcomingDates?: Record<number, string>
  moduleDates?: Record<number, string>
  total: number
}

type CurriculumItem =
  | { type: 'theory'; num: number; titleEn: string; titleFr: string }
  | { type: 'sortie'; num: number; titleEn?: string; titleFr?: string }

type Phase = {
  phase: number
  labelEn: string
  labelFr: string
  sublabelEn: string
  sublabelFr: string
  // Tailwind color tokens for the phase accent
  accent: string   // main background
  accentSoft: string // soft background for in-car items
  ring: string     // border color
  text: string     // text color on accent
  items: CurriculumItem[]
}

const CURRICULUM: Phase[] = [
  {
    phase: 1,
    labelEn: 'Phase 1',
    labelFr: 'Phase 1',
    sublabelEn: 'Prerequisite for Learner\u2019s licence',
    sublabelFr: 'Préalable au permis d\u2019apprenti',
    accent: '#F59E42',
    accentSoft: '#FEF3E7',
    ring: '#F59E42',
    text: '#ffffff',
    items: [
      { type: 'theory', num: 1, titleEn: 'The Vehicle', titleFr: 'Le véhicule' },
      { type: 'theory', num: 2, titleEn: 'The Driver', titleFr: 'Le conducteur' },
      { type: 'theory', num: 3, titleEn: 'The Environment', titleFr: 'L\u2019environnement' },
      { type: 'theory', num: 4, titleEn: 'At-Risk Behaviours', titleFr: 'Comportements à risque' },
      { type: 'theory', num: 5, titleEn: 'Evaluation', titleFr: 'Évaluation' },
    ],
  },
  {
    phase: 2,
    labelEn: 'Phase 2',
    labelFr: 'Phase 2',
    sublabelEn: 'Guided driving',
    sublabelFr: 'Conduite guidée',
    accent: '#E11D2E',
    accentSoft: '#FDECEE',
    ring: '#E11D2E',
    text: '#ffffff',
    items: [
      { type: 'theory', num: 6, titleEn: 'Accompanied Driving', titleFr: 'Conduite accompagnée' },
      { type: 'sortie', num: 1 },
      { type: 'sortie', num: 2 },
      { type: 'theory', num: 7, titleEn: 'OEA Strategy', titleFr: 'Stratégie OEA' },
      { type: 'sortie', num: 3 },
      { type: 'sortie', num: 4 },
    ],
  },
  {
    phase: 3,
    labelEn: 'Phase 3',
    labelFr: 'Phase 3',
    sublabelEn: 'Semi-guided driving',
    sublabelFr: 'Conduite semi-guidée',
    accent: '#2563EB',
    accentSoft: '#E8F0FE',
    ring: '#2563EB',
    text: '#ffffff',
    items: [
      { type: 'theory', num: 8, titleEn: 'Speed', titleFr: 'La vitesse' },
      { type: 'sortie', num: 5 },
      { type: 'sortie', num: 6 },
      { type: 'theory', num: 9, titleEn: 'Sharing the Road', titleFr: 'Le partage de la route' },
      { type: 'sortie', num: 7 },
      { type: 'sortie', num: 8 },
      { type: 'theory', num: 10, titleEn: 'Alcohol, drugs', titleFr: 'Alcool et drogues' },
      { type: 'sortie', num: 9 },
      { type: 'sortie', num: 10 },
    ],
  },
  {
    phase: 4,
    labelEn: 'Phase 4',
    labelFr: 'Phase 4',
    sublabelEn: 'Semi-guided to independent driving',
    sublabelFr: 'Conduite semi-guidée à autonome',
    accent: '#059669',
    accentSoft: '#E7F5EF',
    ring: '#059669',
    text: '#ffffff',
    items: [
      { type: 'theory', num: 11, titleEn: 'Fatigue, and distractions', titleFr: 'Fatigue et distractions' },
      { type: 'sortie', num: 11 },
      { type: 'sortie', num: 12 },
      { type: 'sortie', num: 13 },
      { type: 'theory', num: 12, titleEn: 'Eco-Driving', titleFr: 'Éco-conduite' },
      { type: 'sortie', num: 14 },
      { type: 'sortie', num: 15, titleEn: 'Summary', titleFr: 'Synthèse' },
    ],
  },
]

function formatDate(iso: string, lang: 'fr' | 'en'): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso // fallback for legacy YYYY-MM-DD strings
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA'
  // Date-only strings (no time) from the Student DB → format just the date
  const hasTime = /T\d/.test(iso)
  if (!hasTime) {
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: lang === 'en' })
}

type Slot = { start: string; end: string }
type Availability = {
  teacher: { id: number; name: string } | null
  previousClass: { id: string; title?: string; start: string } | null
  slots: Slot[]
  earliestAllowed?: string
  earliestReason?: 'phase1-wait' | 'same-week' | null
  reason?: string
  message?: string
}

type View = 'lookup' | 'remaining' | 'request' | 'done'

const copy = {
  en: {
    eyebrow: 'Book a road class',
    h1a: 'Pick up',
    h1Accent: 'where you left off.',
    lead: 'Enter your name and phone number to see your remaining road classes and book a time with your teacher.',
    class5Only: 'Class 5 (car) only',
    lookupHeading: 'Find your file',
    nameLabel: 'Full name',
    namePh: 'First and last name',
    phoneLabel: 'Phone number',
    phonePh: '(514) 123-4567',
    lookupCta: 'Find my classes',
    notFound: "We couldn't find a student matching that name and phone. Double-check, or call the school.",
    remainingHeading: (name: string) => `Hi ${name.split(' ')[0]} — here's what's left`,
    remainingSub: 'Select the road class you want to book next.',
    progressLabel: (done: number, total: number) => `${done} of ${total} road classes completed`,
    allDone: "You've completed all your road classes.",
    requestHeading: (n: number) => `Pick a time for Road Class ${n}`,
    requestSubWithTeacher: (t: string) => `Showing open slots with ${t}, your previous instructor.`,
    requestSubNoTeacher: 'Choose a time that works for you.',
    loadingSlots: 'Loading available times…',
    noSlots: "No open slots in the next 30 days. Please contact the school to schedule.",
    noTeacher: "We couldn't find a previous road class on record. Please contact the school so we can assign a teacher.",
    selectedSlot: 'Selected',
    notes: 'Notes (optional)',
    notesPh: 'Anything we should know…',
    submit: 'Confirm booking',
    back: 'Back',
    doneTitle: 'Booked.',
    doneBody: "Your road class is on the calendar. You'll get a confirmation from the school shortly.",
    errGeneric: 'Something went wrong. Please try again.',
  },
  fr: {
    eyebrow: 'Réserver un cours pratique',
    h1a: 'Reprenez',
    h1Accent: 'là où vous étiez.',
    lead: 'Entrez votre nom et votre numéro de téléphone pour voir les cours pratiques restants et réserver une plage avec votre moniteur.',
    class5Only: 'Classe 5 (auto) seulement',
    lookupHeading: 'Retrouvez votre dossier',
    nameLabel: 'Nom complet',
    namePh: 'Prénom et nom',
    phoneLabel: 'Téléphone',
    phonePh: '(514) 123-4567',
    lookupCta: 'Trouver mes cours',
    notFound: 'Aucun élève trouvé avec ce nom et ce téléphone. Vérifiez ou appelez l’école.',
    remainingHeading: (name: string) => `Bonjour ${name.split(' ')[0]} — voici ce qu’il vous reste`,
    remainingSub: 'Sélectionnez le cours pratique que vous voulez réserver.',
    progressLabel: (done: number, total: number) => `${done} sur ${total} cours pratiques complétés`,
    allDone: 'Vous avez complété tous vos cours pratiques.',
    requestHeading: (n: number) => `Choisissez une plage pour le cours pratique ${n}`,
    requestSubWithTeacher: (t: string) => `Plages disponibles avec ${t}, votre moniteur précédent.`,
    requestSubNoTeacher: 'Choisissez une plage qui vous convient.',
    loadingSlots: 'Chargement des plages disponibles…',
    noSlots: "Aucune plage libre dans les 30 prochains jours. Veuillez contacter l’école.",
    noTeacher: "Nous ne trouvons aucun cours pratique précédent. Veuillez contacter l'école pour qu'on vous assigne un moniteur.",
    selectedSlot: 'Choisie',
    notes: 'Notes (facultatif)',
    notesPh: 'Tout ce qu’on devrait savoir…',
    submit: 'Confirmer la réservation',
    back: 'Retour',
    doneTitle: 'Réservé.',
    doneBody: 'Votre cours pratique est au calendrier. L’école vous enverra une confirmation sous peu.',
    errGeneric: 'Une erreur est survenue. Veuillez réessayer.',
  },
}

export default function BookPage() {
  return (
    <LangProvider>
      <BookPageInner />
    </LangProvider>
  )
}

function BookPageInner() {
  const { lang } = useRegisterT()
  const c = copy[lang]

  const [view, setView] = useState<View>('lookup')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)
  const [selectedSortie, setSelectedSortie] = useState<number | null>(null)

  const [availability, setAvailability] = useState<Availability | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [notes, setNotes] = useState('')

  const canLookup = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10
  const completedCount = result ? result.completed.length : 0

  const onLookup = async (e: FormEvent) => {
    e.preventDefault()
    if (!canLookup || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/book/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || data.error || c.notFound)
        setLoading(false)
        return
      }
      setResult(data)
      setView('remaining')
    } catch {
      setError(c.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  const loadAvailability = async (sortieNumber: number) => {
    if (!result) return
    setAvailabilityLoading(true)
    setError('')
    setAvailability(null)
    setSelectedSlot(null)
    try {
      const res = await fetch('/api/book/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: result.student.id,
          studentName: result.student.name,
          phone,
          sortieNumber,
        }),
      })
      const data = (await res.json()) as Availability
      setAvailability(data)
    } catch {
      setError(c.errGeneric)
    } finally {
      setAvailabilityLoading(false)
    }
  }

  const onSubmitRequest = async (e: FormEvent) => {
    e.preventDefault()
    if (!result || !selectedSortie || !selectedSlot || !availability?.teacher || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/book/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: result.student.id,
          studentName: result.student.name,
          phone,
          sortieNumber: selectedSortie,
          teacherId: availability.teacher.id,
          slotStart: selectedSlot.start,
          slotEnd: selectedSlot.end,
          notes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success === false) {
        setError(data.error || c.errGeneric)
        setLoading(false)
        return
      }
      setView('done')
    } catch {
      setError(c.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#0B0B0F]">
      <QaziNav />

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
            {c.eyebrow}
          </motion.div>

          <h1 className="mt-6 text-[44px] md:text-[64px] leading-[0.92] tracking-[-0.04em] max-w-[14ch] font-sans">
            <motion.span
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="block"
            >
              {c.h1a}
            </motion.span>
            <motion.span
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="block font-serif italic font-normal text-[#E11D2E]"
            >
              {c.h1Accent}
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-6 max-w-[52ch] text-[15px] md:text-[16px] leading-[1.6] text-white/75"
          >
            {c.lead}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-6 inline-flex items-center gap-2 h-9 px-3 rounded-full bg-white/10 border border-white/15 text-[12px] text-white/80"
          >
            <Car className="h-3.5 w-3.5" />
            {c.class5Only}
          </motion.div>
        </div>
      </section>

      <div className={`mx-auto px-6 py-10 md:py-14 ${view === 'remaining' ? 'max-w-[1200px]' : 'max-w-2xl'}`}>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-white border border-[#E11D2E]/30 text-[#C5121F] text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {view === 'lookup' && (
          <motion.form
            key="lookup"
            onSubmit={onLookup}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-ink/10 bg-white p-6 md:p-10 shadow-sm space-y-5"
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5" /> {c.lookupHeading}
            </h2>

            <div>
              <label className="text-[12px] uppercase tracking-[0.12em] text-ink/55">{c.nameLabel}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={c.namePh}
                autoFocus
                className="mt-2 w-full h-12 px-4 rounded-xl border border-ink/10 bg-[#F7F7F5] text-[15px] focus:outline-none focus:border-[#E11D2E] transition-colors"
              />
            </div>

            <div>
              <label className="text-[12px] uppercase tracking-[0.12em] text-ink/55">{c.phoneLabel}</label>
              <div className="relative mt-2">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={c.phonePh}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-ink/10 bg-[#F7F7F5] text-[15px] focus:outline-none focus:border-[#E11D2E] transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={!canLookup || loading}
                className="group inline-flex items-center gap-2 h-12 px-7 rounded-full bg-[#0B0B0F] text-white text-[15px] font-medium hover:bg-[#E11D2E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0B0B0F]"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{c.lookupCta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
              </button>
            </div>
          </motion.form>
        )}

        {view === 'remaining' && result && (
          <motion.div
            key="remaining"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-ink/10 bg-white p-6 md:p-10 shadow-sm"
          >
            <h2 className="text-[24px] md:text-[28px] tracking-tight">
              {c.remainingHeading(result.student.name)}
            </h2>
            <p className="mt-2 text-[15px] text-ink/60">{c.remainingSub}</p>

            <div className="mt-6">
              <div className="flex items-center justify-between text-[12px] uppercase tracking-[0.12em] text-ink/55 mb-2">
                <span>{c.progressLabel(completedCount, result.total)}</span>
                <span className="text-ink">{Math.round((completedCount / result.total) * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
                <div
                  className="h-full bg-[#E11D2E] transition-all"
                  style={{ width: `${(completedCount / result.total) * 100}%` }}
                />
              </div>
            </div>

            {result.remaining.length === 0 && (
              <div className="mt-8 rounded-xl border border-[#E11D2E]/20 bg-[#E11D2E]/5 p-4 text-center">
                <CheckCircle2 className="h-6 w-6 mx-auto text-[#E11D2E] mb-1" />
                <p className="text-[14px] text-ink/75">{c.allDone}</p>
              </div>
            )}

            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {CURRICULUM.map((phase) => (
                <div key={phase.phase} className="rounded-2xl overflow-hidden border border-ink/10 bg-white">
                  {/* Phase header */}
                  <div
                    className="px-4 py-3.5"
                    style={{ backgroundColor: phase.accent, color: phase.text }}
                  >
                    <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">
                      {lang === 'fr' ? phase.labelFr : phase.labelEn}
                    </div>
                    <div className="mt-0.5 text-[15px] font-semibold leading-tight">
                      {lang === 'fr' ? phase.sublabelFr : phase.sublabelEn}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-3 space-y-2">
                    {phase.items.map((item) => {
                      const isTheory = item.type === 'theory'
                      const theoryDone = isTheory && (result.theoryCompleted || []).includes(item.num)
                      const sortieDone = !isTheory && result.completed.includes(item.num)
                      const sortieBooked = !isTheory && (result.scheduled || []).includes(item.num)
                      const disabled = isTheory || sortieDone || sortieBooked
                      const key = `${item.type}-${item.num}`

                      const dateIso = isTheory
                        ? result.moduleDates?.[item.num]
                        : sortieDone
                          ? result.sortieDates?.[item.num]
                          : sortieBooked
                            ? result.sortieUpcomingDates?.[item.num]
                            : undefined

                      const statusLabel = isTheory
                        ? theoryDone
                          ? (lang === 'fr' ? 'Complété' : 'Completed')
                          : (lang === 'fr' ? 'Théorie' : 'Theory')
                        : sortieDone
                          ? (lang === 'fr' ? 'Fait' : 'Done')
                          : sortieBooked
                            ? (lang === 'fr' ? 'Prévu' : 'Booked')
                            : (lang === 'fr' ? 'À réserver' : 'Available')

                      const nameLabel = isTheory
                        ? (lang === 'fr' ? item.titleFr : item.titleEn)
                        : (lang === 'fr'
                            ? `Cours pratique ${item.num}${'titleFr' in item && item.titleFr ? ` · ${item.titleFr}` : ''}`
                            : `In-Car ${item.num}${'titleEn' in item && item.titleEn ? ` · ${item.titleEn}` : ''}`)

                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (isTheory) return
                            setSelectedSortie(item.num)
                            setView('request')
                            loadAvailability(item.num)
                          }}
                          className={`group w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors border ${
                            isTheory
                              ? theoryDone
                                ? 'border-transparent text-white cursor-default'
                                : 'border-ink/10 bg-white text-ink/70 cursor-default'
                              : sortieDone
                                ? 'border-transparent text-white cursor-default'
                                : sortieBooked
                                  ? 'border-ink/10 text-ink cursor-default'
                                  : 'border-ink/10 bg-white text-ink hover:border-[#0B0B0F] hover:shadow-sm'
                          }`}
                          style={{
                            backgroundColor:
                              isTheory && theoryDone
                                ? phase.accent
                                : !isTheory && sortieDone
                                  ? phase.accent
                                  : !isTheory && sortieBooked
                                    ? phase.accentSoft
                                    : undefined,
                          }}
                        >
                          <span
                            className={`flex items-center justify-center h-7 w-7 rounded-full text-[11.5px] font-semibold shrink-0 ${
                              (isTheory && theoryDone) || sortieDone
                                ? 'bg-white/25 text-white'
                                : 'bg-ink/5 text-ink/70'
                            }`}
                          >
                            {sortieDone ? <CheckCircle2 className="h-4 w-4" /> : item.num}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className={`text-[13.5px] leading-tight ${
                              (isTheory && theoryDone) || sortieDone ? 'font-semibold' : 'font-medium'
                            }`}>
                              {nameLabel}
                            </div>
                            <div className={`mt-0.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] ${
                              (isTheory && theoryDone) || sortieDone
                                ? 'text-white/80'
                                : sortieBooked
                                  ? 'text-ink/55'
                                  : isTheory
                                    ? 'text-ink/40'
                                    : 'text-ink/50'
                            }`}>
                              <span>{statusLabel}</span>
                              {dateIso && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="normal-case tracking-normal text-[11px]">
                                    {formatDate(dateIso, lang)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {!disabled && (
                            <ArrowRight className="h-4 w-4 text-ink/40 group-hover:text-[#0B0B0F] shrink-0 mt-0.5" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => { setView('lookup'); setResult(null) }}
              className="mt-10 inline-flex items-center gap-2 text-[14px] text-ink/60 hover:text-ink transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> {c.back}
            </button>
          </motion.div>
        )}

        {view === 'request' && result && selectedSortie && (
          <motion.form
            key="request"
            onSubmit={onSubmitRequest}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-ink/10 bg-white p-6 md:p-10 shadow-sm space-y-6"
          >
            <div>
              <h2 className="text-[22px] md:text-[26px] tracking-tight">
                {c.requestHeading(selectedSortie)}
              </h2>
              <p className="mt-1.5 text-[14px] text-ink/60">
                {availability?.teacher
                  ? c.requestSubWithTeacher(availability.teacher.name)
                  : c.requestSubNoTeacher}
              </p>
            </div>

            {availabilityLoading && (
              <div className="flex items-center gap-3 text-[14px] text-ink/60 py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> {c.loadingSlots}
              </div>
            )}

            {!availabilityLoading && availability && !availability.teacher && (
              <div className="rounded-xl border border-[#E11D2E]/20 bg-[#E11D2E]/5 p-5 text-[14px] text-ink/80">
                {availability.message || c.noTeacher}
              </div>
            )}

            {!availabilityLoading && availability?.teacher && availability.slots.length === 0 && (
              <div className="rounded-xl border border-ink/10 bg-[#F7F7F5] p-5 text-[14px] text-ink/70">
                {availability.earliestReason === 'phase1-wait' && availability.earliestAllowed
                  ? (lang === 'fr'
                      ? `En-Car 1 sera disponible à partir du ${new Date(availability.earliestAllowed).toLocaleDateString('fr-CA', { month: 'long', day: 'numeric', year: 'numeric' })} (6 semaines après la Phase 1).`
                      : `In-Car 1 unlocks on ${new Date(availability.earliestAllowed).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })} — 6 weeks after completing Phase 1.`)
                  : availability.earliestReason === 'same-week' && availability.earliestAllowed
                    ? (lang === 'fr'
                        ? `La prochaine plage disponible est après le ${new Date(availability.earliestAllowed).toLocaleDateString('fr-CA', { month: 'long', day: 'numeric' })} — vos deux cours pratiques d'un même groupe doivent être espacés d'au moins une semaine.`
                        : `Next available after ${new Date(availability.earliestAllowed).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} — the two road classes in a theory group must be at least one week apart.`)
                    : c.noSlots}
              </div>
            )}

            {!availabilityLoading && availability?.teacher && availability.slots.length > 0 && (
              <>
                {availability.earliestReason && availability.earliestAllowed && (
                  <div className="rounded-lg border border-ink/10 bg-[#F7F7F5] px-4 py-3 text-[12.5px] text-ink/70 leading-snug">
                    {availability.earliestReason === 'phase1-wait'
                      ? (lang === 'fr'
                          ? 'En-Car 1 exige un délai de 6 semaines après la Phase 1.'
                          : 'In-Car 1 requires a 6-week wait after Phase 1.')
                      : (lang === 'fr'
                          ? 'Les deux cours pratiques d\u2019un même groupe doivent être espacés d\u2019au moins une semaine.'
                          : 'The two road classes in a theory group must be at least one week apart.')}
                  </div>
                )}
                <SlotPicker
                  slots={availability.slots}
                  selected={selectedSlot}
                  onSelect={setSelectedSlot}
                  lang={lang}
                />
              </>
            )}

            <div>
              <label className="text-[12px] uppercase tracking-[0.12em] text-ink/55">{c.notes}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={c.notesPh}
                className="mt-2 w-full px-4 py-3 rounded-xl border border-ink/10 bg-[#F7F7F5] text-[15px] focus:outline-none focus:border-[#E11D2E] transition-colors resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-ink/10">
              <button
                type="button"
                onClick={() => setView('remaining')}
                className="inline-flex items-center gap-2 text-[14px] text-ink/60 hover:text-ink transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> {c.back}
              </button>
              <button
                type="submit"
                disabled={loading || !selectedSlot || !availability?.teacher}
                className="group inline-flex items-center gap-2 h-12 px-7 rounded-full bg-[#0B0B0F] text-white text-[15px] font-medium hover:bg-[#E11D2E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0B0B0F]"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{c.submit} <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </motion.form>
        )}

        {view === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-ink/10 bg-white p-10 md:p-14 text-center shadow-sm"
          >
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#E11D2E]/10 text-[#E11D2E]">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h2 className="mt-6 text-[32px] md:text-[40px] tracking-tight">
              <span className="font-sans">{c.doneTitle.split('.')[0]}</span>
              <span className="font-serif italic text-[#E11D2E]">.</span>
            </h2>
            <p className="mt-3 text-[16px] text-ink/65 max-w-[46ch] mx-auto">{c.doneBody}</p>
          </motion.div>
        )}
      </div>

      <QaziFooter />
    </div>
  )
}

function SlotPicker({
  slots,
  selected,
  onSelect,
  lang,
}: {
  slots: Slot[]
  selected: Slot | null
  onSelect: (s: Slot) => void
  lang: 'fr' | 'en'
}) {
  // Group slots by date (YYYY-MM-DD in local time)
  const byDay = new Map<string, Slot[]>()
  for (const s of slots) {
    const d = new Date(s.start)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(s)
  }
  const days = Array.from(byDay.entries()).slice(0, 14) // show first 14 days with openings
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA'

  return (
    <div className="space-y-5">
      {days.map(([dayKey, daySlots]) => {
        const d = new Date(daySlots[0].start)
        const dayLabel = d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
        return (
          <div key={dayKey}>
            <div className="text-[11px] uppercase tracking-[0.15em] text-ink/50 mb-2">
              {dayLabel}
            </div>
            <div className="flex flex-wrap gap-2">
              {daySlots.map((s) => {
                const start = new Date(s.start)
                const label = start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: lang === 'en' })
                const isSelected = selected?.start === s.start
                return (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => onSelect(s)}
                    className={`h-10 px-4 rounded-full border text-[13px] font-medium transition-colors ${
                      isSelected
                        ? 'bg-[#0B0B0F] text-white border-[#0B0B0F]'
                        : 'bg-white text-ink border-ink/15 hover:border-[#0B0B0F]'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
