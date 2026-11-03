import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DEFAULT_TRUCK_CONTRACT } from './pricing'
import {
  CLASS1_DEFAULT_CIRCUIT_ADDRESS,
  CLASS1_DEFAULT_ROAD_ADDRESS,
  CLASS1_DEFAULT_THEORY_ADDRESS,
} from './class1-contract-locations'
import { buildContractInstallmentRows, listContractPayments } from './class1-contract-payments'
import { renderClass1ContractPdf, type Class1ContractData, type Class1ContractSchool } from './class1-contract-pdf'

function pdftotextAvailable(): boolean {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' })
    return true
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    return err.code !== 'ENOENT'
  }
}

const student = { externalStudentId: 42, phone: '514-555-0199', name: 'Amélie Bouchard' }
const data: Class1ContractData = {
  contractNumber: 'C1-2026-0042',
  fullName: 'Amélie Bouchard',
  dob: '1998-04-12',
  permitNumber: 'B1234-567890-12',
  address: '1200 Rue Saint-Denis, Montréal, H2X 3J5',
  phone: '514-555-0199',
  email: 'amelie.bouchard.example@example.com',
  firstCourseDate: '2026-08-04',
  maxCompletionDate: '2028-02-04',
  signedAtPlace: 'Montréal',
  consentSaaq: true,
  consentTransfer: true,
  consentContact: true,
  studentSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  repSignature: null,
  repName: 'Karim Haddad',
  repSignedAt: new Date('2026-08-05T16:00:00.000Z'),
  studentSignedAt: new Date('2026-08-03T16:00:00.000Z'),
}
const school: Class1ContractSchool = {
  name: 'École de Conduite Qazi',
  address: '786 rue Jean-Talon Ouest, Montréal, QC, H3N 1S2',
  phone: '514 274 6948',
  email: 'info@qazidrivingschool.ca',
  saaqNumber: 'L526',
  truckTheoryAddress: CLASS1_DEFAULT_THEORY_ADDRESS,
  truckRoadAddress: CLASS1_DEFAULT_ROAD_ADDRESS,
  truckCircuitAddress: CLASS1_DEFAULT_CIRCUIT_ADDRESS,
}

test('French Class 1 PDF prints locations, threshold rows, and the stored signing day', { skip: !pdftotextAvailable() }, async () => {
  const invoices = [
    { invoiceNumber: 'INV-C', invoiceDate: '2026-09-01', total: 2500, paymentStatus: 'paid', externalStudentId: 42, createdAt: '2026-09-01T00:00:00.000Z' },
    { invoiceNumber: 'INV-A', invoiceDate: '2026-08-03', total: 500, paymentStatus: 'paid', externalStudentId: 42, createdAt: '2026-08-03T00:00:00.000Z' },
    { invoiceNumber: 'INV-R', invoiceDate: '2026-01-01', total: 999, paymentStatus: 'refunded', externalStudentId: 42, createdAt: '2026-01-01T00:00:00.000Z' },
    { invoiceNumber: 'INV-B', invoiceDate: '2026-08-06', total: 2000, paymentStatus: 'paid', externalStudentId: 42, createdAt: '2026-08-06T00:00:00.000Z' },
  ]
  const buffer = await renderClass1ContractPdf({
    lang: 'fr',
    data,
    school,
    pricing: DEFAULT_TRUCK_CONTRACT,
    rows: buildContractInstallmentRows(listContractPayments(invoices, student)),
  })
  const dir = mkdtempSync(path.join(tmpdir(), 'class1-contract-'))
  const pdf = path.join(dir, 'contract.pdf')
  writeFileSync(pdf, buffer)
  const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' })
  assert.match(text, /Transmission des renseignements à la SAAQ/)
  assert.match(text, /Transfert du dossier en cas de fermeture/)
  assert.match(text, /Communication des coordonnées/)
  assert.match(text, /786 Rue Jean-Talon O, Montréal, QC H3N 1S2/)
  assert.match(text, /3002 Av Jacques-Bureau, Laval, QC H4P 0H3/)
  assert.match(text, /2 500,00 \$/)
  assert.match(text, /2026-08-06/)
  assert.match(text, /2026-09-01/)
  assert.doesNotMatch(text, /2026-08-03/)
  assert.match(text, /\$ _______/)
  assert.doesNotMatch(text, /999/)
  assert.equal(text.split('3 août 2026').length - 1, 2)
  assert.match(text, /4 août 2026/)
  assert.match(text, /4 février 2028/)
  assert.match(text, /5 août 2026/)
  assert.doesNotMatch(text, /29 octobre 2026/)
  const firstPaid = text.indexOf('2026-08-06')
  const secondPaid = text.indexOf('2026-09-01')
  assert.ok(firstPaid >= 0 && secondPaid > firstPaid)
})
