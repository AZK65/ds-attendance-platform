import { NextRequest } from 'next/server'
import { assistantJson, guardAssistant } from '@/lib/assistant/http'
import { searchAssistantStudents } from '@/lib/assistant/students'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = guardAssistant(request)
  if (denied) return denied
  const q = request.nextUrl.searchParams.get('q') || ''
  try {
    const result = await searchAssistantStudents(q)
    if ('error' in result) return assistantJson({ error: result.error }, 400)
    return assistantJson(result)
  } catch (error) {
    console.error('[assistant/students] Failed to search:', error)
    return assistantJson({ error: 'Failed to search students' }, 500)
  }
}
