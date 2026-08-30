import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { prisma } from '@/lib/db'
import { getStudentById, searchStudents, type StudentRecord } from '@/lib/external-db'

export const runtime = 'nodejs'

type BundleNote = { status: 'included' | 'unavailable' | 'failed'; label: string; detail?: string }

function digits(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '')
}

function phoneSuffix(value: string | null | undefined) {
  const valueDigits = digits(value)
  return valueDigits.length > 10 ? valueDigits.slice(-10) : valueDigits
}

function safePart(value: string | null | undefined, fallback: string) {
  return (value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback
}

function decodeUpload(value: string | null | undefined): { bytes: Buffer; extension: string } | null {
  if (!value) return null
  const dataUrl = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value)
  const mime = dataUrl?.[1]?.toLowerCase() || ''
  const encoded = dataUrl?.[2] || value
  try {
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length) return null
    const extension = mime.includes('pdf') ? 'pdf'
      : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
        : mime.includes('webp') ? 'webp'
          : 'png'
    return { bytes, extension }
  } catch {
    return null
  }
}

const CLASS_5_TERMS = [
  ['Agreement', 'This agreement is entered into between the student and Qazi Driving School for enrolment in the Class 5 driving course. The course is approximately one year in length and is governed by an eighteen-month contract. If the course extends beyond eighteen months, an additional fee of $150 plus applicable taxes will be charged.'],
  ['School hours and eligibility', 'The School operates daily from 11:00 AM to 7:00 PM and is closed on Fridays. The minimum age for enrolment is sixteen years. All fees referenced in this agreement are exclusive of applicable taxes unless otherwise stated.'],
  ['Course fee', 'The total course cost presented during registration is inclusive of taxes and course materials and is payable in installments according to the payment schedule shown to the student.'],
  ['1. Missed theory class', 'If the student misses a scheduled theory class, the student must wait for the next available group covering the missed material before resuming the course. No time limit applies to this provision.'],
  ['2. Missed road class', 'The student must provide at least twenty-four hours advance notice for a cancellation or rescheduling of a road class. Failure to provide notice results in a penalty of $40 plus applicable taxes.'],
  ['3. Cancellation of contract', 'The cancellation policy takes effect immediately when this agreement is signed. Cancellation charges are: a $150 administrative fee plus taxes; $18.85 plus taxes for each two-hour theory class attended; $42.91 plus taxes for each one-hour road class attended; and course books and materials are non-refundable.'],
  ['4. Contract duration', 'This contract remains in effect for eighteen months from the registration date. A continuation fee of $150 plus applicable taxes applies if additional time is required.'],
  ["5. In-school exam retakes", 'After two unsuccessful in-school written examination attempts, a fee of $40 plus applicable taxes applies to each later attempt.'],
  ['6. Acknowledgement', 'By signing, the student acknowledges that they have read, understood, and agreed to these terms and confirms that the information supplied during registration is accurate.'],
] as const

function plainPdfText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
}

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = plainPdfText(text).split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

