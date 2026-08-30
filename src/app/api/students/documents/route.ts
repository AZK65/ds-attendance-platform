import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
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
    } else {
      notes.push({ status: 'unavailable', label: 'Class 1 service contract', detail: 'No Class 1 registration found' })
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
