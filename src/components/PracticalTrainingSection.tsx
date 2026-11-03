'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { CalendarDays, FileSignature } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InstructorSignatureDialog } from '@/components/InstructorSignatureDialog'
import { StudentSignatureDialog } from '@/components/StudentSignatureDialog'
import { showStudentSignsNow } from '@/lib/student-sign-now'
import {
  CLASS1_PRACTICAL_CLASS_COUNT,
  CLASS1_PRACTICAL_HOURS,
  CROSS_BOOKING_UNIT,
  bookingPartLabel,
  classTimingStatus,
  oddBookingMessage,
  practicalClassKey,
  signatureForClass,
  summarizePractical,
  trailingLeftoverMessage,
  type PracticalBookingInput,
  type PracticalClassUnit,
  type UnitSignOff,
  type UnitSignature,
} from '@/lib/practical-classes'

const statusClasses = {
  signed: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200',
  scheduled: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200',
  unsigned: 'border-border bg-background text-muted-foreground',
} as const

const statusText = {
  signed: 'Signed',
  scheduled: 'Scheduled',
  unsigned: 'No signature',
} as const

function formatSliceDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-CA', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  })
}

function formatSliceClock(hhmm: string): string {
  const [hourRaw, minuteRaw] = hhmm.split(':')
  const hour = Number(hourRaw)
  const minute = String(minuteRaw ?? '0').padStart(2, '0')
  if (!Number.isFinite(hour)) return hhmm
  const period = hour >= 12 ? 'p.m.' : 'a.m.'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${minute} ${period}`
}

function shortMonthDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-CA', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  })
}

function instructorDifferenceNote(
  unit: PracticalClassUnit,
  calendars: Array<{ id: number; name: string }>,
): string | null {
  if (!unit.spansBookings) return null
  const named = unit.segments.map(segment => ({
    name: instructorFirstName(calendars, segment.subcalendarId) || 'Unknown',
    date: shortMonthDay(segment.date),
  }))
  if (new Set(named.map(item => item.name)).size <= 1) return null
  const earlier = named.slice(0, -1).map(item => `${item.name} (${item.date})`).join(', ')
  const last = named[named.length - 1]
  return `Earlier: ${earlier}. Sign-off uses ${last.name}, the instructor on ${last.date}.`
}

function instructorFirstName(subcalendars: Array<{ id: number; name: string }>, subcalendarId: number | null): string | null {
  if (subcalendarId == null) return null
  const row = subcalendars.find(item => item.id === subcalendarId)
  const name = row?.name?.trim()
  if (!name) return null
  return name.split(' ')[0] || name
}

export function PracticalTrainingSection({
  bookings,
  studentSignatures,
  instructorSignatures,
  studentName,
  studentPhone,
  subcalendars,
  now,
  initialOpenKey = null,
}: {
  bookings: PracticalBookingInput[]
  studentSignatures: UnitSignature[]
  instructorSignatures: UnitSignOff[]
  studentName: string
  studentPhone: string
  subcalendars?: Array<{ id: number; name: string }>
  now?: Date
  initialOpenKey?: string | null
}) {
  const queryClient = useQueryClient()
  const { data: loadedCalendars = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['subcalendars'],
    queryFn: async () => {
      const res = await fetch('/api/scheduling/subcalendars')
      if (!res.ok) return []
      return res.json()
    },
    enabled: !subcalendars,
    staleTime: 5 * 60 * 1000,
  })
  const calendars = subcalendars ?? loadedCalendars
  const clock = now ?? new Date()
  const summary = useMemo(
    () => summarizePractical(bookings, studentSignatures),
    [bookings, studentSignatures],
  )
  const [openKey, setOpenKey] = useState<string | null>(initialOpenKey)
  const [studentSigning, setStudentSigning] = useState<{
    eventId: string
    unitIndex: number
    crossBooking: boolean
    label: string
    subtitle: string
  } | null>(null)
  const [addingInstructor, setAddingInstructor] = useState<{
    eventId: string
    unitIndex: number
    crossBooking: boolean
    subcalendarId: number | null
    lessonStartAt: string
  } | null>(null)

  const openClass = summary.classes.find(unit => practicalClassKey(unit) === openKey) || null
  const openSignature = openClass ? signatureForClass(openClass, studentSignatures) : null
  const openInstructor = openClass ? signatureForClass(openClass, instructorSignatures) : null
  const openStatus = openClass ? classTimingStatus(openClass, openSignature, clock) : null
  const showStudentSign = openClass != null && openStatus === 'unsigned' && showStudentSignsNow({
    date: openClass.date,
    startTime: openClass.startTime,
    eventId: openClass.eventId,
    hasClassSignature: false,
    now: clock,
  })
  const needsImage = !!openSignature && !openSignature.signatureDataUrl && !!openClass
  const { data: fetchedSignature } = useQuery<{ signatures: Array<{ signatureDataUrl?: string; signedAt?: string }> }>({
    queryKey: ['practical-signature-image', openClass?.eventId, openClass?.unitIndex, studentPhone],
    queryFn: async () => {
      const params = new URLSearchParams({
        eventId: openClass?.eventId || '',
        phone: studentPhone,
        includeSignatures: '1',
      })
      if ((openClass?.unitIndex || 0) > 0) params.set('unitIndex', String(openClass?.unitIndex))
      const res = await fetch(`/api/scheduling/signature?${params}`)
      if (!res.ok) return { signatures: [] }
      return res.json()
    },
    enabled: needsImage,
  })
  const signatureImage = openSignature?.signatureDataUrl || fetchedSignature?.signatures?.[0]?.signatureDataUrl || null
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['truck-journey-signatures', studentPhone] })
    queryClient.invalidateQueries({ queryKey: ['instructor-signatures', studentPhone] })
    queryClient.invalidateQueries({ queryKey: ['practical-signature-image'] })
  }

  return (
    <section aria-labelledby="truck-practical-progress" className="border-t pt-6" data-testid="practical-training">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="truck-practical-progress" className="font-semibold">Practical training</h3>
          <p className="text-sm text-muted-foreground">Each class is 2 hours. A leftover hour carries into the next booking.</p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums" data-testid="practical-progress">
            {summary.signedCount} / {CLASS1_PRACTICAL_CLASS_COUNT} classes
          </p>
          <p className="text-xs text-muted-foreground">{summary.signedHours} / {CLASS1_PRACTICAL_HOURS} h</p>
        </div>
      </div>
      {summary.oddBookings.map(booking => (
        <p key={booking.eventId} className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="practical-odd-duration">
          {oddBookingMessage(booking)}
        </p>
      ))}
      {summary.trailingMinutes > 0 && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="practical-trailing-leftover">
          {trailingLeftoverMessage(summary.trailingMinutes)}
        </p>
      )}
      {summary.classes.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {summary.classes.map(unit => {
            const signature = signatureForClass(unit, studentSignatures)
            const instructor = signatureForClass(unit, instructorSignatures)
            const status = classTimingStatus(unit, signature, clock)
            const part = unit.spansBookings ? unit.spanLabel : bookingPartLabel(unit)
            const teacher = instructorFirstName(calendars, unit.subcalendarId)
            const differ = instructorDifferenceNote(unit, calendars)
            return (
              <button
                key={practicalClassKey(unit)}
                type="button"
                data-testid="practical-class"
                data-class-number={unit.classNumber}
                data-status={status}
                onClick={() => setOpenKey(practicalClassKey(unit))}
                className={`rounded-lg border p-3 text-left transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${statusClasses[status]}`}
              >
                <span className="block text-sm font-semibold tabular-nums">Practical class {unit.classNumber}</span>
                <span className="mt-1 block text-xs opacity-80">{unit.spansBookings ? `Finishes ${formatSliceDate(unit.date)}` : `${formatSliceDate(unit.date)} · 2 h`}</span>
                {part && <span className="mt-1 block text-[11px] opacity-80" data-testid={unit.spansBookings ? 'practical-span' : undefined}>{part}</span>}
                <span className="mt-2 block text-xs font-medium">{statusText[status]}</span>
                {teacher && <span className="mt-1 block text-[11px] opacity-80">Instructor: {teacher}</span>}
                {differ && <span className="mt-1 block text-[11px] opacity-80">{differ}</span>}
                {status === 'signed' && (
                  <span className="mt-1 block text-[11px] font-medium">
                    {instructor ? 'Instructor signed' : 'needs instructor sign-off'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Practical training has not been scheduled yet</p>
            <p className="text-sm text-muted-foreground">The 25 classes (50 hours) are booked separately for each student.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/scheduling?bookFor=${encodeURIComponent(studentName)}&phone=${encodeURIComponent(studentPhone)}`}>
              <CalendarDays className="h-4 w-4" /> Schedule practical
            </Link>
          </Button>
        </div>
      )}

      <Dialog open={!!openClass} onOpenChange={open => { if (!open) setOpenKey(null) }}>
        <DialogContent className="sm:max-w-md" data-testid="practical-lesson-dialog">
          {openClass && openStatus && (
            <>
          <DialogHeader>
            <DialogTitle>Practical class {openClass.classNumber}</DialogTitle>
            <DialogDescription>Class 1 truck program attendance</DialogDescription>
          </DialogHeader>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="font-medium">{formatSliceDate(openClass.date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Time</p>
                <p className="font-medium">{formatSliceClock(openClass.startTime)} – {formatSliceClock(openClass.endTime)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="font-medium tabular-nums">2 hours</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Attendance</p>
                <Badge variant="outline" className={statusClasses[openStatus]}>{statusText[openStatus]}</Badge>
              </div>
              {(openClass.spansBookings ? openClass.spanLabel : bookingPartLabel(openClass)) && (
                <p className="col-span-2 text-sm text-muted-foreground" data-testid={openClass.spansBookings ? 'practical-span' : undefined}>
                  {openClass.spansBookings ? openClass.spanLabel : bookingPartLabel(openClass)}
                </p>
              )}
              <p className="col-span-2 text-sm">
                Instructor: {instructorFirstName(calendars, openClass.subcalendarId) || 'the Teamup calendar for this class'}
              </p>
              {instructorDifferenceNote(openClass, calendars) && (
                <p className="col-span-2 text-sm text-amber-800">{instructorDifferenceNote(openClass, calendars)}</p>
              )}
              {showStudentSign && (
                <div className="col-span-2 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {openClass.spansBookings
                      ? 'This class uses hours from more than one booking, so it needs its own signature. It is not covered by either booking.'
                      : 'One signature covers every 2-hour class in this booking. The instructor signs off after the student.'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    data-testid="student-signs-now"
                    onClick={() => setStudentSigning({
                      eventId: openClass.eventId,
                      unitIndex: openClass.spansBookings ? CROSS_BOOKING_UNIT : 0,
                      crossBooking: openClass.spansBookings,
                      label: `Practical class ${openClass.classNumber}`,
                      subtitle: openClass.spanLabel
                        ? `Practical class ${openClass.classNumber} · ${openClass.spanLabel}`
                        : `Practical class ${openClass.classNumber} · ${formatSliceDate(openClass.date)} ${formatSliceClock(openClass.startTime)}–${formatSliceClock(openClass.endTime)}`,
                    })}
                  >
                    <FileSignature className="h-4 w-4" /> Student signs now
                  </Button>
                </div>
              )}
              {openStatus === 'signed' && signatureImage && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Signature</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signatureImage} alt="Student signature" className="mt-1 h-16 object-contain" />
                </div>
              )}
              {openStatus === 'signed' && (
                <div className="col-span-2">
                  {openInstructor ? (
                    <p className="text-sm text-green-700">Instructor signed</p>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="add-instructor-signature"
                      onClick={() => setAddingInstructor({
                        eventId: openClass.eventId,
                        unitIndex: openClass.spansBookings ? CROSS_BOOKING_UNIT : 0,
                        crossBooking: openClass.spansBookings,
                        subcalendarId: openClass.subcalendarId,
                        lessonStartAt: `${openClass.date} ${openClass.startTime}`,
                      })}
                    >
                      Add instructor signature
                    </Button>
                  )}
                </div>
              )}
              <div className="col-span-2 pt-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/scheduling?eventId=${encodeURIComponent(openClass.eventId)}`}>View in scheduler</Link>
                </Button>
              </div>
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {studentSigning && (
        <StudentSignatureDialog
          key={`${studentSigning.eventId}:${studentSigning.unitIndex}`}
          target={{
            eventId: studentSigning.eventId,
            studentName,
            phone: studentPhone,
            sessionLabel: studentSigning.label,
            subtitle: studentSigning.subtitle,
            moduleNumber: null,
            sortieNumber: null,
            practicalUnitIndex: studentSigning.crossBooking ? studentSigning.unitIndex : null,
            crossBooking: studentSigning.crossBooking,
          }}
          onCancel={() => setStudentSigning(null)}
          onSaved={() => {
            setStudentSigning(null)
            refresh()
          }}
          onAlreadySigned={() => refresh()}
        />
      )}
      {addingInstructor && (
        <InstructorSignatureDialog
          open
          eventId={addingInstructor.eventId}
          studentPhones={[studentPhone]}
          suggestSubcalendarId={addingInstructor.subcalendarId}
          addedLater
          practicalUnitIndex={addingInstructor.crossBooking ? addingInstructor.unitIndex : null}
          lessonStartAt={addingInstructor.lessonStartAt}
          crossBooking={addingInstructor.crossBooking}
          title="Add instructor signature"
          onClose={() => setAddingInstructor(null)}
          onSaved={() => {
            setAddingInstructor(null)
            refresh()
          }}
        />
      )}
    </section>
  )
}
