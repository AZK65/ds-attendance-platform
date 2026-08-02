import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/leads/abandoned — admin only (behind the auth cookie via middleware).
 *
 * Registrations someone started on the public form but never finished
 * (status "draft", written by /api/register/draft). Shaped like a Lead so the
 * Leads page can render it in the same table.
 *
 * ?q= filters on name / phone / email.
 */

// How far a draft got, in human terms, for the Notes column.
const STEP_LABELS: Record<string, string> = {
  personal: 'Personal info',
  address: 'Address',
  documents: 'Documents',
  medical: 'Medical',
  agreements: 'Agreement',
  'payment-method': 'Payment method',
  payment: 'Payment',
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() || ''

    const drafts = await prisma.studentRegistration.findMany({
      where: {
        status: 'draft',
        ...(q
          ? {
              OR: [
                { fullName: { contains: q } },
                { phoneNumber: { contains: q } },
                { email: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      // Explicit select: these rows can carry base64 images, and shipping those
      // to the leads table would be megabytes per row for no reason.
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        city: true,
        draftStep: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const leads = drafts.map(d => {
      const reached = d.draftStep ? STEP_LABELS[d.draftStep] || d.draftStep : null
      const notes = [
        reached ? `Stopped at: ${reached}` : 'Stopped after entering their details',
        d.city ? `City: ${d.city}` : null,
      ].filter(Boolean).join('\n')

      return {
        id: d.id,
        createdAt: d.updatedAt.toISOString(), // "Received" = last activity
        name: d.fullName,
        email: d.email,
        phone: d.phoneNumber,
        notes,
        source: 'abandoned_registration',
        status: 'new',
        isRead: false,
        isTest: false,
      }
    })

    return NextResponse.json({ leads, count: leads.length })
  } catch (error) {
    console.error('[leads/abandoned] failed:', error)
    return NextResponse.json({ error: 'Failed to load abandoned registrations' }, { status: 500 })
  }
}

/**
 * DELETE /api/leads/abandoned?id=... — discard one abandoned draft.
 * Guarded to status "draft" so this can never remove a real registration.
 */
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const result = await prisma.studentRegistration.deleteMany({
      where: { id, status: 'draft' },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: 'Not an abandoned draft' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[leads/abandoned] delete failed:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
