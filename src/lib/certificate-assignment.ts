import type { Certificate, Student } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  certificateConflictMessage,
  certificateNumbersEqual,
  countLocalNamesakes,
  keepStoredCertificateNumber,
  mayOverwriteLocalStudent,
  normalizeCertificateNumber,
  type CertificateHolder,
  type CertificatePerson,
} from '@/lib/certificate-numbers'
import { findStudentsByCertificateNumbers } from '@/lib/external-db'
import { findBestLocalStudent } from '@/lib/local-student-lookup'

export interface RosterCertificateRow {
  full_name: string
  phone_number?: string | null
  permit_number?: string | null
  /** Legacy roster column. This is the attestation / barcode, not the contract. */
  contract_number?: number | string | null
  /** Legacy roster column. This is the contract number. */
  user_defined_contract_number?: number | string | null
}

export type RosterLookup = (numbers: {
  contractNumber: string | null
  attestationNumber: string | null
}) => Promise<readonly RosterCertificateRow[]>

async function defaultRosterLookup(numbers: {
  contractNumber: string | null
  attestationNumber: string | null
}): Promise<readonly RosterCertificateRow[]> {
  return findStudentsByCertificateNumbers(numbers)
}

const ROSTER_UNAVAILABLE = 'Could not check these certificate numbers against the school roster. Nothing was saved. Try again.'

function rosterHolder(row: RosterCertificateRow): CertificateHolder {
  return {
    person: {
      name: row.full_name,
      phone: row.phone_number,
      licenceNumber: row.permit_number,
    },
    // user_defined_contract_number is the contract. contract_number is the barcode.
    contractNumber: row.user_defined_contract_number,
    attestationNumber: row.contract_number,
  }
}

function subjectFrom(input: {
  name?: string | null
  phone?: string | null
  phoneAlt?: string | null
  licenceNumber?: string | null
}): CertificatePerson {
  return {
    name: input.name,
    phone: input.phone,
    phoneAlt: input.phoneAlt,
    licenceNumber: (input.licenceNumber || '').trim() || null,
  }
}

export async function rejectIfCertificateNumbersConflict(
  input: {
    subject: CertificatePerson
    contractNumber?: string | null
    attestationNumber?: string | null
  },
  lookupRoster: RosterLookup = defaultRosterLookup,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const contractNumber = input.contractNumber || null
  const attestationNumber = input.attestationNumber || null
  if (!normalizeCertificateNumber(contractNumber) && !normalizeCertificateNumber(attestationNumber)) {
    return { ok: true }
  }

  let roster: readonly RosterCertificateRow[]
  try {
    roster = await lookupRoster({ contractNumber, attestationNumber })
  } catch (error) {
    console.error('[certificate] roster number lookup failed', error)
    return { ok: false, status: 503, error: ROSTER_UNAVAILABLE }
  }

  const [identities, certificates] = await Promise.all([
    prisma.student.findMany({
      select: { name: true },
    }),
    prisma.certificate.findMany({
      select: {
        contractNumber: true,
        attestationNumber: true,
        student: { select: { name: true, phone: true, phoneAlt: true, licenceNumber: true } },
      },
    }),
  ])

  const message = certificateConflictMessage({
    subject: input.subject,
    contractNumber,
    attestationNumber,
    localNamesakes: countLocalNamesakes(identities, input.subject.name),
    holders: [
      ...certificates.map((certificate) => ({
        person: certificate.student,
        contractNumber: certificate.contractNumber,
        attestationNumber: certificate.attestationNumber,
      })),
      ...roster.map(rosterHolder),
    ],
  })
  if (message) return { ok: false, status: 409, error: message }
  return { ok: true }
}

export interface CertificateSaveBody {
  licenceNumber?: string | null
  name?: string | null
  phone?: string | null
  phoneAlt?: string | null
  email?: string | null
  address?: string | null
  apartment?: string | null
  municipality?: string | null
  province?: string | null
  postalCode?: string | null
  registrationDate?: string | null
  expiryDate?: string | null
  module1Date?: string | null
  module2Date?: string | null
  module3Date?: string | null
  module4Date?: string | null
  module5Date?: string | null
  module6Date?: string | null
  module7Date?: string | null
  module8Date?: string | null
  module9Date?: string | null
  module10Date?: string | null
  module11Date?: string | null
  module12Date?: string | null
  sortie1Date?: string | null
  sortie2Date?: string | null
  sortie3Date?: string | null
  sortie4Date?: string | null
  sortie5Date?: string | null
  sortie6Date?: string | null
  sortie7Date?: string | null
  sortie8Date?: string | null
  sortie9Date?: string | null
  sortie10Date?: string | null
  sortie11Date?: string | null
  sortie12Date?: string | null
  sortie13Date?: string | null
  sortie14Date?: string | null
  sortie15Date?: string | null
  certificateType?: string | null
  contractNumber?: string | number | null
  attestationNumber?: string | number | null
  localStudentId?: string | null
}

export type CertificateSaveResult =
  | { ok: true; student: Student; certificate: Certificate }
  | { ok: false; status: number; error: string }

