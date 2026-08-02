/**
 * Bot defence for the public registration flow.
 *
 * Three independent layers, cheapest first:
 *   1. Honeypot  — a field hidden from humans; anything that fills it is a bot.
 *   2. Dwell time — a real person cannot complete the form in a couple of
 *      seconds; a script posting straight to the API can.
 *   3. Turnstile — Cloudflare's captcha, verified server-side.
 *
 * IMPORTANT — fail-open vs fail-closed:
 * Turnstile verification is SKIPPED when TURNSTILE_SECRET_KEY is unset, so the
 * form keeps working before the keys are added (and on local dev). Once the
 * secret IS set, a missing or invalid token is rejected. The honeypot and
 * dwell-time checks always run — they need no configuration.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Minimum seconds a genuine multi-step registration takes. */
const MIN_DWELL_SECONDS = 3

export interface BotSignals {
  /** Honeypot input value — must be empty. */
  honeypot?: unknown
  /** Client clock ms at which the form was opened. */
  formStartedAt?: unknown
  /** Cloudflare Turnstile token from the widget. */
  turnstileToken?: unknown
}

export interface BotVerdict {
  ok: boolean
  /** Short machine-ish reason, safe to log. Never shown verbatim to the user. */
  reason?: string
}

export function turnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY
}

/**
 * Run every layer. Returns ok:false with a reason on the first failure.
 * `ip` is passed to Cloudflare for its own scoring.
 */
export async function verifyHuman(signals: BotSignals, ip: string): Promise<BotVerdict> {
  // 1. Honeypot — real browsers never populate it (it's visually hidden and
  //    marked aria-hidden + tabindex -1, so neither users nor screen readers
  //    reach it). Bots that blindly fill every input do.
  if (typeof signals.honeypot === 'string' && signals.honeypot.trim() !== '') {
    return { ok: false, reason: 'honeypot' }
  }

  // 2. Dwell time. Only enforced when the client sent a plausible timestamp;
  //    a missing value is not treated as a failure on its own because clock
  //    skew and restored tabs make it unreliable.
  const startedAt = Number(signals.formStartedAt)
  if (Number.isFinite(startedAt) && startedAt > 0) {
    const elapsedSeconds = (Date.now() - startedAt) / 1000
    // Negative elapsed means a skewed client clock — ignore rather than block.
    if (elapsedSeconds >= 0 && elapsedSeconds < MIN_DWELL_SECONDS) {
      return { ok: false, reason: 'too-fast' }
    }
  }

  // 3. Turnstile.
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return { ok: true } // not configured yet — fail open

  const token = typeof signals.turnstileToken === 'string' ? signals.turnstileToken : ''
  if (!token) return { ok: false, reason: 'missing-token' }

  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip && ip !== 'unknown') body.set('remoteip', ip)

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      // Cloudflare itself is unhappy — don't lock real students out over it.
      console.warn('[bot-guard] Turnstile siteverify HTTP', res.status)
      return { ok: true }
    }
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (data.success) return { ok: true }
    return { ok: false, reason: `turnstile:${(data['error-codes'] || []).join(',') || 'failed'}` }
  } catch (err) {
    // Network blip / timeout reaching Cloudflare: fail open so a real
    // registration is never lost to an outage. The honeypot and dwell-time
    // layers still applied above.
    console.warn('[bot-guard] Turnstile verify failed open:', err)
    return { ok: true }
  }
}

/** Uniform rejection so probing bots learn nothing about which layer caught them. */
export function rejectBot(reason: string | undefined): Response {
  console.warn('[bot-guard] rejected submission:', reason || 'unknown')
  return new Response(
    JSON.stringify({ error: 'Could not verify this submission. Please reload the page and try again.' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  )
}
