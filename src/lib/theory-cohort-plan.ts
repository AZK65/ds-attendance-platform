/**
 * Approved import for Qazi Truck #001 and #002.
 * Dry-run data only: nothing here writes to Teamup, reminders, or signatures.
 *
 * Owner decision after plan v3: #002 Saturdays 2026-10-31 and 2026-11-07 are
 * recorded as template v2, 08:30–17:30. Each stays 7h30. The Teamup events
 * are left untouched by this import.
 */
import {
  TEMPLATE_V1,
  TEMPLATE_V2,
  addMinutes,
  breaksForDay,
  formatNet,
  grossMinutes,
  netMinutes,
  type TheoryBreak,
} from './theory-hours'

export const COHORT_001_NAME = 'Qazi Truck #001'
export const COHORT_002_NAME = 'Qazi Truck #002'

export const COHORT_001_STUDENTS = [
  'Sandeep singh',
  'Amrit Kaur',
  'Vikrant Thakur',
  'ANIL Chauhan',
  'Ahsan ALI',
  'Hritik Dhawan',
  'Ralph Wendell Romero',
  'Hassan sultan',
  'Albert pentado',
] as const

export const COHORT_002_STUDENTS = [
  'Randeep Singh',
  'Deep singh',
  'Jaspreet Singh',
] as const

export const SIGNATURE_COPY_NOTE =
  'image copied from class-15 signature; signedAt set to class end; created 2026-09-05 16:11 EDT backfill; attendance confirmed by Ars 2026-10-24'

export const SIGNATURE_LABEL_NOTE =
  'label "Qazi Truck #002" has no class number; mapped to class 1 by Teamup event id'

export const EVIDENCE_ATTENDANCE = 'Ars confirmed attendance 2026-10-24'
export const EVIDENCE_ADMIN = 'Ars confirmation 2026-10-24 (chat)'
export const CONFIRMED_BY = 'Ars (administration)'
export const CONFIRMED_ON = '2026-10-24'

export type AttendanceMode = 'signature_copy' | 'signature_original' | 'admin_confirmed' | 'none'

export interface PlannedSession {
  cohort: '#001' | '#002'
  groupName: string
  session: number
  weekday: 'Tue' | 'Thu' | 'Sat'
  date: string
  teamupEventId: string | null
  teamupTitle: string
  teamupTime: string
  teamupStart: string
  teamupEnd: string
  recordedStart: string
  recordedEnd: string
  templateVersion: 1 | 2
  approximateBreaks: boolean
  breaks: TheoryBreak[]
  netMinutes: number
  grossHours: number
  signatures: number
  attendanceMode: AttendanceMode
  annotation: string | null
  display: string
  teamupAction: string
}

interface SessionSeed {
  session: number
  weekday: 'Tue' | 'Thu' | 'Sat'
  date: string
  teamupEventId: string | null
  teamupTitle: string
  teamupStart: string
  teamupEnd: string
  recordedStart: string
  recordedEnd: string
  templateVersion: 1 | 2
  signatures: number
  attendanceMode: AttendanceMode
  annotation: string | null
  display: string
  teamupAction: string
}

const dayNumber: Record<SessionSeed['weekday'], number> = { Tue: 2, Thu: 4, Sat: 6 }

const copy = (partial: Omit<SessionSeed, 'attendanceMode' | 'annotation' | 'display' | 'signatures' | 'teamupAction'> & {
  signatures?: number
  teamupAction?: string
}): SessionSeed => ({
  signatures: 9,
  attendanceMode: 'signature_copy',
  annotation: SIGNATURE_COPY_NOTE,
  display: 'existing signature shown as-is (no admin wording)',
  teamupAction: 'no change',
  ...partial,
})

