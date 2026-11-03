/**
 * Fake Class 1 student used for tests and the preview page.
 * No production data. Thirteen bookings, mixing 4h and 2h, five of the
 * 4h bookings already signed on the booking (the old one-signature record).
 */

import type { PracticalBookingInput, UnitSignOff, UnitSignature } from '@/lib/practical-classes'

export const SAMPLE_STUDENT_NAME = 'Manpreet Kaur'
export const SAMPLE_STUDENT_PHONE = '5145550177'
export const SAMPLE_INSTRUCTOR_SUBCALENDAR = 15664319
export const SAMPLE_NOW = new Date('2026-11-03T15:00:00-05:00')

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function booking(
  id: string,
  number: number,
  start: string,
  end: string,
  notes = '',
): PracticalBookingInput {
  return {
    id,
    title: `Truck Class ${number} (Auto) - ${SAMPLE_STUDENT_NAME}`,
    start,
    end,
    notes: `Student: ${SAMPLE_STUDENT_NAME}\nPhone: ${SAMPLE_STUDENT_PHONE}\n${notes}`.trim(),
    subcalendarId: SAMPLE_INSTRUCTOR_SUBCALENDAR,
  }
}

/** The thirteen bookings Ars described: 4h and 2h mixed, five 4h bookings signed. */
export const SAMPLE_THIRTEEN_BOOKINGS: PracticalBookingInput[] = [
  booking('booking-1', 1, '2026-09-02T09:00:00-04:00', '2026-09-02T13:00:00-04:00'),
  booking('booking-2', 2, '2026-09-04T09:00:00-04:00', '2026-09-04T11:00:00-04:00'),
  booking('booking-3', 3, '2026-09-09T09:00:00-04:00', '2026-09-09T13:00:00-04:00'),
  booking('booking-4', 4, '2026-09-11T09:00:00-04:00', '2026-09-11T11:00:00-04:00'),
  booking('booking-5', 5, '2026-09-16T09:00:00-04:00', '2026-09-16T13:00:00-04:00'),
  booking('booking-6', 6, '2026-09-18T09:00:00-04:00', '2026-09-18T11:00:00-04:00'),
  booking('booking-7', 7, '2026-09-23T09:00:00-04:00', '2026-09-23T13:00:00-04:00'),
  booking('booking-8', 8, '2026-09-25T09:00:00-04:00', '2026-09-25T11:00:00-04:00'),
  booking('booking-9', 9, '2026-09-30T09:00:00-04:00', '2026-09-30T13:00:00-04:00'),
  booking('booking-10', 10, '2026-10-02T09:00:00-04:00', '2026-10-02T11:00:00-04:00'),
  booking('booking-11', 11, '2026-10-07T09:00:00-04:00', '2026-10-07T13:00:00-04:00'),
  booking('booking-12', 12, '2026-10-09T09:00:00-04:00', '2026-10-09T11:00:00-04:00'),
  booking('booking-13', 13, '2026-10-14T09:00:00-04:00', '2026-10-14T13:00:00-04:00'),
]

export const SAMPLE_SIGNED_BOOKING_IDS = ['booking-1', 'booking-3', 'booking-5', 'booking-7', 'booking-9']

export const SAMPLE_CANCELLED_BOOKING: PracticalBookingInput = booking(
  'booking-cancelled',
  14,
  '2026-09-06T09:00:00-04:00',
  '2026-09-06T13:00:00-04:00',
  'Cancelled',
)

export const SAMPLE_ODD_BOOKING: PracticalBookingInput = booking(
  'booking-odd',
  15,
  '2026-10-16T09:00:00-04:00',
  '2026-10-16T12:00:00-04:00',
)

export const SAMPLE_PROFILE_BOOKINGS: PracticalBookingInput[] = [
  ...SAMPLE_THIRTEEN_BOOKINGS,
  SAMPLE_CANCELLED_BOOKING,
  SAMPLE_ODD_BOOKING,
]

export const SAMPLE_LEGACY_SIGNATURES: UnitSignature[] = SAMPLE_SIGNED_BOOKING_IDS.map(eventId => ({
  id: `sig-${eventId}`,
  eventId,
  unitIndex: null,
  signatureDataUrl: PNG,
  signedAt: '2026-09-02T13:05:00-04:00',
}))

export const SAMPLE_INSTRUCTOR_SIGNOFFS: UnitSignOff[] = ['booking-1', 'booking-3'].map(eventId => ({
  id: `inst-${eventId}`,
  eventId,
  unitIndex: null,
  signatureDataUrl: PNG,
  signedAt: '2026-09-02T13:10:00-04:00',
  name: 'Abdul Rahman Ahmed Qazi',
  number: null,
}))

export const SAMPLE_SIGNATURE_PNG = PNG
