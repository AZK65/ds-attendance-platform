export type StoredPaperExamResult = {
  answers?: Record<string, string | null>
  uncertain?: number[]
  wrong?: number[]
  notes?: string
  reviewed?: boolean
  reviewedAt?: string
}

export function parseStoredPaperExamResult(value: string | null | undefined): StoredPaperExamResult {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as StoredPaperExamResult : {}
  } catch {
    return {}
  }
}

export function paperExamResultIsVerified(value: string | null | undefined) {
  const result = parseStoredPaperExamResult(value)
  return result.reviewed === true || result.notes === 'Reviewed by staff'
}
