import { NextRequest, NextResponse } from 'next/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { assistantAuthDecision } from '@/lib/assistant/auth'

const WINDOW_MS = 60_000
const REQUESTS_PER_WINDOW = 120
const FAILURES_PER_WINDOW = 20
const GLOBAL_PER_WINDOW = 300

export function assistantJson(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  })
}

/**
 * Bearer auth plus a small in-memory limit. Returns a response when the
 * caller must stop, or null when the handler may read data.
 */
export function guardAssistant(request: NextRequest): NextResponse | null {
  const ip = clientIp(request)
  const globalLimit = rateLimit('assistant:global', GLOBAL_PER_WINDOW, WINDOW_MS)
  const ipLimit = rateLimit(`assistant:${ip}`, REQUESTS_PER_WINDOW, WINDOW_MS)
  if (!globalLimit.ok || !ipLimit.ok) {
    const retryAfter = Math.max(globalLimit.retryAfter, ipLimit.retryAfter)
    return assistantJson(
      { error: 'Too many requests. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(retryAfter) },
    )
  }

  const decision = assistantAuthDecision({
    authorization: request.headers.get('authorization'),
    searchParams: request.nextUrl.searchParams,
    envToken: process.env.ASSISTANT_API_TOKEN,
  })
  if (decision.ok) return null

  if (decision.status === 401) {
    const failures = rateLimit(`assistant-fail:${ip}`, FAILURES_PER_WINDOW, WINDOW_MS)
    if (!failures.ok) {
      return assistantJson(
        { error: 'Too many requests. Please wait a moment and try again.' },
        429,
        { 'Retry-After': String(failures.retryAfter) },
      )
    }
  }

  return assistantJson({ error: decision.error }, decision.status)
}
