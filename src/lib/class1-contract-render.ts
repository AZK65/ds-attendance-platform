import { prisma } from '@/lib/db'
import { findInvoicesForStudent } from '@/lib/invoice-lookup'
import { getPricing } from '@/lib/pricing'
import { pickClass1Registration } from '@/lib/class1-contract-lookup'
import { resolveClass1TrainingLocations } from '@/lib/class1-contract-locations'
import { buildContractInstallmentRows, listContractPayments } from '@/lib/class1-contract-payments'
import {
  renderClass1ContractPdf,
  type Class1ContractData,
  type Class1ContractLang,
  type Class1ContractSchool,
} from '@/lib/class1-contract-pdf'

// Reads a Class 1 registration and its paid invoices, then renders the
// contract. Nothing here writes invoices, balances, consent flags, or
// signature images. The PDF is not stored; callers return the bytes.

export class Class1ContractError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'Class1ContractError'
    this.status = status
  }
}

export async function renderStoredClass1Contract(registrationId: string, lang: Class1ContractLang = 'both') {
  const reg = await prisma.studentRegistration.findUnique({ where: { id: registrationId } })
  if (!reg) throw new Class1ContractError('Not found', 404)
  if (reg.vehicleType !== 'truck') {
    throw new Class1ContractError('Contract only applies to truck (Class 1) registrations', 400)
  }

  const student = {
    externalStudentId: reg.externalId,
    phone: reg.phoneNumber,
    name: reg.fullName,
  }
  const [certSettings, invoiceSettings, pricing, invoices] = await Promise.all([
    prisma.certificateSettings.findUnique({ where: { id: 'default' } }),
    prisma.invoiceSettings.findUnique({ where: { id: 'default' } }),
    getPricing(),
    findInvoicesForStudent(student),
  ])

  const locations = resolveClass1TrainingLocations(certSettings)
  const school: Class1ContractSchool = {
    name: certSettings?.schoolName || 'Qazi Driving School',
    address: [certSettings?.schoolAddress, certSettings?.schoolCity, certSettings?.schoolProvince, certSettings?.schoolPostalCode].filter(Boolean).join(', '),
    phone: certSettings?.schoolPhone || '514 274 6948',
    email: invoiceSettings?.senderEmail || '',
    saaqNumber: certSettings?.schoolNumber || '',
    truckTheoryAddress: locations.theory,
    truckRoadAddress: locations.road,
    truckCircuitAddress: locations.circuit,
  }
  const data: Class1ContractData = {
    contractNumber: reg.contractNumber || '',
    fullName: reg.fullName || '',
    dob: reg.dob || '',
    permitNumber: reg.permitNumber || '',
    address: [reg.fullAddress, reg.city, reg.postalCode].filter(Boolean).join(', '),
    phone: reg.phoneNumber || '',
    email: reg.email || '',
    firstCourseDate: reg.firstCourseDate,
    maxCompletionDate: reg.maxCompletionDate,
    signedAtPlace: reg.signedAtPlace || '',
    // Printed checked on every Class 1 contract. The registration form still
    // records the student's own checkboxes; those stored flags are not rewritten.
    consentSaaq: true,
    consentTransfer: true,
    consentContact: true,
    studentSignature: reg.signatureImage,
    repSignature: reg.repSignatureImage,
    repName: reg.repSignerName || '',
    repSignedAt: reg.repSignedAt,
  }
  const rows = buildContractInstallmentRows(listContractPayments(invoices, student))
  const buffer = await renderClass1ContractPdf({
    lang,
    data,
    school,
    pricing: pricing.truckContract,
    rows,
  })
  return { buffer, fullName: reg.fullName || '', contractNumber: reg.contractNumber || '' }
}

export async function renderClass1ContractFromDatabase(query: string, lang: Class1ContractLang = 'both') {
  const rows = await prisma.studentRegistration.findMany({
    select: {
      id: true,
      vehicleType: true,
      contractNumber: true,
      externalId: true,
      fullName: true,
    },
  })
  const match = pickClass1Registration(rows, query)
  const rendered = await renderStoredClass1Contract(match.id, lang)
  return { ...rendered, id: match.id }
}
