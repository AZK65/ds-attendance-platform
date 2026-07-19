import { prisma } from '@/lib/db'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import type { NextRequest } from 'next/server'

export const LMS_COOKIE = 'lms_sid'
export const LMS_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
}

// ── Passwords ───────────────────────────────────────────────────
export function hashPassword(password: string, salt?: string) {
  const s = salt || randomBytes(12).toString('hex')
  const hash = scryptSync(password, s, 48).toString('hex')
  return { hash, salt: s }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const test = scryptSync(password, salt, 48).toString('hex')
    return timingSafeEqual(Buffer.from(test), Buffer.from(hash))
  } catch {
    return false
  }
}

// Readable random password: 8 chars, unambiguous alphabet.
export function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export const hashResetCode = (code: string) => createHash('sha256').update(code).digest('hex')

// ── Usernames ───────────────────────────────────────────────────
// "GAGNON, MARIE-EVE #12" → "marie-eve.gagnon@qazidrivingschool.ca"
// (comma format is "Last, First"); plain "First Last" keeps its order.
// Deduped with a numeric suffix before the @.
export async function generateUsername(fullName: string): Promise<string> {
  const clean = (s: string) =>
    s
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .toLowerCase()
      .replace(/\s*#\d+\s*/g, ' ')
      .replace(/[^a-z\s-]/g, '')
      .trim()

  let first = '', last = ''
  if (fullName.includes(',')) {
    const [l, f] = fullName.split(',')
    last = clean(l || '')
    first = clean(f || '')
  } else {
    const parts = clean(fullName).split(/\s+/).filter(Boolean)
    first = parts[0] || ''
    last = parts.slice(1).join('-')
  }
  const firstSlug = first.split(/\s+/).join('-') || 'student'
  const lastSlug = last.split(/\s+/).join('-')
  const base = lastSlug ? `${firstSlug}.${lastSlug}` : firstSlug

  for (let i = 0; i < 100; i++) {
    const candidate = `${base}${i === 0 ? '' : i + 1}@qazidrivingschool.ca`
    const exists = await prisma.lmsAccount.findUnique({ where: { username: candidate } })
    if (!exists) return candidate
  }
  return `${base}.${Date.now()}@qazidrivingschool.ca`
}

// ── Vehicle type for a student (car default) ────────────────────
export async function resolveVehicleType(phone: string | null, name: string | null): Promise<string> {
  const digits = (phone || '').replace(/\D/g, '')
  const suffix = digits.length >= 7 ? digits.slice(-10) : ''
  try {
    if (suffix) {
      const reg = await prisma.studentRegistration.findFirst({
        where: { phoneNumber: { contains: suffix }, status: { in: ['confirmed', 'submitted'] } },
        orderBy: { createdAt: 'desc' },
        select: { vehicleType: true },
      })
      if (reg?.vehicleType) return reg.vehicleType
      const truckMember = await prisma.groupMember.findFirst({
        where: { phone: { contains: suffix }, group: { vehicleType: 'truck' } },
        select: { id: true },
      })
      if (truckMember) return 'truck'
    } else if (name && name.length >= 2) {
      const reg = await prisma.studentRegistration.findFirst({
        where: { fullName: { contains: name }, status: { in: ['confirmed', 'submitted'] } },
        orderBy: { createdAt: 'desc' },
        select: { vehicleType: true },
      })
      if (reg?.vehicleType) return reg.vehicleType
    }
  } catch { /* default car */ }
  return 'car'
}

// ── Account creation ────────────────────────────────────────────
// Creates (or returns) the LMS account for a student. Returns the plaintext
// password ONLY when a new account was created or `resetPassword` is set.
export async function ensureAccount(
  studentId: string,
  opts?: { resetPassword?: boolean }
): Promise<{ account: { id: string; username: string; vehicleType: string }; password: string | null; created: boolean }> {
  const student = await prisma.student.findUnique({ where: { id: studentId } })
  if (!student) throw new Error('Student not found')

  const existing = await prisma.lmsAccount.findUnique({ where: { studentId } })
  if (existing && !opts?.resetPassword) {
    return { account: existing, password: null, created: false }
  }

  const password = generatePassword()
  const { hash, salt } = hashPassword(password)

  if (existing) {
    const updated = await prisma.lmsAccount.update({
      where: { id: existing.id },
      data: { passwordHash: hash, passwordSalt: salt, resetCode: null, resetExpires: null },
    })
    return { account: updated, password, created: false }
  }

  const username = await generateUsername(student.name)
  const vehicleType = await resolveVehicleType(student.phone, student.name)
  const account = await prisma.lmsAccount.create({
    data: { studentId, username, passwordHash: hash, passwordSalt: salt, vehicleType },
  })
  return { account, password, created: true }
}

// ── Sessions ────────────────────────────────────────────────────
export async function createLmsSession(accountId: string, userAgent: string | null): Promise<string> {
  const session = await prisma.lmsSessionToken.create({ data: { accountId, userAgent } })
  return session.id
}

// Resolve the logged-in LMS account from the request cookie. Also bumps
// lastSeenAt (throttled to ~1/min by the update itself being cheap).
export async function getLmsAccount(request: NextRequest) {
  const sid = request.cookies.get(LMS_COOKIE)?.value
  if (!sid) return null
  try {
    const session = await prisma.lmsSessionToken.findUnique({
      where: { id: sid },
      include: { account: { include: { student: { select: { name: true, phone: true } } } } },
    })
    if (!session) return null
    prisma.lmsSessionToken.update({ where: { id: sid }, data: { lastSeenAt: new Date() } }).catch(() => {})
    return session.account
  } catch {
    return null
  }
}

// ── Events ──────────────────────────────────────────────────────
export function logLmsEvent(accountId: string, type: string, detail?: string) {
  prisma.lmsEvent.create({ data: { accountId, type, detail: detail || null } }).catch(e =>
    console.error('[lms] event log failed:', e)
  )
}

// ── Resolve a local Student for a profile ───────────────────────
// The student profile is keyed by the external MySQL id, but LMS accounts
// attach to the local SQLite Student. Resolve one from any identifier the
// profile has (local id, licence, phone, name), creating a minimal record if
// none exists so an account can always be made.
export async function resolveLocalStudentId(p: {
  studentId?: string; phone?: string; name?: string; licence?: string
}): Promise<string | null> {
  if (p.studentId) {
    const byId = await prisma.student.findUnique({ where: { id: p.studentId } })
    if (byId) return byId.id
  }
  const licence = (p.licence || '').trim()
  if (licence) {
    const byLic = await prisma.student.findFirst({ where: { licenceNumber: licence } })
    if (byLic) return byLic.id
  }
  const digits = (p.phone || '').replace(/\D/g, '')
  const suffix = digits.length >= 7 ? digits.slice(-10) : ''
  if (suffix) {
    const byPhone = await prisma.student.findFirst({ where: { phone: { contains: suffix } } })
    if (byPhone) return byPhone.id
  }
  if (p.name && p.name.trim().length >= 2) {
    const byName = await prisma.student.findFirst({ where: { name: { contains: p.name.trim() } } })
    if (byName) return byName.id
  }
  return null
}

export async function resolveOrCreateLocalStudentId(p: {
  studentId?: string; phone?: string; name?: string; licence?: string
}): Promise<string> {
  const found = await resolveLocalStudentId(p)
  if (found) return found
  const licence = (p.licence || '').trim()
  const created = await prisma.student.create({
    data: {
      name: p.name?.trim() || 'Student',
      phone: (p.phone || '').replace(/\D/g, '') || null,
      // Only set licence if free (it's unique) — avoid a collision throw.
      licenceNumber: licence && !(await prisma.student.findFirst({ where: { licenceNumber: licence } })) ? licence : null,
    },
  })
  return created.id
}

export const LMS_UPLOADS_DIR = `${process.cwd()}/data/lms-uploads`
