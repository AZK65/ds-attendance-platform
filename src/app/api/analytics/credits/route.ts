import { NextResponse } from 'next/server'
import { fetchOpenRouterBalance, presentOpenRouterBalance, type OpenRouterBalance } from '@/lib/openrouter-balance'

export const dynamic = 'force-dynamic'

function unconfigured(): OpenRouterBalance {
  return {
    source: null,
    remainingUsd: null,
    totalCreditsUsd: null,
    totalUsageUsd: null,
    keyUsageUsd: null,
    keyLimitUsd: null,
    note: null,
    error: 'OpenRouter is not configured.',
  }
}

// GET - remaining OpenRouter credits. The key stays on the server.
export async function GET() {
  const apiKey = process.env.OPENROUTER_MANAGEMENT_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()
  const balance = apiKey ? await fetchOpenRouterBalance(apiKey) : unconfigured()
  return NextResponse.json(presentOpenRouterBalance(balance), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
