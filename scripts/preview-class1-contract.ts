// Synthetic preview: no student database or stored signatures are read.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { renderClass1ContractPdf } from '../src/lib/class1-contract-pdf'
import { resolveClass1TrainingLocations } from '../src/lib/class1-contract-locations'
import { buildContractInstallmentRows, listContractPayments } from '../src/lib/class1-contract-payments'
import { DEFAULT_TRUCK_CONTRACT } from '../src/lib/pricing'

async function main() {
  const dest = path.resolve(process.argv[2] || 'output/pdf')
  await mkdir(dest, { recursive: true })
  const student = { externalStudentId: 42, phone: '5145550199', name: 'Vikrant Singh (sample)' }
  const payments = listContractPayments([
    { invoiceNumber: 'SAMPLE-A', invoiceDate: '2026-08-03', total: 500, paymentStatus: 'paid', externalStudentId: 42 },
    { invoiceNumber: 'SAMPLE-B', invoiceDate: '2026-08-06', total: 2000, paymentStatus: 'paid', externalStudentId: 42 },
    { invoiceNumber: 'SAMPLE-C', invoiceDate: '2026-09-01', total: 2500, paymentStatus: 'paid', externalStudentId: 42 },
  ], student)
  const locations = resolveClass1TrainingLocations()
  for (const lang of ['fr', 'en'] as const) {
    const bytes = await renderClass1ContractPdf({ lang,
      school: { name: 'École de Conduite Qazi', address: locations.theory,
        phone: '514 274 6948', email: '', saaqNumber: 'L526',
        truckTheoryAddress: locations.theory, truckRoadAddress: locations.road, truckCircuitAddress: locations.circuit },
      data: { contractNumber: 'SAMPLE', fullName: student.name, dob: '', permitNumber: '',
        address: '', phone: student.phone, email: '', firstCourseDate: '2026-08-04', maxCompletionDate: '2028-02-04',
        signedAtPlace: 'Montréal', consentSaaq: true, consentTransfer: true, consentContact: true,
        studentSignature: null, repSignature: null, repName: '', repSignedAt: null,
        studentSignedAt: new Date('2026-08-03T16:00:00Z') },
      pricing: DEFAULT_TRUCK_CONTRACT, rows: buildContractInstallmentRows(payments),
    })
    const file = path.join(dest, `class1-contract-preview-${lang}.pdf`)
    await writeFile(file, bytes)
    console.log(file)
  }
}
void main()
