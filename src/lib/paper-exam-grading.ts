import { promises as fs } from 'fs'
import { prisma } from '@/lib/db'
import { OCR_MODEL } from '@/lib/openrouter'
import { parsePaperExamAnswerMap, type PaperExamAnswerMap } from '@/lib/paper-exam-answer-keys'

type ExtractedAnswer = string | null
export type ExtractedPaperAnswers = Record<string, ExtractedAnswer>

interface OcrResult {
  answers: ExtractedPaperAnswers
  uncertain: number[]
  confidence: number
  notes: string
}

const AUTO_GRADE_DELAY_MS = 25_000

declare global {
  var __paperExamGradeTimers: Map<string, ReturnType<typeof setTimeout>> | undefined
  var __paperExamGradeQueue: Promise<void> | undefined
}

const timers = globalThis.__paperExamGradeTimers || new Map<string, ReturnType<typeof setTimeout>>()
globalThis.__paperExamGradeTimers = timers

function cleanAnswer(value: unknown): ExtractedAnswer {
  const answer = String(value || '').trim().toUpperCase()
  return /^[A-D]$/.test(answer) ? answer : null
}

export function normalizeExtractedAnswers(value: unknown, totalQuestions: number): ExtractedPaperAnswers {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const normalized: ExtractedPaperAnswers = {}
  for (let question = 1; question <= totalQuestions; question += 1) {
    normalized[String(question)] = cleanAnswer(source[String(question)])
  }
  return normalized
}

export function calculatePaperExamGrade(
  answers: ExtractedPaperAnswers,
  answerKey: PaperExamAnswerMap,
  totalQuestions: number,
  passingScore: number
) {
  let score = 0
  const missing: number[] = []
  const wrong: number[] = []
  for (let question = 1; question <= totalQuestions; question += 1) {
    const key = String(question)
    const answer = cleanAnswer(answers[key])
    if (!answer) missing.push(question)
    else if (answer === answerKey[key]) score += 1
    else wrong.push(question)
  }
  return { score, passed: score >= passingScore, missing, wrong }
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('OCR returned an unreadable response')
  }
}

async function extractAnswersFromPages(
  pages: Array<{ filePath: string; mimetype: string }>,
  totalQuestions: number
): Promise<OcrResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')

  const imagePages = pages.filter(page => page.mimetype.startsWith('image/'))
  if (imagePages.length === 0) throw new Error('No image pages are available for OCR')

  const content: Array<Record<string, unknown>> = [{
    type: 'text',
    text: `Read the student's completed multiple-choice paper exam. Extract only the student's marked answers for questions 1 through ${totalQuestions}. Valid choices are A, B, C, or D. Marks may be circles, checks, fills, handwritten letters, or crossed-out corrections. Do not solve the questions and do not guess from the printed wording. If an answer is blank, has multiple active choices, is cropped, or is not clearly readable, return null and include that question number in uncertain. Combine all attached page photos into one result. Return JSON only in this exact shape: {"answers":{"1":"A","2":null},"uncertain":[2],"confidence":0.92,"notes":"short review note"}.`,
  }]

  for (const page of imagePages.slice(0, 12)) {
    const bytes = await fs.readFile(page.filePath)
    content.push({
      type: 'image_url',
      image_url: { url: `data:${page.mimetype};base64,${bytes.toString('base64')}` },
    })
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://qazidrivingschool.ca',
      'X-Title': 'Qazi Paper Exam OCR',
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(90_000),
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`OCR provider failed (${response.status}): ${detail}`)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const rawContent = payload.choices?.[0]?.message?.content
  if (!rawContent) throw new Error('OCR provider returned no answer data')
  const parsed = extractJson(rawContent) as Partial<OcrResult>
  const answers = normalizeExtractedAnswers(parsed.answers, totalQuestions)
  const uncertain = Array.isArray(parsed.uncertain)
    ? [...new Set(parsed.uncertain.map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= totalQuestions))]
    : []
  const confidenceNumber = Number(parsed.confidence)
  return {
    answers,
    uncertain,
    confidence: Number.isFinite(confidenceNumber) ? Math.max(0, Math.min(1, confidenceNumber)) : 0,
    notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 500) : '',
  }
}

