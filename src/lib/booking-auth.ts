import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

const CODE_TTL_MS = 10 * 60_000
const TOKEN_TTL_MS = 30 * 60_000
const RESEND_WAIT_MS = 60_000
const MAX_ATTEMPTS = 5

function secret(): string {
  const value = process.env.BOOKING_AUTH_SECRET || process.env.AUTH_PASSWORD
  if (!value) throw new Error('BOOKING_AUTH_SECRET or AUTH_PASSWORD is required')
  return value
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(-10)
}

export function normalizeStudentName(value: string): string {
  return value
    .replace(/#\s*\d+/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export async function findBookingStudent(name: string, phone: string) {
  const digits = phoneDigits(phone)
  if (name.trim().length < 2 || digits.length !== 10) return null

  const fields = { id: true, name: true, phone: true, phoneAlt: true } as const
  let candidates = await prisma.student.findMany({
    where: {
      OR: [
        { phone: { contains: digits } },
        { phoneAlt: { contains: digits } },
        { phone: { contains: digits.slice(-7) } },
        { phoneAlt: { contains: digits.slice(-7) } },
      ],
    },
    select: fields,
    take: 50,
  })

  if (candidates.length === 0) {
    const recent = await prisma.student.findMany({
      select: fields,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    })
    candidates = recent.filter((student) =>
      [student.phone, student.phoneAlt].some((candidate) => phoneDigits(candidate || '') === digits)
    )
  }

  const needle = normalizeStudentName(name)
  const parts = needle.split(' ').filter(Boolean)
  return candidates.find((student) => {
    const haystack = normalizeStudentName(student.name)
    return haystack.includes(needle) || parts.every((part) => haystack.includes(part))
  }) || null
}

function hashCode(studentId: string, code: string): string {
  return createHmac('sha256', secret()).update(`${studentId}:${code}`).digest('hex')
}

export async function issueBookingCode(studentId: string, phone: string): Promise<string> {
  const existing = await prisma.bookingVerification.findUnique({ where: { studentId } })
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_WAIT_MS) {
    const error = new Error('Please wait one minute before requesting another code.')
    error.name = 'RateLimitError'
    throw error
  }

  const code = String(randomInt(100000, 1_000_000))
  await prisma.bookingVerification.upsert({
    where: { studentId },
    create: {
      studentId,
      phone: phoneDigits(phone),
      codeHash: hashCode(studentId, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      lastSentAt: new Date(),
    },
    update: {
      phone: phoneDigits(phone),
      codeHash: hashCode(studentId, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(),
    },
  })
  return code
}

type BookingTokenPayload = { studentId: string; phone: string; exp: number; nonce: string }

function sign(encoded: string): string {
  return createHmac('sha256', secret()).update(encoded).digest('base64url')
}

export async function verifyBookingCode(studentId: string, code: string): Promise<string | null> {
  const record = await prisma.bookingVerification.findUnique({ where: { studentId } })
  if (!record || record.expiresAt.getTime() < Date.now() || record.attempts >= MAX_ATTEMPTS) return null

  const expected = Buffer.from(record.codeHash, 'hex')
  const supplied = Buffer.from(hashCode(studentId, code), 'hex')
  const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied)
  if (!valid) {
    await prisma.bookingVerification.update({
      where: { studentId },
      data: { attempts: { increment: 1 } },
    })
    return null
  }

  await prisma.bookingVerification.delete({ where: { studentId } })
  const payload: BookingTokenPayload = {
    studentId,
    phone: record.phone,
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: randomBytes(12).toString('base64url'),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded)}`
}

export function verifyBookingToken(token: string): BookingTokenPayload | null {
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return null
  const expected = Buffer.from(sign(encoded))
  const supplied = Buffer.from(signature)
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as BookingTokenPayload
    if (!payload.studentId || !payload.phone || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function bookingTokenFromRequest(request: NextRequest): BookingTokenPayload | null {
  const header = request.headers.get('authorization') || ''
  return verifyBookingToken(header.replace(/^Bearer\s+/i, '').trim())
}
