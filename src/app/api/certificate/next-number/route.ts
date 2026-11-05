import { NextResponse } from 'next/server'
import { claimNextCertificateNumbers } from '@/lib/certificate-numbers'

// Atomically claim the next unused certificate numbers. The current
// attestation range is used first. Once it is exhausted, a pending SAAQ
// range stored on AppPreference (`saaqPendingAttestationRange`) is
// activated. The claim refuses rather than inventing a number in the gap.
export async function POST() {
  try {
    const claim = await claimNextCertificateNumbers()
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status })
    }

    return NextResponse.json({
      contractNumber: claim.contractNumber,
      attestationNumber: claim.attestationNumber,
      schoolName: claim.schoolName,
      schoolAddress: claim.schoolAddress,
      schoolCity: claim.schoolCity,
      schoolProvince: claim.schoolProvince,
      schoolPostalCode: claim.schoolPostalCode,
      schoolNumber: claim.schoolNumber,
    })
  } catch (error) {
    console.error('Error getting next certificate number:', error)
    return NextResponse.json(
      { error: 'Failed to get next number' },
      { status: 500 }
    )
  }
}