export async function gradePaperExamSubmission(submissionId: string) {
  cancelPaperExamGrading(submissionId)
  const submission = await prisma.paperExamSubmission.findUnique({
    where: { id: submissionId },
    include: {
      session: true,
      pages: { orderBy: { pageNumber: 'asc' } },
    },
  })
  if (!submission) throw new Error('Exam submission not found')

  const answerKey = parsePaperExamAnswerMap(submission.session.answerKey)
  const totalQuestions = submission.session.totalQuestions || Object.keys(answerKey).length
  const passingScore = submission.session.passingScore || Math.ceil(totalQuestions * 0.75)
  if (!totalQuestions || Object.keys(answerKey).length !== totalQuestions) {
    throw new Error('This exam session does not have a complete answer key')
  }

  await prisma.paperExamSubmission.update({
    where: { id: submission.id },
    data: { status: 'processing', error: null },
  })

  try {
    const extracted = await extractAnswersFromPages(submission.pages, totalQuestions)
    const grade = calculatePaperExamGrade(extracted.answers, answerKey, totalQuestions, passingScore)
    const uncertain = [...new Set([...extracted.uncertain, ...grade.missing])].sort((a, b) => a - b)
    const needsReview = uncertain.length > 0 || extracted.confidence < 0.75
    const storedResult = {
      answers: extracted.answers,
      uncertain,
      notes: extracted.notes,
      wrong: grade.wrong,
    }
    return await prisma.paperExamSubmission.update({
      where: { id: submission.id },
      data: {
        status: needsReview ? 'review' : 'graded',
        extractedAnswers: JSON.stringify(storedResult),
        score: grade.score,
        totalQuestions,
        passed: needsReview ? null : grade.passed,
        confidence: extracted.confidence,
        error: null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR grading failed'
    await prisma.paperExamSubmission.update({
      where: { id: submission.id },
      data: { status: 'failed', error: message.slice(0, 1000) },
    })
    throw error
  }
}

export async function saveReviewedPaperExamAnswers(submissionId: string, value: unknown) {
  cancelPaperExamGrading(submissionId)
  const submission = await prisma.paperExamSubmission.findUnique({
    where: { id: submissionId },
    include: { session: true },
  })
  if (!submission) throw new Error('Exam submission not found')
  const answerKey = parsePaperExamAnswerMap(submission.session.answerKey)
  const totalQuestions = submission.session.totalQuestions || Object.keys(answerKey).length
  const passingScore = submission.session.passingScore || Math.ceil(totalQuestions * 0.75)
  const answers = normalizeExtractedAnswers(value, totalQuestions)
  const grade = calculatePaperExamGrade(answers, answerKey, totalQuestions, passingScore)
  if (grade.missing.length > 0) throw new Error(`Answer${grade.missing.length === 1 ? '' : 's'} ${grade.missing.join(', ')} still need review`)
  return prisma.paperExamSubmission.update({
    where: { id: submission.id },
    data: {
      status: 'graded',
      extractedAnswers: JSON.stringify({ answers, uncertain: [], notes: 'Reviewed by staff', wrong: grade.wrong }),
      score: grade.score,
      totalQuestions,
      passed: grade.passed,
      confidence: 1,
      error: null,
    },
  })
}

function enqueueGrade(submissionId: string) {
  const previous = globalThis.__paperExamGradeQueue || Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        await gradePaperExamSubmission(submissionId)
        console.log(`[PaperExam] OCR graded submission ${submissionId}`)
      } catch (error) {
        console.error(`[PaperExam] OCR grading failed for ${submissionId}:`, error)
      }
    })
  globalThis.__paperExamGradeQueue = next
}

export function schedulePaperExamGrading(submissionId: string, delayMs = AUTO_GRADE_DELAY_MS) {
  const existing = timers.get(submissionId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    timers.delete(submissionId)
    enqueueGrade(submissionId)
  }, delayMs)
  timer.unref?.()
  timers.set(submissionId, timer)
}

export function cancelPaperExamGrading(submissionId: string) {
  const timer = timers.get(submissionId)
  if (timer) clearTimeout(timer)
  timers.delete(submissionId)
}
