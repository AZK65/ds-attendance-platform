// Server-side OpenRouter balance. Callers must not send the result of the raw
// HTTP response to the browser — use presentOpenRouterBalance, which keeps
// key material out of the payload.

const CREDITS_URL = 'https://openrouter.ai/api/v1/credits'
const KEY_URL = 'https://openrouter.ai/api/v1/key'

const CREDITS_NOTE = 'OpenRouter account credits remaining (purchased minus used).'
const KEY_LIMIT_NOTE = 'Remaining credit limit for this API key. The account balance is only available with a management key.'
const KEY_BUDGET_NOTE = 'Remaining on the tightest budget for this API key. The account balance is only available with a management key.'
const KEY_USAGE_NOTE = 'This API key has no credit cap, so OpenRouter did not return a remaining balance. The account balance is only available with a management key.'

export type OpenRouterBalance = {
  source: 'credits' | 'key' | null
  remainingUsd: number | null
  totalCreditsUsd: number | null
  totalUsageUsd: number | null
  keyUsageUsd: number | null
  keyLimitUsd: number | null
  note: string | null
  error: string | null
}

export type OpenRouterBalanceView = {
  provider: 'openrouter'
  source: 'credits' | 'key' | null
  remainingUsd: number | null
  label: string
  detail: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dataObject(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || !('data' in body)) return null
  const data = (body as { data?: unknown }).data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

export function balanceFromCreditsBody(body: unknown): Pick<OpenRouterBalance, 'remainingUsd' | 'totalCreditsUsd' | 'totalUsageUsd'> | null {
  const data = dataObject(body)
  if (!data) return null
  const totalCreditsUsd = finiteNumber(data.total_credits)
  const totalUsageUsd = finiteNumber(data.total_usage)
  if (totalCreditsUsd == null || totalUsageUsd == null) return null
  return {
    totalCreditsUsd,
    totalUsageUsd,
    remainingUsd: totalCreditsUsd - totalUsageUsd,
  }
}

export function balanceFromKeyBody(body: unknown): Pick<OpenRouterBalance, 'remainingUsd' | 'keyUsageUsd' | 'keyLimitUsd' | 'note'> | null {
  const data = dataObject(body)
  if (!data) return null
  const keyUsageUsd = finiteNumber(data.usage)
  const keyLimitUsd = data.limit === null ? null : finiteNumber(data.limit)
  const limitRemaining = data.limit_remaining === null ? null : finiteNumber(data.limit_remaining)
  const budget = data.effective_budget
  const budgetRemaining = budget && typeof budget === 'object' && !Array.isArray(budget)
    ? finiteNumber((budget as { remaining_usd?: unknown }).remaining_usd)
    : null

  if (limitRemaining == null && budgetRemaining == null && keyUsageUsd == null) return null

  if (limitRemaining != null) {
    return { remainingUsd: limitRemaining, keyUsageUsd, keyLimitUsd, note: KEY_LIMIT_NOTE }
  }
  if (budgetRemaining != null) {
    return { remainingUsd: budgetRemaining, keyUsageUsd, keyLimitUsd, note: KEY_BUDGET_NOTE }
  }
  return { remainingUsd: null, keyUsageUsd, keyLimitUsd, note: KEY_USAGE_NOTE }
}

function emptyBalance(): OpenRouterBalance {
  return {
    source: null,
    remainingUsd: null,
    totalCreditsUsd: null,
    totalUsageUsd: null,
    keyUsageUsd: null,
    keyLimitUsd: null,
    note: null,
    error: null,
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function fetchOpenRouterBalance(apiKey: string, fetchImpl: FetchLike = fetch): Promise<OpenRouterBalance> {
  const headers = { Authorization: `Bearer ${apiKey}` }
  let creditsUnauthorized = false

  try {
    const creditsRes = await fetchImpl(CREDITS_URL, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (creditsRes.ok) {
      const parsed = balanceFromCreditsBody(await readJson(creditsRes))
      if (parsed) {
        return { ...emptyBalance(), source: 'credits', ...parsed, note: CREDITS_NOTE }
      }
    } else {
      creditsUnauthorized = creditsRes.status === 401
      await creditsRes.text().catch(() => '')
    }
  } catch {
    // The key endpoint below is the documented fallback for a normal inference key.
  }

  try {
    const keyRes = await fetchImpl(KEY_URL, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (keyRes.ok) {
      const parsed = balanceFromKeyBody(await readJson(keyRes))
      if (parsed) return { ...emptyBalance(), source: 'key', ...parsed }
    } else if (keyRes.status === 401) {
      creditsUnauthorized = true
      await keyRes.text().catch(() => '')
    } else {
      await keyRes.text().catch(() => '')
    }
  } catch {
    // Reported as an unavailable balance below.
  }

  return {
    ...emptyBalance(),
    error: creditsUnauthorized ? 'OpenRouter rejected the API key.' : 'Could not read the OpenRouter balance.',
  }
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function presentOpenRouterBalance(balance: OpenRouterBalance): OpenRouterBalanceView {
  if (balance.source && balance.remainingUsd != null) {
    return {
      provider: 'openrouter',
      source: balance.source,
      remainingUsd: balance.remainingUsd,
      label: `${formatUsd(balance.remainingUsd)} left`,
      detail: balance.note || CREDITS_NOTE,
    }
  }
  if (balance.source === 'key' && balance.keyUsageUsd != null) {
    return {
      provider: 'openrouter',
      source: 'key',
      remainingUsd: null,
      label: `${formatUsd(balance.keyUsageUsd)} used`,
      detail: balance.note || KEY_USAGE_NOTE,
    }
  }
  return {
    provider: 'openrouter',
    source: null,
    remainingUsd: null,
    label: 'Credits unavailable',
    detail: balance.error || balance.note || 'Could not read the OpenRouter balance.',
  }
}
