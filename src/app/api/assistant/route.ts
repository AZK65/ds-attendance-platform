import { NextRequest } from 'next/server'
import { guardAssistant, assistantJson } from '@/lib/assistant/http'
import { assistantSchema } from '@/lib/assistant/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = guardAssistant(request)
  if (denied) return denied
  return assistantJson(assistantSchema())
}
