import { NextRequest } from 'next/server'
import { parseAssistantRange } from '@/lib/assistant/dates'
import { loadExamReport } from '@/lib/assistant/exams'
import { assistantJson, guardAssistant } from '@/lib/assistant/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = guardAssistant(request)
  if (denied) return denied
  const parsed = parseAssistantRange(request.nextUrl.searchParams)
  if (!parsed.ok) return assistantJson({ error: parsed.error }, 400)
  try {
    return assistantJson(await loadExamReport(parsed.range))
  } catch (error) {
    console.error('[assistant/exams] Failed to load exams:', error)
    return assistantJson({ error: 'Failed to load exams' }, 500)
  }
}
