import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      licenceNumber, name, phone, phoneAlt, address, apartment,
      municipality, province, postalCode,
      registrationDate, expiryDate,
      module1Date, module2Date, module3Date, module4Date, module5Date,
      module6Date, module7Date, module8Date, module9Date, module10Date,
      module11Date, module12Date,
      sortie1Date, sortie2Date, sortie3Date, sortie4Date, sortie5Date,
      sortie6Date, sortie7Date, sortie8Date, sortie9Date, sortie10Date,
      sortie11Date, sortie12Date, sortie13Date, sortie14Date, sortie15Date,
      certificateType, contractNumber, attestationNumber,
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Student name is required' },
        { status: 400 }
      )
    }

    // Strip spaces from attestation number for storage
    const cleanAttestation = attestationNumber ? attestationNumber.replace(/\s+/g, '') : null

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

    let student

    // Upsert strategy: use licenceNumber if present, otherwise find by name+phone
    const cleanLicence = licenceNumber?.trim() || null
    if (cleanLicence) {
      student = await prisma.student.upsert({
        where: { licenceNumber: cleanLicence },
        update: { ...studentData, licenceNumber: cleanLicence },
        create: { ...studentData, licenceNumber: cleanLicence },
      })
    } else {
      // Fallback: find existing student. Match by phone first (most stable
      // across name format changes — "SUSAN ILIYAN" vs "ILIYAN, SUSAN" used
      // to create duplicate rows here, leaving the older row certificate-less
      // and breaking the Cert Info card on the student profile).
      const phoneDigits = (phone || '').replace(/\D/g, '')
      const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits
      let existing = null as Awaited<ReturnType<typeof prisma.student.findFirst>>
      if (phoneSuffix.length >= 7) {
        existing = await prisma.student.findFirst({
          where: { phone: { contains: phoneSuffix } },
        })
      }
      if (!existing) {
        // Last resort: exact name + phone (preserves original behaviour).
        existing = await prisma.student.findFirst({
          where: { name, ...(phone ? { phone } : {}) },
        })
      }

      if (existing) {
        student = await prisma.student.update({
          where: { id: existing.id },
          data: studentData,
        })
      } else {
        student = await prisma.student.create({
          data: studentData,
        })
      }
    }

    // Create certificate record
    const certificate = await prisma.certificate.create({
      data: {
        studentId: student.id,
        certificateType: certificateType || 'full',
        contractNumber: contractNumber?.toString() || null,
        attestationNumber: cleanAttestation,
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