async function buildClass5AgreementPdf(registration: {
  fullName: string | null
  phoneNumber: string | null
  email: string | null
  fullAddress: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  permitNumber: string | null
  signatureImage: string | null
  submittedAt: Date | null
  createdAt: Date
}) {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.08, 0.08, 0.09)
  const muted = rgb(0.38, 0.39, 0.43)
  const accent = rgb(0.75, 0.05, 0.08)
  const margin = 48
  const width = 612 - margin * 2
  let page!: PDFPage
  let y!: number

  const newPage = () => {
    page = doc.addPage([612, 792])
    y = 744
    page.drawText('QAZI DRIVING SCHOOL', { x: margin, y, size: 9, font: bold, color: accent })
    page.drawText('Class 5 Registration Agreement', { x: margin, y: y - 25, size: 21, font: bold, color: ink })
    page.drawLine({ start: { x: margin, y: y - 36 }, end: { x: 612 - margin, y: y - 36 }, thickness: 1, color: accent })
    y -= 58
  }
  newPage()

  const drawWrapped = (text: string, options?: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number }) => {
    const selectedFont = options?.font || regular
    const size = options?.size || 9.5
    const lineHeight = size * 1.42
    const lines = wrapPdfText(text, selectedFont, size, width)
    if (y - lines.length * lineHeight < 62) newPage()
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size, font: selectedFont, color: options?.color || ink })
      y -= lineHeight
    }
    y -= options?.gap ?? 8
  }

  drawWrapped(`Student: ${registration.fullName || 'Not recorded'}`, { font: bold, size: 10.5, gap: 3 })
  drawWrapped(`Phone: ${registration.phoneNumber || 'Not recorded'}    Email: ${registration.email || 'Not recorded'}`, { size: 9, color: muted, gap: 3 })
  drawWrapped(`Address: ${[registration.fullAddress, registration.city, registration.province, registration.postalCode].filter(Boolean).join(', ') || 'Not recorded'}`, { size: 9, color: muted, gap: 3 })
  drawWrapped(`Permit: ${registration.permitNumber || 'Not recorded'}    Registration accepted: ${(registration.submittedAt || registration.createdAt).toISOString().slice(0, 10)}`, { size: 9, color: muted, gap: 16 })

  for (const [title, body] of CLASS_5_TERMS) {
    drawWrapped(title, { font: bold, size: 10, gap: 3 })
    drawWrapped(body, { size: 9.2, gap: 10 })
  }

  if (y < 180) newPage()
  drawWrapped('Student acceptance and signature', { font: bold, size: 11, gap: 5 })
  drawWrapped('The completed registration records the student acceptance of the terms above and confirmation that the information provided is accurate.', { size: 9, color: muted, gap: 8 })
  const signature = decodeUpload(registration.signatureImage)
  if (signature) {
    try {
      const image = signature.extension === 'jpg'
        ? await doc.embedJpg(signature.bytes)
        : await doc.embedPng(signature.bytes)
      const maxW = 220
      const maxH = 80
      const scale = Math.min(maxW / image.width, maxH / image.height, 1)
      const imageW = image.width * scale
      const imageH = image.height * scale
      page.drawImage(image, { x: margin, y: y - imageH, width: imageW, height: imageH })
      y -= imageH + 7
    } catch {
      page.drawText('[Signature image is stored with the registration]', { x: margin, y, size: 9, font: regular, color: muted })
      y -= 22
    }
  } else {
    page.drawText('[No signature image found]', { x: margin, y, size: 9, font: regular, color: muted })
    y -= 22
  }
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 240, y }, thickness: 0.7, color: muted })
  page.drawText('Student signature', { x: margin, y: y - 14, size: 8, font: regular, color: muted })

  return Buffer.from(await doc.save())
}

async function findExternalStudent(externalId: number | null, phone: string, name: string) {
  if (externalId) return getStudentById(externalId)

  const suffix = phoneSuffix(phone)
  if (suffix.length >= 7) {
    const results = await searchStudents(suffix)
    const exact = results.find(student => {
      const candidate = phoneSuffix(student.phone_number)
      return candidate === suffix || candidate.endsWith(suffix) || suffix.endsWith(candidate)
    })
    if (exact) return exact
  }

  const cleanName = name.replace(/\s*#\d+\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleanName.length >= 2) {
    const results = await searchStudents(cleanName)
    const wanted = cleanName.toLowerCase()
    return results.find(student => student.full_name.trim().toLowerCase() === wanted) || null
  }
  return null
}

function externalSummary(student: StudentRecord | null) {
  if (!student) return []
  return [
    `External student ID: ${student.student_id}`,
    `Permit number: ${student.permit_number || 'Not recorded'}`,
    `Date of birth: ${student.dob || 'Not recorded'}`,
    `Address: ${[student.full_address, student.city, student.postal_code].filter(Boolean).join(', ') || 'Not recorded'}`,
    `Email: ${student.email || 'Not recorded'}`,
  ]
}

