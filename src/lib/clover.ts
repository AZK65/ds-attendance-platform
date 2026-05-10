/**
 * Clover Ecommerce API client — auth-then-capture flow for the registration $250.
 *
 * Three operations we need:
 *   - `createAuthorization(sourceToken, amountCents)` → uncaptured charge
 *   - `captureCharge(chargeId, amountCents?)`         → moves funds
 *   - `voidCharge(chargeId)`                          → releases auth
 *
 * Required env:
 *   CLOVER_API_TOKEN                — private API token (already in use)
 *   CLOVER_MERCHANT_ID              — merchant id (already in use)
 *   CLOVER_PUBLIC_TOKEN             — public/ecomm token, exposed to client
 *   CLOVER_SANDBOX                  — 'true' to hit sandbox; otherwise prod
 */

type Json = Record<string, unknown>

const SANDBOX = process.env.CLOVER_SANDBOX === 'true'

/**
 * The Ecommerce API host. Different from the merchant-side `api.clover.com`
 * we used for hosted checkout: ecommerce charges live on `scl.clover.com`
 * (or `scl-sandbox.dev.clover.com` for sandbox).
 */
export const CLOVER_ECOMM_HOST = SANDBOX
  ? 'https://scl-sandbox.dev.clover.com'
  : 'https://scl.clover.com'

/**
 * SDK URL for client-side tokenization (Ecomm.js / Iframe Elements).
 */
export const CLOVER_SDK_URL = SANDBOX
  ? 'https://checkout.sandbox.dev.clover.com/sdk.js'
  : 'https://checkout.clover.com/sdk.js'

export function cloverConfigured(): boolean {
  return !!process.env.CLOVER_API_TOKEN && !!process.env.CLOVER_PUBLIC_TOKEN
}

async function cloverFetch(path: string, init: RequestInit = {}): Promise<{ ok: true; data: Json } | { ok: false; error: string; status: number }> {
  const token = process.env.CLOVER_API_TOKEN
  if (!token) return { ok: false, error: 'CLOVER_API_TOKEN not set', status: 500 }

  const res = await fetch(`${CLOVER_ECOMM_HOST}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  const text = await res.text()
  let data: Json = {}
  try { data = text ? JSON.parse(text) : {} } catch { /* ignore */ }
  if (!res.ok) {
    const err =
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.error === 'object' && data.error && typeof (data.error as Json).message === 'string' && (data.error as Json).message as string) ||
      text ||
      `Clover HTTP ${res.status}`
    return { ok: false, error: String(err), status: res.status }
  }
  return { ok: true, data }
}

export async function createAuthorization(opts: {
  sourceToken: string
  amountCents: number
  description?: string
  metadata?: Record<string, string>
  email?: string
}): Promise<
  | { ok: true; chargeId: string; last4: string | null; brand: string | null }
  | { ok: false; error: string }
> {
  const res = await cloverFetch('/v1/charges', {
    method: 'POST',
    body: JSON.stringify({
      amount: opts.amountCents,
      currency: 'cad',
      source: opts.sourceToken,
      capture: false,
      description: opts.description,
      receipt_email: opts.email,
      metadata: opts.metadata,
    }),
  })
  if (!res.ok) return { ok: false, error: res.error }
  const data = res.data
  const chargeId = (data.id as string) || ''
  if (!chargeId) return { ok: false, error: 'Clover returned no charge id' }
  // Clover may return card details on the charge response under `payment_method` or `card`.
  const card = ((data.payment_method as Json | undefined) || (data.card as Json | undefined) || {}) as Json
  const last4 = (card.last4 as string | undefined) || (card.last_4 as string | undefined) || null
  const brand = (card.brand as string | undefined) || (card.card_brand as string | undefined) || null
  return { ok: true, chargeId, last4, brand }
}

export async function captureCharge(chargeId: string, amountCents?: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await cloverFetch(`/v1/charges/${encodeURIComponent(chargeId)}/capture`, {
    method: 'POST',
    body: JSON.stringify(amountCents != null ? { amount: amountCents } : {}),
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true }
}

export async function voidCharge(chargeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // For an uncaptured charge, Clover treats a refund as a void of the hold.
  const res = await cloverFetch(`/v1/charges/${encodeURIComponent(chargeId)}/refunds`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true }
}
