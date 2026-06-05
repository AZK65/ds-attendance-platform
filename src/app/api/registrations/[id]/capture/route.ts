import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { captureCharge } from '@/lib/clover'
import { createRegistrationInvoice } from '@/lib/registration-invoice'

/**
 * POST /api/registrations/[id]/capture — admin captures the $250 Clover auth.
 * Auth-protected by the global middleware.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const reg = await prisma.studentRegistration.findUnique({ where: { id } })
  if (!reg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (reg.paymentStatus === 'captured') {
    return NextResponse.json({ success: true, alreadyCaptured: true })
  }
  if (!reg.paymentChargeId || reg.paymentStatus !== 'authorized') {
    return NextResponse.json({ error: 'No authorized charge to capture' }, { status: 400 })
  }

  const res = await captureCharge(reg.paymentChargeId, reg.paymentAmount ?? undefined)
  if (!res.ok) {
    await prisma.studentRegistration.update({
      where: { id },
      data: { paymentError: res.error.slice(0, 500) },
    })
    return NextResponse.json({ error: res.error }, { status: 502 })
  }

  const updated = await prisma.studentRegistration.update({
    where: { id },
    data: {
      paymentStatus: 'captured',
      paymentCapturedAt: new Date(),
      paymentError: null,
    },
  })

  // Auto-generate the invoice from the registration so the student lands
  // in /invoice with the $250 already booked as paid. Idempotent — won't
  // duplicate if this endpoint gets retried.
  let invoiceResult: Awaited<ReturnType<typeof createRegistrationInvoice>> | null = null
  try {
    invoiceResult = await createRegistrationInvoice({
      registration: updated,
      paymentMethod: 'card',
      paymentStatus: 'paid',
    })
  } catch (err) {
    console.error('[capture] auto-invoice failed:', err)
  }

  return NextResponse.json({ success: true, invoice: invoiceResult })
}
