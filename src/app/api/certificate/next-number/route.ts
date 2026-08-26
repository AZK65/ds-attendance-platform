import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Atomically claim the next unused certificate numbers. updateMany acts as
// an optimistic compare-and-swap, so two browser tabs cannot claim the same
// pair even if they request numbers at the same time.
export async function POST() {
  try {
    await prisma.certificateSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    })

    // A retry is only needed when another request wins the compare-and-swap,
    // or when an administrator moved the counter onto an already-used number.
    for (let attempt = 0; attempt < 100; attempt++) {
      const settings = await prisma.certificateSettings.findUniqueOrThrow({
        where: { id: 'default' },
      })

      if (settings.nextAttestationNumber > settings.attestationNumberEnd) {
        return NextResponse.json(
          { error: 'Attestation number range exhausted. Please update settings with a new range.' },
          { status: 400 }
        )
      }

      const contractNumber = String(settings.nextContractNumber)
      const attestationNumber = String(settings.nextAttestationNumber)
      const alreadyUsed = await prisma.certificate.findFirst({
        where: { OR: [{ contractNumber }, { attestationNumber }] },
        select: { id: true },
      })

      const claimed = await prisma.certificateSettings.updateMany({
        where: {
          id: 'default',
          nextContractNumber: settings.nextContractNumber,
          nextAttestationNumber: settings.nextAttestationNumber,
        },
        data: {
          nextContractNumber: settings.nextContractNumber + 1,
          nextAttestationNumber: settings.nextAttestationNumber + 1,
        },
      })

      if (claimed.count === 0) continue
      if (alreadyUsed) continue

      return NextResponse.json({
        contractNumber: settings.nextContractNumber,
        attestationNumber: settings.nextAttestationNumber,
        schoolName: settings.schoolName,
        schoolAddress: settings.schoolAddress,
        schoolCity: settings.schoolCity,
        schoolProvince: settings.schoolProvince,
        schoolPostalCode: settings.schoolPostalCode,
        schoolNumber: settings.schoolNumber,
      })
    }

    return NextResponse.json(
      { error: 'Could not reserve unique certificate numbers. Please try again.' },
      { status: 409 }
    )
  } catch (error) {
    console.error('Error getting next certificate number:', error)
    return NextResponse.json(
      { error: 'Failed to get next number' },
      { status: 500 }
    )
  }
}
