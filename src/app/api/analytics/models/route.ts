import { NextResponse } from 'next/server'
import { DEFAULT_ANALYTICS_MODEL, filterLiveModels } from '@/lib/analytics-models'

export const dynamic = 'force-dynamic'

// GET - allowlisted analytics models. Live OpenRouter ids narrow the list;
// the allowlist is the fallback when the catalog cannot be read.
export async function GET() {
  let liveIds: string[] | null = null
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const body = await res.json().catch(() => null) as { data?: unknown } | null
      const data = Array.isArray(body?.data) ? body.data : []
      const ids = data
        .map(model => (model && typeof model === 'object' ? (model as { id?: unknown }).id : null))
        .filter((id): id is string => typeof id === 'string')
      if (ids.length > 0) liveIds = ids
    }
  } catch {
    liveIds = null
  }

  return NextResponse.json({
    defaultModel: DEFAULT_ANALYTICS_MODEL,
    models: filterLiveModels(liveIds),
  })
}
