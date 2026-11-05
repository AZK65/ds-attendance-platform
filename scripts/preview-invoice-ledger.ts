import { mkdirSync, writeFileSync } from 'node:fs'
import { buildInvoicePdf } from '../src/app/api/invoice/generate/route'

async function main() {
  const pdf=await buildInvoicePdf({
    schoolName:'Qazi Driving School',schoolAddress:'786 Jean-Talon St W',schoolCity:'Montreal',schoolProvince:'QC',schoolPostalCode:'H3N 1S2',gstNumber:'Sample',qstNumber:'Sample',
    studentName:'Amira Bennett — SAMPLE',studentAddress:'100 Example Street',studentCity:'Montreal',studentProvince:'QC',studentPostalCode:'H2X 1Y4',studentPhone:'514-555-0147',studentEmail:'sample@example.com',
    invoiceNumber:'PREVIEW-250',invoiceDate:'2026-11-04',dueDate:'',lineItems:[{description:'Class 5 course installment',quantity:1,unitPrice:217.44}],subtotal:217.44,gstRate:5,qstRate:9.975,gstAmount:10.87,qstAmount:21.69,total:250,taxesEnabled:true,
    notes:'Synthetic preview only. The course costs $1,000. This confirmed $250 payment leaves $750 owing.',paymentStatus:'paid',remainingBalance:750,balanceNeedsReview:false,
    paymentHistory:{throughDate:'2026-11-04',totalPaid:250,payments:[{date:'2026-11-04',amount:250,method:'cash',invoiceNumber:'PREVIEW-250',balanceAfter:null}]},
  })
  mkdirSync('output/pdf',{recursive:true});writeFileSync('output/pdf/invoice-ledger-preview.pdf',pdf)
}
main().catch(error=>{console.error(error);process.exitCode=1})
