import { Rsep1Error } from './errors'
import {
  ALL_COMPETENCIES,
  PRACTICAL_COMPETENCIES,
  THEORY_COMPETENCIES,
  THEORY_KEYS,
  masteryFromGrade,
  type CompKey,
  type Mastery,
  type Observation,
} from './competencies'

export interface CompetencySlot {
  date: string | null
  mastery: Mastery
}

export interface ManualValues {
  date: string | null
  instructorName: string
  studentName: string
  competencies: {
    c7: CompetencySlot
    c8: CompetencySlot
  }
  observation: Observation
  notes: string
}

export interface TheoryGradeInput {
  competency: string
  gradePercent: number | null
  evaluatedOn: string | null
}

export interface EffectiveValues {
  date: string | null
  instructorName: string
  studentName: string
  competencies: Record<CompKey, CompetencySlot>
  observation: Observation
  notes: string
}

export function emptySlot(): CompetencySlot {
  return { date: null, mastery: null }
}

export function emptyManual(studentName = ''): ManualValues {
  return {
    date: null,
    instructorName: '',
    studentName,
    competencies: { c7: emptySlot(), c8: emptySlot() },
    observation: null,
    notes: '',
  }
}

export function isValidYmd(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function todayToronto(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function isFutureYmd(value: string, now = new Date()): boolean {
  return value > todayToronto(now)
}

export function profileStudentName(fullName: string | null | undefined): string {
  return (fullName || '').replace(/\s*#\d+\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseGradePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 100) {
    throw new Rsep1Error(400, 'grade_not_integer', 'Grade must be a whole percent from 0 to 100')
  }
  return numeric
}

export function parseTheoryDate(grade: number | null, value: unknown, now = new Date()): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  if (typeof value !== 'string' || !isValidYmd(value)) {
    throw new Rsep1Error(400, 'bad_date', 'Evaluation date must be YYYY-MM-DD')
  }
  if (grade === null) {
    throw new Rsep1Error(400, 'date_without_grade', 'A date without a grade is not saved')
  }
  if (isFutureYmd(value, now)) {
    throw new Rsep1Error(400, 'future_date', 'Evaluation date cannot be in the future')
  }
  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** True when a save tries to set C1–C6 mastery or dates on the results sheet. */
export function hasTheoryOverride(body: unknown): boolean {
  const root = asRecord(body)
  if (!root) return false
  const values = asRecord(root.values) || root
  const buckets = [values, asRecord(values.competencies)].filter(Boolean) as Record<string, unknown>[]
  for (const bucket of buckets) {
    for (const key of THEORY_KEYS) {
      if (key in bucket) return true
      if (`${key}Date` in bucket || `${key}Mastery` in bucket) return true
    }
  }
  return false
}

function parseSlot(value: unknown, label: string): CompetencySlot {
  if (value === null || value === undefined) return emptySlot()
  const record = asRecord(value)
  if (!record) throw new Rsep1Error(400, 'bad_competency', `${label} is invalid`)
  let mastery: Mastery = null
  if (record.mastery !== null && record.mastery !== undefined && record.mastery !== '') {
    if (record.mastery !== 'Yes' && record.mastery !== 'No') {
      throw new Rsep1Error(400, 'bad_mastery', `${label} mastery must be Yes, No, or empty`)
    }
    mastery = record.mastery
  }
  let date: string | null = null
  if (record.date !== null && record.date !== undefined && record.date !== '') {
    if (typeof record.date !== 'string' || !isValidYmd(record.date)) {
      throw new Rsep1Error(400, 'bad_date', `${label} date must be YYYY-MM-DD`)
    }
    date = record.date
  }
  return { date, mastery }
}

export function parseManualValues(raw: unknown): ManualValues {
  if (hasTheoryOverride({ values: raw })) {
    throw new Rsep1Error(400, 'c1_c6_from_grades', 'C1–C6 come from theory grades and cannot be set on the results sheet')
  }
  const record = asRecord(raw) || {}
  const competencies = asRecord(record.competencies) || {}
  let observation: Observation = null
  if (record.observation !== null && record.observation !== undefined && record.observation !== '') {
    if (record.observation !== 'Mastery' && record.observation !== 'Needs work') {
      throw new Rsep1Error(400, 'bad_observation', 'Observation must be Mastery, Needs work, or empty')
    }
    observation = record.observation
  }
  let date: string | null = null
  if (record.date !== null && record.date !== undefined && record.date !== '') {
    if (typeof record.date !== 'string' || !isValidYmd(record.date)) {
      throw new Rsep1Error(400, 'bad_date', 'Sheet date must be YYYY-MM-DD')
    }
    date = record.date
  }
  return {
    date,
    instructorName: typeof record.instructorName === 'string' ? record.instructorName.trim() : '',
    studentName: typeof record.studentName === 'string' ? record.studentName.trim() : '',
    competencies: {
      c7: parseSlot(competencies.c7, 'C7'),
      c8: parseSlot(competencies.c8, 'C8'),
    },
    observation,
    notes: typeof record.notes === 'string' ? record.notes : '',
  }
}

export function readStoredManual(json: string | null | undefined, fallbackName = ''): ManualValues {
  if (!json) return emptyManual(fallbackName)
  try {
    const parsed = JSON.parse(json) as unknown
    const record = asRecord(parsed) || {}
    const competencies = asRecord(record.competencies) || {}
    const manual = parseManualValues({
      ...record,
      competencies: { c7: competencies.c7 ?? null, c8: competencies.c8 ?? null },
    })
    if (!manual.studentName && fallbackName) manual.studentName = fallbackName
    return manual
  } catch (error) {
    if (error instanceof Rsep1Error && error.code === 'c1_c6_from_grades') {
      const parsed = JSON.parse(json) as Record<string, unknown>
      const competencies = asRecord(parsed.competencies) || {}
      return parseManualValues({
        ...parsed,
        competencies: { c7: competencies.c7 ?? null, c8: competencies.c8 ?? null },
      })
    }
    return emptyManual(fallbackName)
  }
}

export function getEffectiveRsep1Values(manual: ManualValues, theory: TheoryGradeInput[]): EffectiveValues {
  const competencies = {} as Record<CompKey, CompetencySlot>
  for (const item of THEORY_COMPETENCIES) {
    const row = theory.find(entry => entry.competency.toUpperCase() === item.code)
    const grade = row?.gradePercent ?? null
    const dated = grade !== null && isValidYmd(row?.evaluatedOn) ? row!.evaluatedOn : null
    competencies[item.key] = { mastery: masteryFromGrade(grade), date: dated }
  }
  for (const item of PRACTICAL_COMPETENCIES) {
    competencies[item.key] = manual.competencies[item.key]
  }
  return {
    date: manual.date,
    instructorName: manual.instructorName,
    studentName: manual.studentName,
    competencies,
    observation: manual.observation,
    notes: manual.notes,
  }
}

export function isSheetComplete(values: EffectiveValues): boolean {
  return ALL_COMPETENCIES.every(item => {
    const slot = values.competencies[item.key]
    return slot.mastery === 'Yes' && isValidYmd(slot.date)
  }) && values.observation === 'Mastery'
}

export function masteredCount(values: EffectiveValues): number {
  return ALL_COMPETENCIES.filter(item => values.competencies[item.key].mastery === 'Yes').length
}

export function resultsFilename(studentName: string, sheetDate: string | null, now = new Date()): string {
  const safe = (studentName || 'student')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'student'
  const day = isValidYmd(sheetDate) ? sheetDate : todayToronto(now)
  return `RSEP-1-${safe}-${day}.pdf`
}
