import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'
import { getStudentById, searchStudents, type StudentRecord } from '@/lib/external-db'
import { getPricing, type ClassPricing } from '@/lib/pricing'

export const runtime = 'nodejs'

type BundleNote = { status: 'included' | 'unavailable' | 'failed'; label: string; detail?: string }
type DownloadFile = { filename: string; bytes: Buffer; contentType: string }

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

async function buildClass5AgreementPdf(registration: {
  fullName: string | null
  phoneNumber: string | null
  email: string | null
  fullAddress: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  dob: string | null
  permitNumber: string | null
  signatureImage: string | null
  submittedAt: Date | null
  createdAt: Date
}, options: {
  pricing: ClassPricing
  gstNumber: string
  qstNumber: string
}) {
  const templatePath = path.join(process.cwd(), 'public', 'forms', 'qazi-class-5-official-contract-fillable.pdf')
  const doc = await PDFDocument.load(await fs.readFile(templatePath))
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fullName = registration.fullName?.trim() || ''
  const commaParts = fullName.includes(',') ? fullName.split(',').map(part => part.trim()) : null
  const words = fullName.split(/\s+/).filter(Boolean)
  const lastName = commaParts ? commaParts[0] : words.length > 1 ? words.at(-1) || '' : fullName
  const firstName = commaParts ? commaParts.slice(1).join(' ') : words.length > 1 ? words.slice(0, -1).join(' ') : ''
  const acceptedAt = registration.submittedAt || registration.createdAt
  const firstCourseDate = acceptedAt.toISOString().slice(0, 10)
  const end = new Date(acceptedAt)
  end.setMonth(end.getMonth() + 18)
  const total = options.pricing.total
  const beforeTax = Math.round((total / 1.14975) * 100) / 100
  const gstAmount = Math.round(beforeTax * 0.05 * 100) / 100
  const qstAmount = Math.round(beforeTax * 0.09975 * 100) / 100
  const values: Record<string, string> = {
    contractNumberPage1: '',
    contractNumberPage2: '',
    lastName,
    firstName,
    streetAddress: registration.fullAddress || '',
    studentCity: registration.city || '',
    studentPostalCode: registration.postalCode || '',
    homePhone: registration.phoneNumber || '',
    dateOfBirth: registration.dob || '',
    learnerLicenceNumber: registration.permitNumber || '',
    email: registration.email || '',
    theoryHours: '24',
    practicalHours: '15',
    totalHours: '39',
    totalBeforeTax: beforeTax.toFixed(2),
    gstNumber: options.gstNumber,
    gstAmount: gstAmount.toFixed(2),
    qstNumber: options.qstNumber,
    qstAmount: qstAmount.toFixed(2),
    totalAfterTax: total.toFixed(2),
    cancellationNoticeHours: '24',
    firstCourseDate,
    contractEndDate: end.toISOString().slice(0, 10),
    signedPlace: registration.city ? `${registration.city}, QC` : 'MONTREAL QC',
    signedDate: firstCourseDate,
    studentNameSignatureLine: fullName,
  }
  options.pricing.schedule.slice(0, 4).forEach((installment, index) => {
    values[`installment${index + 1}Amount`] = installment.amount.toFixed(2)
  })
  for (const [name, value] of Object.entries(values)) {
    if (!value) continue
    try { form.getTextField(name).setText(value) } catch { /* optional field */ }
  }
  try { form.getCheckBox('trainingAutomobile').check() } catch { /* already checked in template */ }
  form.updateFieldAppearances(font)

  const signature = decodeUpload(registration.signatureImage)
  if (signature) {
    try {
      const image = signature.extension === 'jpg'
        ? await doc.embedJpg(signature.bytes)
        : await doc.embedPng(signature.bytes)
      const page = doc.getPage(1)
      const scale = Math.min(175 / image.width, 36 / image.height)
      page.drawImage(image, { x: 70, y: 58, width: image.width * scale, height: image.height * scale })
    } catch { /* retain the typed student name when the signature image is unreadable */ }
  }
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

export async function GET(request: NextRequest) {
  try {
    const externalIdText = request.nextUrl.searchParams.get('studentId') || ''
    const externalId = /^\d+$/.test(externalIdText) ? Number(externalIdText) : null
    const requestedPhone = request.nextUrl.searchParams.get('phone') || ''
    const requestedName = request.nextUrl.searchParams.get('name') || ''
    const localStudentId = request.nextUrl.searchParams.get('localStudentId') || ''
    const requestedIncludes = new Set(
      (request.nextUrl.searchParams.get('include') || '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean),
    )
    const wants = (category: string) => requestedIncludes.size === 0 || requestedIncludes.has(category)
    const forceArchive = request.nextUrl.searchParams.get('archive') === '1'

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

    const [invoiceSettings, schoolSettings, pricing] = await Promise.all([
      prisma.invoiceSettings.findUnique({ where: { id: 'default' } }),
      prisma.certificateSettings.findUnique({ where: { id: 'default' } }),
      getPricing(),
    ])

    const zip = new JSZip()
    const notes: BundleNote[] = []
    const downloadFiles: DownloadFile[] = []
    const port = process.env.PORT || '3000'
    const internalBase = `http://localhost:${port}`
    const authCookie = request.headers.get('cookie') || ''

    const addFile = (filename: string, bytes: Buffer, contentType: string) => {
      zip.file(filename, bytes)
      downloadFiles.push({ filename, bytes, contentType })
    }

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
        addFile(filename, bytes, response.headers.get('content-type') || 'application/pdf')
        notes.push({ status: 'included', label })
      } catch (error) {
        notes.push({ status: 'failed', label, detail: error instanceof Error ? error.message : 'Unknown error' })
      }
    }

    if (wants('medical')) {
      if (externalStudent && registration?.medical) {
        await addPdf(
          'Medical self-declaration',
          'Medical/medical-self-declaration.pdf',
          `/api/students/${externalStudent.student_id}/medical-pdf`,
        )
      } else {
        notes.push({ status: 'unavailable', label: 'Medical self-declaration', detail: 'No completed medical declaration found' })
      }
    }

    if (wants('contract')) {
      if (registration?.vehicleType === 'truck') {
        await addPdf(
          'Class 1 service contract',
          'Contract/class-1-service-contract-en-fr.pdf',
          `/api/register/contract?registrationId=${encodeURIComponent(registration.id)}&lang=both`,
        )
      } else if (registration?.vehicleType === 'car') {
        try {
          const agreement = await buildClass5AgreementPdf(registration, {
            pricing: pricing.car,
            gstNumber: invoiceSettings?.gstNumber || '',
            qstNumber: invoiceSettings?.qstNumber || '',
          })
          addFile('Contract/class-5-official-sales-contract.pdf', agreement, 'application/pdf')
          notes.push({ status: 'included', label: 'Official Class 5 sales contract' })
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
    }

    if (wants('attendance')) {
      if (phoneSuffix(resolvedPhone).length >= 7) {
        await addPdf(
          'Student attendance booklet',
          'Attendance/student-attendance-booklet.pdf',
          `/api/scheduling/signature/pdf?phone=${encodeURIComponent(resolvedPhone || '')}`,
        )
      } else {
        notes.push({ status: 'unavailable', label: 'Student attendance booklet', detail: 'No usable phone number found' })
      }
    }

    if (wants('certificates') && localStudent?.certificates.length) {
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
    } else if (wants('certificates')) {
      notes.push({ status: 'unavailable', label: 'Certificates', detail: 'No saved certificates found' })
    }

    if (wants('invoices') && invoices.length) {
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
    } else if (wants('invoices')) {
      notes.push({ status: 'unavailable', label: 'Invoices', detail: 'No saved invoices found' })
    }

    if (wants('registration')) {
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
          const contentType = decoded.extension === 'pdf'
            ? 'application/pdf'
            : decoded.extension === 'jpg'
              ? 'image/jpeg'
              : decoded.extension === 'webp'
                ? 'image/webp'
                : 'image/png'
          addFile(`${upload.folder}/${upload.filename}.${decoded.extension}`, decoded.bytes, contentType)
          notes.push({ status: 'included', label: upload.label })
        } else {
          notes.push({ status: 'unavailable', label: upload.label })
        }
      }
    }

    if (downloadFiles.length === 0) {
      return NextResponse.json(
        { error: 'No selected documents are available for this student', documents: notes },
        { status: 404 },
      )
    }

    if (!forceArchive && downloadFiles.length === 1) {
      const file = downloadFiles[0]
      return new NextResponse(file.bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="${path.basename(file.filename)}"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }

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
