import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastDashboard, broadcastKiosks } from '@/lib/kiosk-hub'

type ClientInfo = Record<'name' | 'phone' | 'email' | 'address' | 'address2' | 'city' | 'province' | 'postalCode', string>

const clean = (value: unknown, max = 160) => String(value || '').trim().slice(0, max)

// Public only to the iPad holding the random, single-use token.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const infoRequest = await prisma.kioskInfoRequest.findUnique({ where: { token } })
  if (!infoRequest || infoRequest.status !== 'pending') {
    return NextResponse.json({ error: 'This form is no longer active' }, { status: 410 })
  }
  if (infoRequest.expiresAt <= new Date()) {
    await prisma.kioskInfoRequest.update({ where: { id: infoRequest.id }, data: { status: 'expired' } })
    return NextResponse.json({ error: 'This form has expired' }, { status: 410 })
  }

  const body = await request.json().catch(() => ({})) as Partial<ClientInfo>
  const fields: ClientInfo = {
    name: clean(body.name),
    phone: clean(body.phone, 40),
    email: clean(body.email),
    address: clean(body.address),
    address2: clean(body.address2, 80),
    city: clean(body.city, 80),
    province: clean(body.province, 30) || 'QC',
    postalCode: clean(body.postalCode, 20).toUpperCase(),
  }
  if (!fields.name || !fields.address || !fields.city || !fields.postalCode) {
    return NextResponse.json({ error: 'Name, address, city and postal code are required' }, { status: 400 })
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const completedAt = new Date()
  await prisma.$transaction([
    prisma.kioskInfoRequest.update({
      where: { id: infoRequest.id },
      data: { status: 'completed', resultData: JSON.stringify(fields), completedAt },
    }),
    prisma.kiosk.update({
      where: { kioskId: infoRequest.kioskId },
      data: { currentStep: 'invoice-info-done', liveData: JSON.stringify(fields), lastSeenAt: completedAt },
    }),
  ])

  // Notify the staff screen that the request is ready. The staff screen then
  // retrieves the canonical saved result through its authenticated endpoint,
  // keeping the client's details out of the shared dashboard event stream.
  broadcastDashboard({ type: 'invoice-info-complete', requestId: infoRequest.id })
  broadcastKiosks().catch(() => {})
  return NextResponse.json({ ok: true })
}
