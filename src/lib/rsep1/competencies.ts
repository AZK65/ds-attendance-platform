export const THEORY_COMPETENCIES = [
  { code: 'C1', key: 'c1', name: 'Heavy vehicle driver' },
  { code: 'C2', key: 'c2', name: 'Characteristics and components of heavy vehicles' },
  { code: 'C3', key: 'c3', name: 'Laws and regulations' },
  { code: 'C4', key: 'c4', name: 'Preparing to drive' },
  { code: 'C5', key: 'c5', name: 'Air brakes' },
  { code: 'C6', key: 'c6', name: 'Circle check' },
] as const

export const PRACTICAL_COMPETENCIES = [
  { code: 'C7', key: 'c7', name: 'Basic manoeuvres' },
  { code: 'C8', key: 'c8', name: 'Driving on the road network' },
] as const

export const ALL_COMPETENCIES = [...THEORY_COMPETENCIES, ...PRACTICAL_COMPETENCIES] as const

export type TheoryCode = (typeof THEORY_COMPETENCIES)[number]['code']
export type CompKey = (typeof ALL_COMPETENCIES)[number]['key']
export type Mastery = 'Yes' | 'No' | null
export type Observation = 'Mastery' | 'Needs work' | null

export const MASTERY_THRESHOLD = 80
export const THEORY_KEYS = THEORY_COMPETENCIES.map(item => item.key)

export function isTheoryCode(value: string): value is TheoryCode {
  return THEORY_COMPETENCIES.some(item => item.code === value.toUpperCase())
}

export function theoryByCode(code: string) {
  return THEORY_COMPETENCIES.find(item => item.code === code.toUpperCase()) || null
}

/** ≥ 80 is Yes (80 counts). Below 80 is No. No grade is neither. Never rounds. */
export function masteryFromGrade(grade: number | null | undefined): Mastery {
  if (grade === null || grade === undefined || Number.isNaN(grade)) return null
  return grade >= MASTERY_THRESHOLD ? 'Yes' : 'No'
}

export function theorySummary(grades: Array<number | null | undefined>) {
  let recorded = 0
  let mastered = 0
  let needsWork = 0
  for (const grade of grades) {
    if (grade === null || grade === undefined || Number.isNaN(grade)) continue
    recorded += 1
    if (grade >= MASTERY_THRESHOLD) mastered += 1
    else needsWork += 1
  }
  return { recorded, mastered, needsWork, total: THEORY_COMPETENCIES.length }
}

export function theorySummaryLine(summary: { recorded: number; mastered: number; needsWork: number }) {
  return `Theory Evaluations: ${summary.recorded}/6 recorded · Mastered: ${summary.mastered} · Needs work: ${summary.needsWork}`
}
