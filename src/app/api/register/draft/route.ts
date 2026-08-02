import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'
import { verifyHuman, rejectBot } from '@/lib/bot-guard'

/**
 * POST /api/register/draft — PUBLIC.
 *
 * Saves an in-progress Class 5 registration so an abandoned sign-up still
 * leaves us a name and a phone number to call back. Called once the visitor
 * clears the Personal Info step, then again on each later step.
 *
 * Writes a StudentRegistration with status "draft". Nothing else in the app
 * reads that status (the students/registrations views filter on
 * submitted/confirmed), so drafts stay out of every existing screen except the
 * Leads page.
 *
 * Turnstile is NOT required here — the captcha is solved at final submit, and
 * demanding it on step 1 would cost us the very leads this endpoint exists to
 * capture. The honeypot + dwell-time layers and a per-IP rate limit still apply.
 */

const MAX = 200
const str = (v: unknown, max = MAX): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request)

  // A human fills this form once. 20/hour/IP leaves room for a shared office
  // NAT and retries while capping a script.
  const limit = rateLimit(`draft:${ip}`, 20, 60 * 60 * 1000)
  if (!limit.ok) return tooManyRequests(limit.retryAfter)

  try {
    const body = await request.json()

    const verdict = await verifyHuman(
      { honeypot: body.company, formStartedAt: body.formStartedAt },
      ip,
    )
    if (!verdict.ok) return rejectBot(verdict.reason)

    const fullName = str(body.fullName, 120)
    const phoneDigits = typeof body.phoneNumber === 'string' ? body.phoneNumber.replace(/\D/g, '') : ''

    // Same gate the form's step 1 enforces — without both we have nothing to
    // call back, so there's no lead worth storing.
    if (!fullName || phoneDigits.length < 10) {
      return NextResponse.json({ error: 'Name and phone required' }, { status: 400 })
    }

    const phoneNumber = phoneDigits.length === 10 ? `1${phoneDigits}` : phoneDigits

    const data = {
      fullName,
      phoneNumber,
      email: str(body.email, 160),
      dob: str(body.dob, 20),
      fullAddress: str(body.address, 250),
      city: str(body.city, 120),
      province: str(body.province, 40),
      postalCode: str(body.postalCode, 20),
      draftStep: str(body.step, 40),
      source: 'online-registration',
      vehicleType: 'car', // the public self-serve flow is Class 5 only
    }

    // Reuse the row this browser already created when we can, so one visitor
    // clicking through 5 steps produces one lead, not five.
    const draftId = str(body.draftId, 40)
    if (draftId) {
      const existing = await prisma.studentRegistration.findUnique({ where: { id: draftId } })
      // Never let a draft update stomp a completed registration.
      if (existing && existing.status === 'draft') {
        const updated = await prisma.studentRegistration.update({ where: { id: draftId }, data })
        return NextResponse.json({ draftId: updated.id })
      }
      if (existing) return NextResponse.json({ draftId: existing.id })
    }

    // No id from the client (or a stale one) — fall back to matching an open
    // draft on the same number, e.g. someone who refreshed mid-form.
    const priorDraft = await prisma.studentRegistration.findFirst({
      where: { phoneNumber, status: 'draft' },
      orderBy: { createdAt: 'desc' },
    })
    if (priorDraft) {
      const updated = await prisma.studentRegistration.update({ where: { id: priorDraft.id }, data })
      return NextResponse.json({ draftId: updated.id })
    }

    // Someone who already completed a registration shouldn't reappear as a
    // "didn't finish" lead just because they reopened the form.
    const completed = await prisma.studentRegistration.findFirst({
      where: { phoneNumber, status: { in: ['submitted', 'confirmed'] } },
      select: { id: true },
    })
    if (completed) return NextResponse.json({ draftId: null, skipped: 'already-registered' })

    const created = await prisma.studentRegistration.create({
      data: {
        ...data,
        status: 'draft',
        // Required column. Drafts are lead data, not live sign-up tokens — a
        // year is simply a far-future value so nothing auto-expires them.
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    })

    return NextResponse.json({ draftId: created.id })
  } catch (error) {
    console.error('[register/draft] failed:', error)
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }
}
