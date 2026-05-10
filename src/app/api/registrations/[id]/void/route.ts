import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { voidCharge } from '@/lib/clover'

/**
 * POST /api/registrations/[id]/void — admin releases the Clover auth (no charge).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const reg = await prisma.studentRegistration.findUnique({ where: { id } })
  if (!reg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (reg.paymentStatus === 'voided' || reg.paymentStatus === 'failed' || !reg.paymentChargeId) {
    // Nothing to void server-side; still mark voided for the record.
    await prisma.studentRegistration.update({
      where: { id },
      data: { paymentStatus: 'voided' },
    })
    return NextResponse.json({ success: true, alreadyVoided: true })
  }

  const res = await voidCharge(reg.paymentChargeId)
  if (!res.ok) {
    await prisma.studentRegistration.update({
      where: { id },
      data: { paymentError: res.error.slice(0, 500) },
    })
    return NextResponse.json({ error: res.error }, { status: 502 })
  }

  await prisma.studentRegistration.update({
    where: { id },
    data: { paymentStatus: 'voided', paymentError: null },
  })

  return NextResponse.json({ success: true })
}
