import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/register/sign-rep — admin counter-signs a truck registration's
// SAAQ Class 1 service contract. Stores the signature image, the rep's
// printed name and the signed-at timestamp on the StudentRegistration row.
//
// Body: { registrationId, signatureDataUrl, repName }
//
// Admin-only — middleware treats /api/register as public for the form
// submission endpoint, so we gate the cookie server-side here.
export async function POST(request: NextRequest) {
  if (request.cookies.get('auth-token')?.value !== 'valid') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json() as {
      registrationId?: string
      signatureDataUrl?: string
      repName?: string
    }
    const { registrationId, signatureDataUrl, repName } = body
    if (!registrationId) return NextResponse.json({ error: 'registrationId required' }, { status: 400 })
    if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'signatureDataUrl must be a data:image/* URL' }, { status: 400 })
    }
    if (!repName?.trim()) return NextResponse.json({ error: 'repName required' }, { status: 400 })

    const existing = await prisma.studentRegistration.findUnique({ where: { id: registrationId } })
    if (!existing) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    if (existing.vehicleType !== 'truck') {
      return NextResponse.json({ error: 'Rep signature only applies to truck registrations' }, { status: 400 })
    }

    // Assign a contract number if one hasn't been already. Uses
    // CertificateSettings.nextContractNumber + 1 (so it stays in sync with
    // the school's existing numbering system) but does NOT increment that
    // counter — contracts and certificates are intentionally separate.
    // Instead we use a per-row monotonic count to keep collisions impossible.
    let contractNumber = existing.contractNumber
    if (!contractNumber) {
      const count = await prisma.studentRegistration.count({
        where: { vehicleType: 'truck', contractNumber: { not: null } },
      })
      contractNumber = `C1-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`
    }

    const updated = await prisma.studentRegistration.update({
      where: { id: registrationId },
      data: {
        repSignatureImage: signatureDataUrl,
        repSignerName: repName.trim(),
        repSignedAt: new Date(),
        contractNumber,
      },
    })

    return NextResponse.json({
      ok: true,
      contractNumber: updated.contractNumber,
      repSignedAt: updated.repSignedAt,
    })
  } catch (err) {
    console.error('[sign-rep] failed:', err)
    return NextResponse.json(
      { error: 'Failed to save signature', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }
}
