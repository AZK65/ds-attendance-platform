/**
 * Helper that creates an Invoice row from a StudentRegistration after the
 * initial $250 registration fee has been collected (or committed to, in the
 * case of cash). Pulls the student fields off the registration so the
 * invoice carries everything the PDF needs.
 *
 * Used by:
 *   - /api/registrations/[id]/capture  → card payment captured via Clover
 *   - /api/register (POST)             → cash chosen on the iPad
 *
 * Idempotent — checks for an existing invoice on the registration via the
 * notes field (we tag every auto-generated invoice with the registration id)
 * and bails if one is already present.
 */

import { prisma } from '@/lib/db'
import type { StudentRegistration } from '@prisma/client'

interface CreateRegistrationInvoiceArgs {
  registration: StudentRegistration
  paymentMethod: 'cash' | 'card'
  /**
   * "paid" when money has already been collected (card captured via Clover).
   * "unpaid" when cash was selected but hasn't been physically received yet.
   * Defaults to "paid".
   */
  paymentStatus?: 'paid' | 'unpaid'
}

interface CreateRegistrationInvoiceResult {
  created: boolean
  invoiceId?: string
  invoiceNumber?: string
  reason?: string
}

// Tag we stamp into invoice.notes so we can de-dupe on re-runs without
// adding a relational FK. Looks like: "[auto:reg=xyz123abc]"
const TAG_PREFIX = '[auto:reg='
function tagFor(regId: string) { return `${TAG_PREFIX}${regId}]` }

export async function createRegistrationInvoice(
  args: CreateRegistrationInvoiceArgs,
): Promise<CreateRegistrationInvoiceResult> {
  const { registration, paymentMethod, paymentStatus = 'paid' } = args
  const tag = tagFor(registration.id)

  // Skip if an auto-invoice for this registration already exists.
  const existing = await prisma.invoice.findFirst({
    where: { notes: { contains: tag } },
    select: { id: true, invoiceNumber: true },
  })
  if (existing) {
    return { created: false, invoiceId: existing.id, invoiceNumber: existing.invoiceNumber, reason: 'already-exists' }
  }

  // Pull tax + numbering config.
  const invoiceSettings = await prisma.invoiceSettings.findUnique({ where: { id: 'default' } })
    || await prisma.invoiceSettings.create({ data: { id: 'default' } })

  const taxesEnabled = invoiceSettings.taxesEnabled
  // Amount stored on the registration is cents; fall back to $250.
  const amountCents = registration.paymentAmount ?? 25000
  const subtotal = Math.round(amountCents) / 100
  const gstRate = invoiceSettings.defaultGstRate || 0
  const qstRate = invoiceSettings.defaultQstRate || 0
  // The registration fee charged to the student is tax-inclusive — we ran
  // $250 through Clover, not $250 + tax. So back out the tax portions
  // from the gross amount when taxes are enabled.
  let gstAmount = 0
  let qstAmount = 0
  let netSubtotal = subtotal
  if (taxesEnabled && (gstRate > 0 || qstRate > 0)) {
    const taxFactor = 1 + (gstRate + qstRate) / 100
    netSubtotal = Math.round((subtotal / taxFactor) * 100) / 100
    gstAmount = Math.round(netSubtotal * (gstRate / 100) * 100) / 100
    qstAmount = Math.round(netSubtotal * (qstRate / 100) * 100) / 100
  }
  const total = subtotal // already tax-inclusive

  // Next invoice number — same scheme the manual invoice flow uses.
  const prefix = invoiceSettings.invoicePrefix || 'INV'
  const seq = invoiceSettings.nextInvoiceNumber
  const invoiceNumber = `${prefix}-${String(seq).padStart(4, '0')}`

  const phoneDigits = (registration.phoneNumber || '').replace(/\D/g, '')

  const isTruck = registration.vehicleType === 'truck'
  const lineDescription = isTruck
    ? 'Class 1 (Truck) Service Contract — Initial registration fee'
    : 'Class 5 (Car) — First payment (Registration)'

  const lineItems = [{ description: lineDescription, quantity: 1, unitPrice: netSubtotal }]

  const noteParts = [
    `Auto-generated from registration ${registration.id}.`,
    paymentMethod === 'cash'
      ? 'Cash chosen during sign-up — confirm receipt before marking paid.'
      : paymentStatus === 'paid'
        ? 'Card payment captured via Clover.'
        : 'Card chosen during sign-up — charge on the school terminal before marking paid.',
    tag, // de-dupe sentinel
  ]
  const notes = noteParts.join('\n')

  const today = new Date().toISOString().split('T')[0]
  const created = await prisma.invoice.create({
    data: {
      invoiceNumber,
      studentName: registration.fullName || 'Student',
      studentAddress: registration.fullAddress || null,
      studentCity: registration.city || null,
      studentProvince: registration.province || null,
      studentPostalCode: registration.postalCode || null,
      studentPhone: phoneDigits || registration.phoneNumber || null,
      studentEmail: registration.email || null,
      invoiceDate: today,
      lineItems: JSON.stringify(lineItems),
      subtotal: netSubtotal,
      gstAmount,
      qstAmount,
      total,
      notes,
      paymentMethod,
      paymentStatus,
      cloverPaymentUrl: null,
      cloverOrderId: null,
      cloverPaid: paymentMethod === 'card' && paymentStatus === 'paid',
      remainingBalance: null,
    },
  })

  // Increment the global next-invoice counter only after a successful create.
  await prisma.invoiceSettings.update({
    where: { id: 'default' },
    data: { nextInvoiceNumber: { increment: 1 } },
  })

  return { created: true, invoiceId: created.id, invoiceNumber: created.invoiceNumber }
}
