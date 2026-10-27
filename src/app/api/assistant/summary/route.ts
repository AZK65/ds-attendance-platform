import { NextRequest } from 'next/server'
import { parseAssistantRange } from '@/lib/assistant/dates'
import { assistantJson, guardAssistant } from '@/lib/assistant/http'
import { loadDailySummary } from '@/lib/assistant/summary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = guardAssistant(request)
  if (denied) return denied
  const parsed = parseAssistantRange(request.nextUrl.searchParams)
  if (!parsed.ok) return assistantJson({ error: parsed.error }, 400)
  try {
    return assistantJson(await loadDailySummary(parsed.range))
  } catch (error) {
    console.error('[assistant/summary] Failed to load summary:', error)
    return assistantJson({ error: 'Failed to load summary' }, 500)
  }
}
