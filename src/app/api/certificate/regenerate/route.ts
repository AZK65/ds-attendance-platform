import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { promises as fs } from 'fs'
import path from 'path'

const TEMPLATE_PATH = path.join(process.cwd(), 'data', 'templates', 'blank-certificate.pdf')

// POST /api/certificate/regenerate
// Re-generates a certificate PDF from saved student data
// Body: { studentId: string, certificateId: string, certificateType: 'phase1' | 'full', moduleDates?: Record<string, string> }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentId, certificateId, certificateType, moduleDates } = body

    if (!studentId || !certificateId || !certificateType) {
      return NextResponse.json(
        { error: 'studentId, certificateId, and certificateType are required' },
        { status: 400 }
      )
    }

    // Fetch the student record with all dates
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    })

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Fetch the certificate record for contract/attestation numbers
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
    })

    if (!certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
    }

    // Get school settings
    const settings = await prisma.certificateSettings.findUnique({
      where: { id: 'default' },
    })

    // Load template PDF
    let templateBase64: string
    try {
      const fileBuffer = await fs.readFile(TEMPLATE_PATH)
      templateBase64 = `data:application/pdf;base64,${fileBuffer.toString('base64')}`
    } catch {
      return NextResponse.json(
        { error: 'Certificate template not found. Please upload a template first.' },
        { status: 404 }
      )
    }

    // Merge saved dates with any overrides from Teamup (moduleDates param)
    const dates = {
      module1Date: moduleDates?.module1Date || student.module1Date || '',
      module2Date: moduleDates?.module2Date || student.module2Date || '',
      module3Date: moduleDates?.module3Date || student.module3Date || '',
      module4Date: moduleDates?.module4Date || student.module4Date || '',
      module5Date: moduleDates?.module5Date || student.module5Date || '',
      module6Date: moduleDates?.module6Date || student.module6Date || '',
      module7Date: moduleDates?.module7Date || student.module7Date || '',
      module8Date: moduleDates?.module8Date || student.module8Date || '',
      module9Date: moduleDates?.module9Date || student.module9Date || '',
      module10Date: moduleDates?.module10Date || student.module10Date || '',
      module11Date: moduleDates?.module11Date || student.module11Date || '',
      module12Date: moduleDates?.module12Date || student.module12Date || '',
      sortie1Date: moduleDates?.sortie1Date || student.sortie1Date || '',
      sortie2Date: moduleDates?.sortie2Date || student.sortie2Date || '',
      sortie3Date: moduleDates?.sortie3Date || student.sortie3Date || '',
      sortie4Date: moduleDates?.sortie4Date || student.sortie4Date || '',
      sortie5Date: moduleDates?.sortie5Date || student.sortie5Date || '',
      sortie6Date: moduleDates?.sortie6Date || student.sortie6Date || '',
      sortie7Date: moduleDates?.sortie7Date || student.sortie7Date || '',
      sortie8Date: moduleDates?.sortie8Date || student.sortie8Date || '',
      sortie9Date: moduleDates?.sortie9Date || student.sortie9Date || '',
      sortie10Date: moduleDates?.sortie10Date || student.sortie10Date || '',
      sortie11Date: moduleDates?.sortie11Date || student.sortie11Date || '',
      sortie12Date: moduleDates?.sortie12Date || student.sortie12Date || '',
      sortie13Date: moduleDates?.sortie13Date || student.sortie13Date || '',
      sortie14Date: moduleDates?.sortie14Date || student.sortie14Date || '',
      sortie15Date: moduleDates?.sortie15Date || student.sortie15Date || '',
    }

    // Format attestation with spaces for display (e.g., "M236 6201 1870")
    const rawAttestation = certificate.attestationNumber || ''

    // Build the form data for the generate endpoint
    const generatePayload = {
      name: student.name,
      address: student.address || '',
      municipality: student.municipality || '',
      province: student.province || '',
      postalCode: student.postalCode || '',
      contractNumber: certificate.contractNumber || '',
      attestationNumber: rawAttestation,
      phone: student.phone || '',
      phoneAlt: student.phoneAlt || '',
      licenceNumber: student.licenceNumber || '',
      schoolName: settings?.schoolName || 'École de Conduite Qazi',
      schoolAddress: settings?.schoolAddress || '786 rue Jean-Talon Ouest',
      schoolCity: settings?.schoolCity || 'Montréal',
      schoolProvince: settings?.schoolProvince || 'QC',
      schoolPostalCode: settings?.schoolPostalCode || 'H3N 1S2',
      schoolNumber: settings?.schoolNumber || 'L526',
      certificateType,
      templatePdf: templateBase64,
      ...dates,
    }

    // Call the existing generate endpoint internally
    const generateUrl = new URL('/api/certificate/generate', request.url)
    const generateRes = await fetch(generateUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(generatePayload),
    })

    if (!generateRes.ok) {
      const errData = await generateRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: 'Failed to generate certificate PDF', details: errData },
        { status: 500 }
      )
    }

    // Return the PDF binary
    const pdfBuffer = await generateRes.arrayBuffer()
    const typeSuffix = certificateType === 'phase1' ? 'learners' : 'full'

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificate-${student.name}-${typeSuffix}.pdf"`,
      },
    })
  } catch (error) {
    console.error('[Certificate Regenerate] Error:', error)
    return NextResponse.json(
      { error: 'Failed to regenerate certificate', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
