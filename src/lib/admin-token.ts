import { createHmac, timingSafeEqual } from 'crypto'
import type { NextResponse } from 'next/server'
import { AUTH_COOKIE_OPTS, SESSION_MAX_AGE } from '@/lib/auth-cookie'

// Admin gate cookie. The value used to be the literal "valid", which anyone
// could set. It is now an HMAC over the device session id and an expiry.
export const ADMIN_AUTH_COOKIE = 'auth-token'
export const ADMIN_SID_COOKIE = 'sid'
export const LEGACY_AUTH_TOKEN = 'valid'
export const INTERNAL_AUTH_HEADER = 'x-internal-secret'

const TOKEN_VERSION = 'v1'
const MIN_INTERNAL_SECRET_LENGTH = 16

// Dedicated key so rotating the login password does not sign every device out.
// AUTH_PASSWORD is the fallback so a deploy that has not set the new variable
// can still sign cookies. Both are server-side only.
export function adminSessionSecret(): string | null {
  const dedicated = process.env.ADMIN_SESSION_SECRET?.trim() || ''
  if (dedicated && !/[\r\n]/.test(dedicated)) return dedicated
  const password = process.env.AUTH_PASSWORD?.trim() || ''
  if (password && !/[\r\n]/.test(password)) return password
  return null
}

export function internalAuthSecret(): string | null {
  const secret = process.env.INTERNAL_AUTH_SECRET?.trim() || ''
  if (secret.length < MIN_INTERNAL_SECRET_LENGTH || /[\r\n]/.test(secret)) return null
  return secret
}

let warnedAboutInternalSecret = false

export function warnIfInternalSecretMissing(): void {
  if (warnedAboutInternalSecret) return
  const raw = process.env.INTERNAL_AUTH_SECRET ?? ''
  if (internalAuthSecret()) return
  warnedAboutInternalSecret = true
  if (!raw.trim()) {
    console.error('[auth] INTERNAL_AUTH_SECRET is not set. Scheduled jobs that call this server will receive 401 until it is set in the server environment.')
    return
  }
  console.error('[auth] INTERNAL_AUTH_SECRET must be at least 16 characters and is being ignored.')
}

export function signAdminToken(sid: string, nowMs = Date.now()): string | null {
  if (!sid || sid.includes('.')) return null
  const secret = adminSessionSecret()
  if (!secret) return null
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE
  const payload = `${TOKEN_VERSION}.${sid}.${exp}`
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export type AdminTokenClaims = { sid: string; exp: number }

export function verifyAdminToken(token: string | undefined | null, nowMs = Date.now()): AdminTokenClaims | null {
  if (!token || token === LEGACY_AUTH_TOKEN) return null
  const secret = adminSessionSecret()
  if (!secret) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [version, sid, expText, signature] = parts
  if (version !== TOKEN_VERSION || !sid || !expText || !signature) return null
  const exp = Number(expText)
  if (!Number.isSafeInteger(exp) || exp * 1000 <= nowMs) return null
  const payload = `${version}.${sid}.${expText}`
  const expectedBytes = createHmac('sha256', secret).update(payload).digest()
  const suppliedBytes = Buffer.from(signature, 'base64url')
  if (suppliedBytes.length !== expectedBytes.length) return null
  if (!timingSafeEqual(suppliedBytes, expectedBytes)) return null
  return { sid, exp }
}

type HeaderSource = { headers: { get(name: string): string | null } }

export function isInternalRequest(request: HeaderSource): boolean {
  const secret = internalAuthSecret()
  if (!secret) return false
  const provided = request.headers.get(INTERNAL_AUTH_HEADER)
  if (!provided) return false
  const suppliedBytes = Buffer.from(provided)
  const expectedBytes = Buffer.from(secret)
  if (suppliedBytes.length !== expectedBytes.length) return false
  return timingSafeEqual(suppliedBytes, expectedBytes)
}

export function internalAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra }
  const secret = internalAuthSecret()
  if (secret) headers[INTERNAL_AUTH_HEADER] = secret
  return headers
}

export function applySessionCookies(response: NextResponse, sid: string, nowMs = Date.now()): boolean {
  const token = signAdminToken(sid, nowMs)
  if (!token) return false
  response.cookies.set(ADMIN_AUTH_COOKIE, token, AUTH_COOKIE_OPTS)
  response.cookies.set(ADMIN_SID_COOKIE, sid, AUTH_COOKIE_OPTS)
  return true
}

export function clearSessionCookies(response: NextResponse): void {
  const clear = { ...AUTH_COOKIE_OPTS, maxAge: 0 }
  response.cookies.set(ADMIN_AUTH_COOKIE, '', clear)
  response.cookies.set(ADMIN_SID_COOKIE, '', clear)
}