const COHORT_001: SessionSeed[] = [
  copy({ session: 1, weekday: 'Tue', date: '2026-08-04', teamupEventId: '2142906945', teamupTitle: 'Class 1 Theory 1/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({ session: 2, weekday: 'Thu', date: '2026-08-06', teamupEventId: '2142906946', teamupTitle: 'Class 1 Theory 2/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({ session: 3, weekday: 'Sat', date: '2026-08-08', teamupEventId: '2142906947', teamupTitle: 'Class 1 Theory 3/14 - Qazi Truck #001', teamupStart: '09:00', teamupEnd: '18:00', recordedStart: '09:00', recordedEnd: '18:00', templateVersion: 1 }),
  copy({ session: 4, weekday: 'Tue', date: '2026-08-11', teamupEventId: '2142906948', teamupTitle: 'Class 1 Theory 4/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({ session: 5, weekday: 'Thu', date: '2026-08-13', teamupEventId: '2142906950', teamupTitle: 'Class 1 Theory 5/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({
    session: 6,
    weekday: 'Sat',
    date: '2026-08-15',
    teamupEventId: '2142906951',
    teamupTitle: 'Class 1 Theory 6/14 - Qazi Truck #001',
    teamupStart: '08:30',
    teamupEnd: '17:30',
    recordedStart: '09:00',
    recordedEnd: '18:00',
    templateVersion: 1,
    teamupAction: 'no change (Teamup keeps 08:30-17:30; app records 09:00-18:00)',
  }),
  copy({ session: 7, weekday: 'Tue', date: '2026-08-18', teamupEventId: '2142906952', teamupTitle: 'Class 1 Theory 7/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({ session: 8, weekday: 'Thu', date: '2026-08-20', teamupEventId: '2142906953', teamupTitle: 'Class 1 Theory 8/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({ session: 9, weekday: 'Sat', date: '2026-08-22', teamupEventId: '2142906954', teamupTitle: 'Class 1 Theory 9/14 - Qazi Truck #001', teamupStart: '09:00', teamupEnd: '18:00', recordedStart: '09:00', recordedEnd: '18:00', templateVersion: 1 }),
  copy({ session: 10, weekday: 'Tue', date: '2026-08-25', teamupEventId: '2142906956', teamupTitle: 'Class 1 Theory 10/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({ session: 11, weekday: 'Thu', date: '2026-08-27', teamupEventId: '2142906957', teamupTitle: 'Class 1 Theory 11/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({ session: 12, weekday: 'Sat', date: '2026-08-29', teamupEventId: '2142906960', teamupTitle: 'Class 1 Theory 12/14 - Qazi Truck #001', teamupStart: '09:00', teamupEnd: '18:00', recordedStart: '09:00', recordedEnd: '18:00', templateVersion: 1 }),
  copy({ session: 13, weekday: 'Tue', date: '2026-09-01', teamupEventId: '2142906962', teamupTitle: 'Class 1 Theory 13/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  copy({ session: 14, weekday: 'Thu', date: '2026-09-03', teamupEventId: '2142906963', teamupTitle: 'Class 1 Theory 14/14 - Qazi Truck #001', teamupStart: '17:30', teamupEnd: '21:30', recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1 }),
  {
    session: 15,
    weekday: 'Sat',
    date: '2026-09-05',
    teamupEventId: '2163313207',
    teamupTitle: 'Class 1 Theory 15 - Qazi Truck #001',
    teamupStart: '09:00',
    teamupEnd: '18:00',
    recordedStart: '09:00',
    recordedEnd: '18:00',
    templateVersion: 1,
    signatures: 9,
    attendanceMode: 'signature_original',
    annotation: null,
    display: 'signature',
    teamupAction: 'no change',
  },
]

const future = 'future: capture with per-lesson signatures (art. 98 c)'

function cohort002(partial: Omit<SessionSeed, 'teamupAction' | 'display'> & {
  teamupAction?: string
  display?: string
}): SessionSeed {
  return {
    teamupAction: 'no change',
    display: '',
    ...partial,
  }
}

const COHORT_002: SessionSeed[] = [
  cohort002({
    session: 1, weekday: 'Tue', date: '2026-10-13', teamupEventId: '2186751997',
    teamupTitle: 'Class 1 Theory 1/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 3,
    attendanceMode: 'signature_original', annotation: SIGNATURE_LABEL_NOTE, display: 'signature',
  }),
  cohort002({
    session: 2, weekday: 'Thu', date: '2026-10-15', teamupEventId: '2186751998',
    teamupTitle: 'Class 1 Theory 2/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'admin_confirmed', annotation: null,
    display: 'Attended — signature pending / Présent(e) — signature en attente',
  }),
  cohort002({
    session: 3, weekday: 'Sat', date: '2026-10-17', teamupEventId: '2186751999',
    teamupTitle: 'Class 1 Theory 3/14 - Qazi Truck #002', teamupStart: '09:00', teamupEnd: '18:00',
    recordedStart: '09:00', recordedEnd: '18:00', templateVersion: 1, signatures: 0,
    attendanceMode: 'admin_confirmed', annotation: null,
    display: 'Attended — signature pending / Présent(e) — signature en attente',
  }),
  cohort002({
    session: 4, weekday: 'Tue', date: '2026-10-20', teamupEventId: '2186752000',
    teamupTitle: 'Class 1 Theory 4/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'admin_confirmed', annotation: null,
    display: 'Attended — signature pending / Présent(e) — signature en attente',
  }),
  cohort002({
    session: 5, weekday: 'Thu', date: '2026-10-22', teamupEventId: '2186752002',
    teamupTitle: 'Class 1 Theory 5/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'admin_confirmed', annotation: null,
    display: 'Attended — signature pending / Présent(e) — signature en attente',
  }),
  cohort002({
    session: 6, weekday: 'Sat', date: '2026-10-24', teamupEventId: '2186752004',
    teamupTitle: 'Class 1 Theory 6/14 - Qazi Truck #002', teamupStart: '09:00', teamupEnd: '18:00',
    recordedStart: '09:00', recordedEnd: '18:00', templateVersion: 1, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
  }),
  cohort002({
    session: 7, weekday: 'Tue', date: '2026-10-27', teamupEventId: '2186752005',
    teamupTitle: 'Class 1 Theory 7/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
  }),
  cohort002({
    session: 8, weekday: 'Thu', date: '2026-10-29', teamupEventId: '2186752006',
    teamupTitle: 'Class 1 Theory 8/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
  }),
  cohort002({
    session: 9, weekday: 'Sat', date: '2026-10-31', teamupEventId: '2186752007',
    teamupTitle: 'Class 1 Theory 9/14 - Qazi Truck #002', teamupStart: '09:00', teamupEnd: '18:00',
    recordedStart: '08:30', recordedEnd: '17:30', templateVersion: 2, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
    teamupAction: 'no change (app records v2 08:30-17:30; Teamup write is out of scope)',
  }),
  cohort002({
    session: 10, weekday: 'Tue', date: '2026-11-03', teamupEventId: '2186752009',
    teamupTitle: 'Class 1 Theory 10/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
  }),
  cohort002({
    session: 11, weekday: 'Thu', date: '2026-11-05', teamupEventId: '2186752012',
    teamupTitle: 'Class 1 Theory 11/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
  }),
  cohort002({
    session: 12, weekday: 'Sat', date: '2026-11-07', teamupEventId: '2186752013',
    teamupTitle: 'Class 1 Theory 12/14 - Qazi Truck #002', teamupStart: '09:00', teamupEnd: '18:00',
    recordedStart: '08:30', recordedEnd: '17:30', templateVersion: 2, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
    teamupAction: 'no change (app records v2 08:30-17:30; Teamup write is out of scope)',
  }),
  cohort002({
    session: 13, weekday: 'Tue', date: '2026-11-10', teamupEventId: '2186752014',
    teamupTitle: 'Class 1 Theory 13/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '21:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
  }),
  cohort002({
    session: 14, weekday: 'Thu', date: '2026-11-12', teamupEventId: '2186752016',
    teamupTitle: 'Class 1 Theory 14/14 - Qazi Truck #002', teamupStart: '17:30', teamupEnd: '20:30',
    recordedStart: '17:30', recordedEnd: '21:30', templateVersion: 1, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
    teamupAction: 'no change (app records 17:30-21:30; Teamup update is out of scope)',
  }),
  cohort002({
    session: 15, weekday: 'Sat', date: '2026-11-14', teamupEventId: null,
    teamupTitle: '', teamupStart: '', teamupEnd: '',
    recordedStart: '08:30', recordedEnd: '17:30', templateVersion: 2, signatures: 0,
    attendanceMode: 'none', annotation: null, display: '',
    teamupAction: 'no change (class 15 is recorded in the app only; Teamup create is out of scope)',
  }),
]

function materialize(cohort: '#001' | '#002', groupName: string, seed: SessionSeed): PlannedSession {
  const template = seed.templateVersion === 1 ? TEMPLATE_V1 : TEMPLATE_V2
  const breaks = breaksForDay(template, dayNumber[seed.weekday])
  const net = netMinutes(seed.recordedStart, seed.recordedEnd, breaks)
  const gross = seed.teamupStart && seed.teamupEnd ? grossMinutes(seed.teamupStart, seed.teamupEnd) / 60 : 0
  return {
    cohort,
    groupName,
    session: seed.session,
    weekday: seed.weekday,
    date: seed.date,
    teamupEventId: seed.teamupEventId,
    teamupTitle: seed.teamupTitle,
    teamupTime: seed.teamupStart ? `${seed.teamupStart}-${seed.teamupEnd}` : '',
    teamupStart: seed.teamupStart,
    teamupEnd: seed.teamupEnd,
    recordedStart: seed.recordedStart,
    recordedEnd: seed.recordedEnd,
    templateVersion: seed.templateVersion,
    approximateBreaks: template.approximateBreakTimes,
    breaks,
    netMinutes: net,
    grossHours: gross,
    signatures: seed.signatures,
    attendanceMode: seed.attendanceMode,
    annotation: seed.annotation,
    display: seed.display,
    teamupAction: seed.teamupAction || 'no change',
  }
}

export function plannedSessions(): PlannedSession[] {
  return [
    ...COHORT_001.map(seed => materialize('#001', COHORT_001_NAME, seed)),
    ...COHORT_002.map(seed => materialize('#002', COHORT_002_NAME, seed)),
  ]
}

export interface PlannedCorrection {
  kind: 'NET_DURATION' | 'TIME_CORRECTION' | 'SESSION_ADDED' | 'SIGNATURE_ANNOTATION'
  reason: string
  count: number
}

export function plannedCorrections(session: PlannedSession): PlannedCorrection[] {
  const out: PlannedCorrection[] = []
  if (!session.teamupEventId) {
    out.push({
      kind: 'SESSION_ADDED',
      reason: 'SESSION ADDED to reach 15 classes / 75 h (Ars 2026-10-24)',
      count: 1,
    })
  } else {
    out.push({
      kind: 'NET_DURATION',
      reason: 'net-duration computed (gross->net)',
      count: 1,
    })
  }
  if (session.teamupEventId && session.teamupTime && session.teamupTime !== `${session.recordedStart}-${session.recordedEnd}`) {
    out.push({
      kind: 'TIME_CORRECTION',
      reason: `TIME CORRECTION ${session.teamupTime} -> ${session.recordedStart}-${session.recordedEnd} (old value kept; Ars 2026-10-24)`,
      count: 1,
    })
  }
  if (session.annotation && session.signatures > 0) {
    out.push({
      kind: 'SIGNATURE_ANNOTATION',
      reason: session.annotation,
      count: session.signatures,
    })
  }
  return out
}

export function correctionEntryCount(session: PlannedSession): number {
  return plannedCorrections(session).reduce((sum, entry) => sum + entry.count, 0)
}

export interface CohortSummary {
  cohort: '#001' | '#002'
  sessions: number
  netMinutes: number
  netLabel: string
  signatureAttendance: number
  adminAttendance: number
  corrections: number
}

export function summarizeCohort(cohort: '#001' | '#002', sessions = plannedSessions()): CohortSummary {
  const rows = sessions.filter(session => session.cohort === cohort)
  const signatureAttendance = rows.reduce((sum, session) => {
    if (session.attendanceMode === 'signature_copy' || session.attendanceMode === 'signature_original') {
      return sum + session.signatures
    }
    return sum
  }, 0)
  const adminAttendance = rows.reduce((sum, session) => (
    session.attendanceMode === 'admin_confirmed' ? sum + (cohort === '#001' ? COHORT_001_STUDENTS.length : COHORT_002_STUDENTS.length) : sum
  ), 0)
  const net = rows.reduce((sum, session) => sum + session.netMinutes, 0)
  return {
    cohort,
    sessions: rows.length,
    netMinutes: net,
    netLabel: formatNet(net),
    signatureAttendance,
    adminAttendance,
    corrections: rows.reduce((sum, session) => sum + correctionEntryCount(session), 0),
  }
}

export function attendanceNote(session: PlannedSession): string {
  if (session.attendanceMode === 'signature_copy') {
    return 'attended; backed by existing ClassSignature records as-is (copies); Ars confirmed attendance 2026-10-24 (internal evidenceRef)'
  }
  if (session.attendanceMode === 'signature_original') return 'signature'
  if (session.attendanceMode === 'admin_confirmed') {
    return 'admin_confirmed internally (Ars 2026-10-24); no signature captured'
  }
  if (session.date === '2026-10-24') return 'class 6 is today; capture after class'
  return future
}

function csvCell(value: string | number): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function cohortPlanCsv(sessions = plannedSessions()): string {
  const header = [
    'cohort', 'session', 'teamup_event_id', 'weekday', 'date', 'teamup_title', 'teamup_time',
    'app_before_hours', 'signatures', 'after_time', 'template', 'breaks', 'after_net_min', 'after_net',
    'attendance_by_signature', 'attendance_admin_confirmed', 'teamup_action', 'signatures_changed',
    'correction_entries', 'display',
  ]
  const lines = [header.join(',')]
  for (const session of sessions) {
    const signatureCount = session.attendanceMode === 'signature_copy' || session.attendanceMode === 'signature_original'
      ? session.signatures
      : 0
    const adminCount = session.attendanceMode === 'admin_confirmed'
      ? (session.cohort === '#001' ? COHORT_001_STUDENTS.length : COHORT_002_STUDENTS.length)
      : 0
    const breaks = session.breaks.map(entry => {
      const start = entry.start || entry.approxStart || ''
      const endText = entry.end || (entry.approxStart ? addMinutes(entry.approxStart, entry.minutes) : '')
      const span = start && endText ? `${start}-${endText}` : start
      return `${span} ${entry.kind}`.trim()
    }).join(' ')
    const template = session.templateVersion === 1
      ? (session.weekday === 'Sat'
        ? 'v1 Sat 09:00-18:00 (standard/approximate break positions)'
        : 'v1 Tue/Thu 17:30-21:30 (standard/approximate break position)')
      : 'v2 Sat 08:30-17:30 (exact break times)'
    lines.push([
      session.cohort,
      session.session,
      session.teamupEventId || 'NEW',
      session.weekday,
      session.date,
      session.teamupTitle,
      session.teamupTime,
      session.grossHours,
      session.signatures,
      `${session.recordedStart}-${session.recordedEnd}`,
      template,
      breaks,
      session.netMinutes,
      formatNet(session.netMinutes),
      signatureCount,
      adminCount,
      session.teamupAction,
      'no',
      correctionEntryCount(session),
      session.display,
    ].map(csvCell).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function cohortPlanSummaryText(sessions = plannedSessions()): string {
  const a = summarizeCohort('#001', sessions)
  const b = summarizeCohort('#002', sessions)
  return [
    'Class 1 theory import dry-run. No Teamup writes. No reminder writes. No ClassSignature changes.',
    `#001 ${COHORT_001_NAME}: ${a.sessions} sessions, ${a.netLabel} net, signature attendance ${a.signatureAttendance}, admin-confirmed ${a.adminAttendance}, correction-log entries ${a.corrections}.`,
    `#002 ${COHORT_002_NAME}: ${b.sessions} sessions, ${b.netLabel} net, signature attendance ${b.signatureAttendance}, admin-confirmed ${b.adminAttendance}, correction-log entries ${b.corrections}.`,
    '#002 Saturdays 2026-10-31 and 2026-11-07 are recorded as 08:30-17:30 (template v2, 7h30). Teamup is not updated by this import.',
    '#002 progress from classes 1-5 is 22h30 net, 5/15. Classes 6-15 are not auto-completed.',
    'Audit notes are internalOnly and are not rendered.',
  ].join('\n')
}
