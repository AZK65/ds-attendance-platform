/**
 * Tiny in-memory per-key rate limiter for the PUBLIC endpoints.
 *
 * Deliberately not Redis/Upstash: this app runs as a single container on one
 * droplet, so a process-local Map is accurate enough and adds no dependency or
 * network hop. It resets on deploy, which is fine — the goal is to stop a bot
 * hammering the paid OCR/email/Clover paths, not to bill anyone.
 *
 * Usage:
 *   const { ok, retryAfter } = rateLimit(`register:${clientIp(request)}`, 5, 60_000)
 *   if (!ok) return tooMany(retryAfter)
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Drop expired buckets occasionally so the Map can't grow without bound under
// a distributed flood (many IPs, one hit each).
let lastSweep = Date.now()
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number; remaining: number } {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0, remaining: limit - 1 }
  }

  existing.count++
  if (existing.count > limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    }
  }
  return { ok: true, retryAfter: 0, remaining: limit - existing.count }
}

/**
 * Best-effort client IP. Caddy sits in front of the app and sets
 * X-Forwarded-For; we take the left-most entry (the original client).
 * Falls back to a constant so a missing header degrades to a global limit
 * rather than to no limit at all.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** 429 with a Retry-After header. */
export function tooManyRequests(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
    {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    },
  )
}
