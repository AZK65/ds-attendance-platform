'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { PracticalTrainingSection } from '@/components/PracticalTrainingSection'
import {
  SAMPLE_FUTURE_BOOKING,
  SAMPLE_INSTRUCTOR_SIGNOFFS,
  SAMPLE_INSTRUCTOR_SUBCALENDAR,
  SAMPLE_LEGACY_SIGNATURES,
  SAMPLE_NOW,
  SAMPLE_OTHER_SUBCALENDAR,
  SAMPLE_PRESENT_EVENT_IDS,
  SAMPLE_PROFILE_BOOKINGS,
  SAMPLE_SIGNED_BOOKING_IDS,
  SAMPLE_STUDENT_NAME,
  SAMPLE_STUDENT_PHONE,
  SAMPLE_THIRTEEN_BOOKINGS,
} from '@/lib/practical-class-sample'
import { expandPracticalClasses, legacyPracticalCards, practicalClassKey } from '@/lib/practical-classes'

const statusClasses = {
  signed: 'border-green-200 bg-green-50 text-green-800',
  unsigned: 'border-border bg-background text-muted-foreground',
}

function formatCardDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-CA', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  })
}

function BeforeSection() {
  const cards = legacyPracticalCards(SAMPLE_THIRTEEN_BOOKINGS, SAMPLE_SIGNED_BOOKING_IDS)
  const completed = cards.filter(card => card.signed)
  const hours = completed.reduce((total, card) => total + card.hours, 0)
  const instructorSigned = new Set(['booking-1', 'booking-3'])
  return (
    <section aria-labelledby="truck-practical-progress" className="border-t pt-6" data-testid="practical-training">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="truck-practical-progress" className="font-semibold">Practical training</h3>
          <p className="text-sm text-muted-foreground">Individual in-cab classes scheduled after theory</p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">{hours} / 50 h</p>
          <p className="text-xs text-muted-foreground">{completed.length} completed classes</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(card => (
          <div
            key={card.eventId}
            className={`rounded-lg border p-3 text-left ${card.signed ? statusClasses.signed : statusClasses.unsigned}`}
          >
            <span className="block text-sm font-semibold tabular-nums">{card.label}</span>
            <span className="mt-1 block text-xs opacity-80">{formatCardDate(card.date)} · {card.hours} h</span>
            <span className="mt-2 block text-xs font-medium">{card.signed ? 'Signed' : 'No signature'}</span>
            {card.signed && (
              <span className="mt-1 block text-[11px] font-medium">
                {instructorSigned.has(card.eventId) ? 'Instructor signed' : 'needs instructor sign-off'}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function PreviewBody() {
  const params = useSearchParams()
  const view = params.get('view') || 'after'
  const span = expandPracticalClasses(SAMPLE_PROFILE_BOOKINGS).classes.find(unit => unit.spansBookings)
  return (
    <main className="mx-auto max-w-5xl bg-background p-6 text-foreground">
      <p className="text-xs font-medium uppercase tracking-wider text-red-600">Class 1 program</p>
      <h1 className="mb-4 text-xl font-semibold">Truck journey · {SAMPLE_STUDENT_NAME}</h1>
      {view === 'before' ? (
        <BeforeSection />
      ) : (
        <PracticalTrainingSection
          bookings={[...SAMPLE_PROFILE_BOOKINGS, SAMPLE_FUTURE_BOOKING]}
          studentSignatures={SAMPLE_LEGACY_SIGNATURES}
          instructorSignatures={SAMPLE_INSTRUCTOR_SIGNOFFS}
          studentName={SAMPLE_STUDENT_NAME}
          studentPhone={SAMPLE_STUDENT_PHONE}
          presentEventIds={SAMPLE_PRESENT_EVENT_IDS}
          subcalendars={[
            { id: SAMPLE_INSTRUCTOR_SUBCALENDAR, name: 'Ahmed Truck' },
            { id: SAMPLE_OTHER_SUBCALENDAR, name: 'Karim Truck' },
          ]}
          now={SAMPLE_NOW}
          initialOpenKey={view === 'dialog' && span ? practicalClassKey(span) : null}
        />
      )}
    </main>
  )
}

export default function PracticalClassPreviewPage() {
  return (
    <Suspense fallback={null}>
      <PreviewBody />
    </Suspense>
  )
}
