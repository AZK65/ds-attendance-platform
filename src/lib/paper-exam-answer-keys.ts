export const MODULE_5_PAPER_EXAM = {
  id: 'module-5-a-240115-133030',
  title: 'Module 5',
  testNumber: 'A-240115-133030',
  totalQuestions: 24,
  passingScore: 18,
  answers: {
    1: 'D',
    2: 'C',
    3: 'C',
    4: 'A',
    5: 'B',
    6: 'C',
    7: 'C',
    8: 'D',
    9: 'B',
    10: 'D',
    11: 'A',
    12: 'D',
    13: 'C',
    14: 'B',
    15: 'B',
    16: 'C',
    17: 'B',
    18: 'B',
    19: 'A',
    20: 'B',
    21: 'B',
    22: 'C',
    23: 'C',
    24: 'B',
  } as Record<number, string>,
} as const

export type PaperExamAnswerMap = Record<string, string>

export function module5AnswerKeyJson(): string {
  return JSON.stringify(MODULE_5_PAPER_EXAM.answers)
}

export function parsePaperExamAnswerMap(value: string | null | undefined): PaperExamAnswerMap {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([question, answer]) => [question, String(answer || '').trim().toUpperCase()])
        .filter(([, answer]) => /^[A-D]$/.test(answer))
    )
  } catch {
    return {}
  }
}
