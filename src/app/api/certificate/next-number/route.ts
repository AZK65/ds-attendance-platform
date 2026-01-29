import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET and increment the next certificate numbers
export async function POST() {
  try {
    // Get current settings
    let settings = await prisma.certificateSettings.findUnique({
      where: { id: 'default' }
    })

    if (!settings) {
      settings = await prisma.certificateSettings.create({
        data: { id: 'default' }
      })
    }

    // Check if attestation number is within range
    if (settings.nextAttestationNumber > settings.attestationNumberEnd) {
      return NextResponse.json(
        { error: 'Attestation number range exhausted. Please update settings with a new range.' },
        { status: 400 }
      )
    }

    const currentNumbers = {
      contractNumber: settings.nextContractNumber,
      attestationNumber: settings.nextAttestationNumber,
      schoolName: settings.schoolName,
      schoolAddress: settings.schoolAddress,
      schoolCity: settings.schoolCity,
      schoolProvince: settings.schoolProvince,
      schoolPostalCode: settings.schoolPostalCode,
      schoolNumber: settings.schoolNumber,
    }

    // Increment for next use
    await prisma.certificateSettings.update({
      where: { id: 'default' },
      data: {
        nextContractNumber: settings.nextContractNumber + 1,
        nextAttestationNumber: settings.nextAttestationNumber + 1,
      }
    })

    return NextResponse.json(currentNumbers)
  } catch (error) {
    console.error('Error getting next certificate number:', error)
    return NextResponse.json(
      { error: 'Failed to get next number' },
      { status: 500 }
    )
  }
}
