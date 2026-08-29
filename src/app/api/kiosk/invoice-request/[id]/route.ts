import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastKiosks, sendToKiosk } from '@/lib/kiosk-hub'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const infoRequest = await prisma.kioskInfoRequest.findUnique({ where: { id } })
  if (!infoRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  if (infoRequest.status === 'pending' && infoRequest.expiresAt <= new Date()) {
    await prisma.kioskInfoRequest.update({ where: { id }, data: { status: 'expired' } })
    return NextResponse.json({ status: 'expired' })
  }

  let fields: Record<string, string> | null = null
  if (infoRequest.resultData) {
    try { fields = JSON.parse(infoRequest.resultData) } catch { fields = null }
  }
  return NextResponse.json({ status: infoRequest.status, fields })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const infoRequest = await prisma.kioskInfoRequest.findUnique({ where: { id } })
  if (!infoRequest) return NextResponse.json({ ok: true })
  if (infoRequest.status === 'pending') {
    await prisma.kioskInfoRequest.update({ where: { id }, data: { status: 'cancelled' } })
  }
  sendToKiosk(infoRequest.kioskId, {
    type: 'command',
    command: { id: `cmd_${Date.now().toString(36)}`, type: 'invoice-info-cancel', requestId: id },
  })
  broadcastKiosks().catch(() => {})
  return NextResponse.json({ ok: true })
}
