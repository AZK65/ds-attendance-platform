import { prisma } from '@/lib/db'
import {
  ADMIN_AUTH_COOKIE,
  ADMIN_SID_COOKIE,
  LEGACY_AUTH_TOKEN,
  verifyAdminToken,
} from '@/lib/admin-token'

export type StaffSession = {
  sid: string
  label: string | null
  legacy: boolean
}

type CookieSource = {
  cookies: { get(name: string): { value: string } | undefined }
}

// A staff browser is signed in only when this returns a row.
// Signed tokens are checked against AdminSession so logout and device revoke
// take effect on the next request. The old literal cookie is accepted only
// together with a session id that is still in the table, so devices that
// logged in before this change keep working. A lookup error fails open for a
// signed unexpired token (a database blip must not log every device out) and
// fails closed for the forgeable literal.
export async function resolveStaffSession(request: CookieSource): Promise<StaffSession | null> {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value
  const sidCookie = request.cookies.get(ADMIN_SID_COOKIE)?.value || ''
  if (!token) return null

  const verified = verifyAdminToken(token)
  if (verified) {
    if (verified.sid !== sidCookie) return null
    try {
      const row = await prisma.adminSession.findUnique({ where: { id: verified.sid } })
      if (!row) return null
      return { sid: row.id, label: row.label, legacy: false }
    } catch (error) {
      console.error('[admin-auth] signed session lookup failed open:', error)
      return { sid: verified.sid, label: null, legacy: false }
    }
  }

  if (token === LEGACY_AUTH_TOKEN && sidCookie) {
    try {
      const row = await prisma.adminSession.findUnique({ where: { id: sidCookie } })
      if (!row) return null
      return { sid: row.id, label: row.label, legacy: true }
    } catch (error) {
      console.error('[admin-auth] legacy session lookup failed closed:', error)
      return null
    }
  }

  return null
}