export async function saveCertificateStudent(
  body: CertificateSaveBody,
  options?: { lookupRoster?: RosterLookup },
): Promise<CertificateSaveResult> {
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

  if (!name || !String(name).trim()) {
    return { ok: false, status: 400, error: 'Student name is required' }
  }

  const cleanAttestation = attestationNumber ? String(attestationNumber).replace(/\s+/g, '') : null
  const contractText = contractNumber == null || contractNumber === '' ? null : String(contractNumber)
  const cleanLicence = licenceNumber?.trim() || null
  const subject = subjectFrom({ name, phone, phoneAlt, licenceNumber: cleanLicence })

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
  const updateData = { ...studentData, ...(email ? { email } : {}) }
  const createData = { ...studentData, ...(email ? { email } : {}) }

  const identities = await prisma.student.findMany({
    select: { name: true },
  })
  const namesakes = countLocalNamesakes(identities, name)

  const refuse = (row: { id: string; name: string }) => {
    console.warn(`[students POST] refusing to overwrite ${row.name} (${row.id}); not the same student as ${name}`)
  }

  let existing: Student | null = null
  if (typeof localStudentId === 'string' && localStudentId) {
    existing = await prisma.student.findUnique({ where: { id: localStudentId } })
    if (existing && !mayOverwriteLocalStudent(existing, subject, namesakes)) {
      refuse(existing)
      existing = null
    }
  }
  if (!existing && cleanLicence) {
    existing = await prisma.student.findFirst({ where: { licenceNumber: cleanLicence } })
    if (existing && !mayOverwriteLocalStudent(existing, subject, namesakes)) {
      refuse(existing)
      existing = null
    }
  }
  if (!existing) {
    const found = await findBestLocalStudent({ phone, phoneAlt, name })
    if (found && mayOverwriteLocalStudent(found, subject, namesakes)) existing = found
    else if (found) refuse(found)
  }

  const conflict = await rejectIfCertificateNumbersConflict(
    { subject, contractNumber: contractText, attestationNumber: cleanAttestation },
    options?.lookupRoster,
  )
  if (!conflict.ok) return conflict

  const student = existing
    ? await prisma.student.update({
        where: { id: existing.id },
        data: { ...updateData, ...(cleanLicence ? { licenceNumber: cleanLicence } : {}) },
      })
    : await prisma.student.create({
        data: { ...createData, ...(cleanLicence ? { licenceNumber: cleanLicence } : {}) },
      })

  const ownedCertificates = await prisma.certificate.findMany({
    where: { studentId: student.id },
    orderBy: { generatedAt: 'desc' },
  })
  const existingCertificate = ownedCertificates.find((certificate) =>
    certificateNumbersEqual(certificate.contractNumber, contractText)
    || certificateNumbersEqual(certificate.attestationNumber, cleanAttestation),
  )

  const certificate = existingCertificate
    ? await prisma.certificate.update({
        where: { id: existingCertificate.id },
        data: {
          certificateType: certificateType || 'full',
          // Only replace a number when it actually changed. A reprint that
          // omits one number must not wipe the value already stored.
          ...(normalizeCertificateNumber(contractText)
            ? { contractNumber: keepStoredCertificateNumber(existingCertificate.contractNumber, contractText) }
            : {}),
          ...(normalizeCertificateNumber(cleanAttestation)
            ? { attestationNumber: keepStoredCertificateNumber(existingCertificate.attestationNumber, cleanAttestation) }
            : {}),
        },
      })
    : await prisma.certificate.create({
        data: {
          studentId: student.id,
          certificateType: certificateType || 'full',
          contractNumber: contractText,
          attestationNumber: cleanAttestation,
        },
      })

  return { ok: true, student, certificate }
}

export async function updateCertificateNumbers(
  input: { certificateId?: string | null; contractNumber?: unknown; attestationNumber?: unknown },
  options?: { lookupRoster?: RosterLookup },
): Promise<{ ok: true; certificate: Certificate } | { ok: false; status: number; error: string }> {
  if (!input.certificateId) return { ok: false, status: 400, error: 'certificateId is required' }

  const current = await prisma.certificate.findUnique({
    where: { id: input.certificateId },
    include: { student: { select: { name: true, phone: true, phoneAlt: true, licenceNumber: true } } },
  })
  if (!current) return { ok: false, status: 404, error: 'Certificate not found' }

  const cleanContract = input.contractNumber === undefined
    ? undefined
    : String(input.contractNumber || '').trim() || null
  const cleanAttestation = input.attestationNumber === undefined
    ? undefined
    : String(input.attestationNumber || '').replace(/\s+/g, '') || null

  const conflict = await rejectIfCertificateNumbersConflict(
    {
      subject: current.student,
      contractNumber: cleanContract === undefined ? current.contractNumber : cleanContract,
      attestationNumber: cleanAttestation === undefined ? current.attestationNumber : cleanAttestation,
    },
    options?.lookupRoster,
  )
  if (!conflict.ok) return conflict

  const certificate = await prisma.certificate.update({
    where: { id: current.id },
    data: {
      ...(cleanContract !== undefined
        ? { contractNumber: keepStoredCertificateNumber(current.contractNumber, cleanContract) }
        : {}),
      ...(cleanAttestation !== undefined
        ? { attestationNumber: keepStoredCertificateNumber(current.attestationNumber, cleanAttestation) }
        : {}),
    },
  })
  return { ok: true, certificate }
}
