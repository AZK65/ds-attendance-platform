import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CLASS5_PAYMENT_REMINDER_EMAIL_PREFERENCE_KEY } from '@/lib/class5-payment-reminder-email'

// Missing preference means off. The row is created only when an admin turns it on.
export async function GET() {
  const row = await prisma.appPreference.findUnique({
    where: { key: CLASS5_PAYMENT_REMINDER_EMAIL_PREFERENCE_KEY },
  })
  return NextResponse.json({ enabled: row?.value === '1' })
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null) as { enabled?: unknown } | null
  if (!body || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 })
  }

  if (!body.enabled) {
    await prisma.appPreference.deleteMany({
      where: { key: CLASS5_PAYMENT_REMINDER_EMAIL_PREFERENCE_KEY },
    })
    return NextResponse.json({ enabled: false })
  }

  await prisma.appPreference.upsert({
    where: { key: CLASS5_PAYMENT_REMINDER_EMAIL_PREFERENCE_KEY },
    create: { key: CLASS5_PAYMENT_REMINDER_EMAIL_PREFERENCE_KEY, value: '1' },
    update: { value: '1' },
  })
  return NextResponse.json({ enabled: true })
}
