import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastKiosks, sendToKiosk } from '@/lib/kiosk-hub'

type ClientInfo = {
  name?: string
  phone?: string
  email?: string
  address?: string
  address2?: string
  city?: string
  province?: string
  postalCode?: string
}

const clean = (value: unknown, max = 160) => String(value || '').trim().slice(0, max)

function cleanInfo(value: ClientInfo | undefined): ClientInfo {
  return {
    name: clean(value?.name),
    phone: clean(value?.phone, 40),
    email: clean(value?.email, 160),
    address: clean(value?.address),
    address2: clean(value?.address2, 80),
    city: clean(value?.city, 80),
    province: clean(value?.province, 30) || 'QC',
    postalCode: clean(value?.postalCode, 20),
  }
}

// Authenticated invoice page: create a one-time client-information request
// and push it to the selected iPad over the existing kiosk SSE channel.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { kioskId?: string; fields?: ClientInfo }
    const kiosk = body.kioskId
      ? await prisma.kiosk.findUnique({ where: { id: body.kioskId } })
      : null
    if (!kiosk) return NextResponse.json({ error: 'Kiosk not found' }, { status: 404 })

    const fields = cleanInfo(body.fields)
    const token = randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    // One active handoff per iPad. Superseding an abandoned request prevents
    // an older form from submitting into the wrong invoice later.
    await prisma.kioskInfoRequest.updateMany({
      where: { kioskId: kiosk.kioskId, status: 'pending' },
      data: { status: 'cancelled' },
    })
    const infoRequest = await prisma.kioskInfoRequest.create({
      data: {
        token,
        kioskId: kiosk.kioskId,
        prefillData: JSON.stringify(fields),
        expiresAt,
      },
    })

    const command = {
      id: `cmd_${Date.now().toString(36)}`,
      type: 'invoice-info',
      requestId: infoRequest.id,
      token,
      fields,
    }
    const delivered = sendToKiosk(kiosk.kioskId, { type: 'command', command })
    await prisma.kiosk.update({
      where: { id: kiosk.id },
      data: { pendingCommand: delivered ? null : JSON.stringify(command) },
    })
    broadcastKiosks().catch(() => {})

    return NextResponse.json({
      requestId: infoRequest.id,
      kioskName: kiosk.name,
      delivered,
      expiresAt,
    })
  } catch (error) {
    console.error('[kiosk/invoice-request] create failed:', error)
    return NextResponse.json({ error: 'Could not send the form to the kiosk' }, { status: 500 })
  }
}
