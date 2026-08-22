import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      licenceNumber, name, phone, phoneAlt, email, address, apartment,
      municipality, province, postalCode,
      registrationDate, expiryDate,
      module1Date, module2Date, module3Date, module4Date, module5Date,
      module6Date, module7Date, module8Date, module9Date, module10Date,
      module11Date, module12Date,
      sortie1Date, sortie2Date, sortie3Date, sortie4Date, sortie5Date,
      sortie6Date, sortie7Date, sortie8Date, sortie9Date, sortie10Date,
      sortie11Date, sortie12Date, sortie13Date, sortie14Date, sortie15Date,
      certificateType, contractNumber, attestationNumber,
      localStudentId,
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Student name is required' },
        { status: 400 }
      )
    }

    // Strip spaces from attestation number for storage
    const cleanAttestation = attestationNumber ? attestationNumber.replace(/\s+/g, '') : null

    // Email isn't part of the cert review form — only set it on update if
    // explicitly provided. Otherwise we'd wipe out an email a user typed
    // on the student profile every time they generated another cert.
    const studentData = {
      name,
      phone: phone || null,
      phoneAlt: phoneAlt || null,
      address: address || null,
      apartment: apartment || null,
      municipality: municipality || null,
      province: province || null,
      postalCode: postalCode || null,
      registrationDate: registrationDate || null,
      expiryDate: expiryDate || null,
      module1Date: module1Date || null,
      module2Date: module2Date || null,
      module3Date: module3Date || null,
      module4Date: module4Date || null,
      module5Date: module5Date || null,
      module6Date: module6Date || null,
      module7Date: module7Date || null,
      module8Date: module8Date || null,
      module9Date: module9Date || null,
      module10Date: module10Date || null,
      module11Date: module11Date || null,
      module12Date: module12Date || null,
      sortie1Date: sortie1Date || null,
      sortie2Date: sortie2Date || null,
      sortie3Date: sortie3Date || null,
      sortie4Date: sortie4Date || null,
      sortie5Date: sortie5Date || null,
      sortie6Date: sortie6Date || null,
      sortie7Date: sortie7Date || null,
      sortie8Date: sortie8Date || null,
      sortie9Date: sortie9Date || null,
      sortie10Date: sortie10Date || null,
      sortie11Date: sortie11Date || null,
      sortie12Date: sortie12Date || null,
      sortie13Date: sortie13Date || null,
      sortie14Date: sortie14Date || null,
      sortie15Date: sortie15Date || null,
    }

    // Build the update payload — only include email if a value was passed.
    const updateData = { ...studentData, ...(email ? { email } : {}) }
    const createData = { ...studentData, ...(email ? { email } : {}) }

    // Resolve one canonical local student before saving. The exact local id
    // supplied by the certificate editor is authoritative, then licence and
    // phone provide fallbacks for older entry points.
    // Previously, adding a licence to a phone-matched student used an upsert
    // by licence and created a second Student row, so dates/numbers disappeared
    // when the original profile was reopened.
    const cleanLicence = licenceNumber?.trim() || null
    const phoneDigits = (phone || '').replace(/\D/g, '')
    const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits
    let existing = null as Awaited<ReturnType<typeof prisma.student.findFirst>>

    if (typeof localStudentId === 'string' && localStudentId) {
      existing = await prisma.student.findUnique({ where: { id: localStudentId } })
    }
    if (!existing && cleanLicence) {
      existing = await prisma.student.findFirst({ where: { licenceNumber: cleanLicence } })
    }
    if (!existing && phoneSuffix.length >= 7) {
      const candidates = await prisma.student.findMany({
        where: { phone: { contains: phoneSuffix } },
        include: { certificates: true },
        orderBy: { updatedAt: 'desc' },
      })
      existing = candidates[0] || null
    }
    if (!existing) {
      existing = await prisma.student.findFirst({
        where: { name, ...(phone ? { phone } : {}) },
        orderBy: { updatedAt: 'desc' },
      })
    }

    const student = existing
      ? await prisma.student.update({
          where: { id: existing.id },
          data: { ...updateData, ...(cleanLicence ? { licenceNumber: cleanLicence } : {}) },
        })
      : await prisma.student.create({
          data: { ...createData, ...(cleanLicence ? { licenceNumber: cleanLicence } : {}) },
        })

    // Re-generating or reopening a certificate should update its existing
    // record, not append another identical certificate every time.
    const numberMatches = [
      contractNumber ? { contractNumber: contractNumber.toString() } : null,
      cleanAttestation ? { attestationNumber: cleanAttestation } : null,
    ].filter((v): v is { contractNumber: string } | { attestationNumber: string } => v !== null)

    const existingCertificate = numberMatches.length > 0
      ? await prisma.certificate.findFirst({
          where: { studentId: student.id, OR: numberMatches },
          orderBy: { generatedAt: 'desc' },
        })
      : null

    const certificateData = {
      certificateType: certificateType || 'full',
      contractNumber: contractNumber?.toString() || null,
      attestationNumber: cleanAttestation,
    }
    const certificate = existingCertificate
      ? await prisma.certificate.update({
          where: { id: existingCertificate.id },
          data: certificateData,
        })
      : await prisma.certificate.create({
          data: {
            studentId: student.id,
            ...certificateData,
          },
        })

    return NextResponse.json({ student, certificate })
  } catch (error) {
    console.error('Student save error:', error)
    return NextResponse.json(
      { error: 'Failed to save student' },
      { status: 500 }
    )
  }
}