export async function GET(request: NextRequest) {
  try {
    const externalIdText = request.nextUrl.searchParams.get('studentId') || ''
    const externalId = /^\d+$/.test(externalIdText) ? Number(externalIdText) : null
    const requestedPhone = request.nextUrl.searchParams.get('phone') || ''
    const requestedName = request.nextUrl.searchParams.get('name') || ''
    const localStudentId = request.nextUrl.searchParams.get('localStudentId') || ''

    if (!externalId && !requestedPhone && !requestedName && !localStudentId) {
      return NextResponse.json({ error: 'Student ID, phone, name, or local student ID is required' }, { status: 400 })
    }

    let externalStudent: StudentRecord | null = null
    try {
      externalStudent = await findExternalStudent(externalId, requestedPhone, requestedName)
    } catch (error) {
      console.warn('[Student documents] External student lookup failed:', error)
    }

    if (externalId && !externalStudent) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const name = externalStudent?.full_name || requestedName
    const phone = externalStudent?.phone_number || requestedPhone
    const suffix = phoneSuffix(phone)
    const cleanName = name.replace(/\s*#\d+\s*/g, ' ').replace(/\s+/g, ' ').trim()

    const localStudent = localStudentId
      ? await prisma.student.findUnique({
          where: { id: localStudentId },
          include: { certificates: { orderBy: { generatedAt: 'desc' } } },
        })
      : suffix.length >= 7
        ? await prisma.student.findFirst({
            where: { phone: { contains: suffix } },
            include: { certificates: { orderBy: { generatedAt: 'desc' } } },
          })
        : cleanName.length >= 2
          ? await prisma.student.findFirst({
              where: { name: cleanName },
              include: { certificates: { orderBy: { generatedAt: 'desc' } } },
            })
          : null

    const registration = externalStudent
      ? await prisma.studentRegistration.findFirst({
          where: {
            OR: [
              { externalId: externalStudent.student_id },
              ...(suffix.length >= 7 ? [{ phoneNumber: { contains: suffix } }] : []),
            ],
            status: { in: ['confirmed', 'submitted'] },
          },
          orderBy: { createdAt: 'desc' },
        })
      : suffix.length >= 7
        ? await prisma.studentRegistration.findFirst({
            where: { phoneNumber: { contains: suffix }, status: { in: ['confirmed', 'submitted'] } },
            orderBy: { createdAt: 'desc' },
          })
        : cleanName.length >= 2
          ? await prisma.studentRegistration.findFirst({
              where: { fullName: cleanName, status: { in: ['confirmed', 'submitted'] } },
              orderBy: { createdAt: 'desc' },
            })
          : null

    const invoices = suffix.length >= 7
      ? await prisma.invoice.findMany({ where: { studentPhone: { contains: suffix } }, orderBy: { createdAt: 'desc' } })
      : cleanName.length >= 2
        ? await prisma.invoice.findMany({ where: { studentName: cleanName }, orderBy: { createdAt: 'desc' } })
        : []

    const resolvedName = externalStudent?.full_name || localStudent?.name || registration?.fullName || cleanName
    const resolvedPhone = externalStudent?.phone_number || localStudent?.phone || registration?.phoneNumber || phone
    if (!resolvedName && !resolvedPhone) {
      return NextResponse.json({ error: 'No matching student records found' }, { status: 404 })
    }

    const [invoiceSettings, schoolSettings] = await Promise.all([
      prisma.invoiceSettings.findUnique({ where: { id: 'default' } }),
      prisma.certificateSettings.findUnique({ where: { id: 'default' } }),
    ])

    const zip = new JSZip()
    const notes: BundleNote[] = []
    const port = process.env.PORT || '3000'
    const internalBase = `http://localhost:${port}`
    const authCookie = request.headers.get('cookie') || ''

    const addPdf = async (label: string, filename: string, path: string, init?: RequestInit) => {
      try {
        const response = await fetch(`${internalBase}${path}`, {
          ...init,
          headers: {
            'x-internal': '1',
            ...(authCookie ? { Cookie: authCookie } : {}),
            ...(init?.headers || {}),
          },
          cache: 'no-store',
        })
        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          notes.push({ status: 'failed', label, detail: `${response.status}${detail ? ` — ${detail.slice(0, 160)}` : ''}` })
          return
        }
        const bytes = Buffer.from(await response.arrayBuffer())
        zip.file(filename, bytes)
        notes.push({ status: 'included', label })
      } catch (error) {
        notes.push({ status: 'failed', label, detail: error instanceof Error ? error.message : 'Unknown error' })
      }
    }

    if (externalStudent && registration?.medical) {
      await addPdf(
        'Medical self-declaration',
        'Medical/medical-self-declaration.pdf',
        `/api/students/${externalStudent.student_id}/medical-pdf`,
      )
    } else {
      notes.push({ status: 'unavailable', label: 'Medical self-declaration', detail: 'No completed medical declaration found' })
    }

    if (registration?.vehicleType === 'truck') {
      await addPdf(
        'Class 1 service contract',
        'Contract/class-1-service-contract-en-fr.pdf',
        `/api/register/contract?registrationId=${encodeURIComponent(registration.id)}&lang=both`,
      )
    } else if (registration?.vehicleType === 'car') {
      try {
        const agreement = await buildClass5AgreementPdf(registration)
        zip.file('Contract/class-5-registration-agreement.pdf', agreement)
        notes.push({ status: 'included', label: 'Class 5 registration agreement' })
      } catch (error) {
        notes.push({
          status: 'failed',
          label: 'Class 5 registration agreement',
          detail: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    } else {
      notes.push({ status: 'unavailable', label: 'Registration agreement', detail: 'No completed registration found' })
    }

    if (phoneSuffix(resolvedPhone).length >= 7) {
      await addPdf(
        'Student attendance booklet',
        'Attendance/student-attendance-booklet.pdf',
        `/api/scheduling/signature/pdf?phone=${encodeURIComponent(resolvedPhone || '')}`,
      )
    } else {
      notes.push({ status: 'unavailable', label: 'Student attendance booklet', detail: 'No usable phone number found' })
    }

    if (localStudent?.certificates.length) {
      for (const certificate of localStudent.certificates) {
        const type = certificate.certificateType === 'phase1' ? 'learners' : 'full'
        const stamp = certificate.generatedAt.toISOString().slice(0, 10)
        await addPdf(
          `${type === 'learners' ? 'Learner' : 'Full'} certificate ${certificate.id}`,
          `Certificates/${stamp}-${type}-certificate-${safePart(certificate.attestationNumber, certificate.id)}.pdf`,
          '/api/certificate/regenerate',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentId: localStudent.id,
              certificateId: certificate.id,
              certificateType: certificate.certificateType,
            }),
          },
        )
      }
    } else {
      notes.push({ status: 'unavailable', label: 'Certificates', detail: 'No saved certificates found' })
    }

    if (invoices.length) {
      for (const invoice of invoices) {
        let lineItems: Array<{ description: string; quantity: number; unitPrice: number }> = []
        try { lineItems = JSON.parse(invoice.lineItems) } catch { /* generator accepts an empty list */ }
        await addPdf(
          `Invoice ${invoice.invoiceNumber}`,
          `Invoices/${safePart(invoice.invoiceDate, 'undated')}-invoice-${safePart(invoice.invoiceNumber, invoice.id)}.pdf`,
          '/api/invoice/generate',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schoolName: schoolSettings?.schoolName || 'École de Conduite Qazi',
              schoolAddress: schoolSettings?.schoolAddress || '',
              schoolCity: schoolSettings?.schoolCity || '',
              schoolProvince: schoolSettings?.schoolProvince || '',
              schoolPostalCode: schoolSettings?.schoolPostalCode || '',
              gstNumber: invoiceSettings?.gstNumber || '',
              qstNumber: invoiceSettings?.qstNumber || '',
              studentName: invoice.studentName,
              studentAddress: invoice.studentAddress || '',
              studentCity: invoice.studentCity || '',
              studentProvince: invoice.studentProvince || '',
              studentPostalCode: invoice.studentPostalCode || '',
              studentPhone: invoice.studentPhone || '',
              studentEmail: invoice.studentEmail || '',
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              dueDate: invoice.dueDate || '',
              lineItems,
              subtotal: invoice.subtotal,
              gstRate: invoiceSettings?.defaultGstRate ?? 5,
              qstRate: invoiceSettings?.defaultQstRate ?? 9.975,
              gstAmount: invoice.gstAmount,
              qstAmount: invoice.qstAmount,
              total: invoice.total,
              taxesEnabled: (invoiceSettings?.taxesEnabled ?? true) && (invoice.gstAmount > 0 || invoice.qstAmount > 0),
              notes: invoice.notes || '',
              remainingBalance: invoice.remainingBalance ?? 0,
            }),
          },
        )
      }
    } else {
      notes.push({ status: 'unavailable', label: 'Invoices', detail: 'No saved invoices found' })
    }

    const uploads = [
      { label: 'Permit image', folder: 'Registration', filename: 'permit', value: registration?.permitImage },
      { label: 'Identification image', folder: 'Registration', filename: 'identification', value: registration?.idImage },
      { label: 'Profile photo', folder: 'Registration', filename: 'profile-photo', value: registration?.avatarImage || localStudent?.avatarImage },
      { label: 'Student signature', folder: 'Registration', filename: 'student-signature', value: registration?.signatureImage },
      { label: 'School representative signature', folder: 'Contract', filename: 'school-representative-signature', value: registration?.repSignatureImage },
    ]
    for (const upload of uploads) {
      const decoded = decodeUpload(upload.value)
      if (decoded) {
        zip.file(`${upload.folder}/${upload.filename}.${decoded.extension}`, decoded.bytes)
        notes.push({ status: 'included', label: upload.label })
      } else {
        notes.push({ status: 'unavailable', label: upload.label })
      }
    }

    const includedCount = notes.filter(note => note.status === 'included').length
    const index = [
      'QAZI DRIVING SCHOOL — STUDENT DOCUMENT BUNDLE',
      '',
      `Student: ${resolvedName || 'Unknown'}`,
      `Phone: ${resolvedPhone || 'Not recorded'}`,
      ...externalSummary(externalStudent),
      `Generated: ${new Date().toISOString()}`,
      '',
      'CONTENTS',
      ...notes.map(note => `${note.status === 'included' ? '[INCLUDED]' : note.status === 'failed' ? '[FAILED]' : '[NOT AVAILABLE]'} ${note.label}${note.detail ? ` — ${note.detail}` : ''}`),
      '',
      `Included documents/files: ${includedCount}`,
    ].join('\n')
    zip.file('DOCUMENT-INDEX.txt', index)

    const archive = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    const date = new Date().toISOString().slice(0, 10)
    const filename = `Qazi-${safePart(resolvedName, 'student')}-documents-${date}.zip`
    return new NextResponse(archive as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[Student documents] Failed:', error)
    return NextResponse.json(
      { error: 'Failed to prepare student documents', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
