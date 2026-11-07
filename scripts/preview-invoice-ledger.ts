import { mkdirSync, writeFileSync } from 'node:fs'
import { buildInvoicePdf } from '../src/app/api/invoice/generate/route'

async function main() {
  const pdf=await buildInvoicePdf({
    schoolName:'Qazi Driving School',schoolAddress:'786 Jean-Talon St W',schoolCity:'Montreal',schoolProvince:'QC',schoolPostalCode:'H3N 1S2',gstNumber:'Sample',qstNumber:'Sample',
    studentName:'Amira Bennett — SAMPLE',studentAddress:'100 Example Street',studentCity:'Montreal',studentProvince:'QC',studentPostalCode:'H2X 1Y4',studentPhone:'514-555-0147',studentEmail:'sample@example.com',
    invoiceNumber:'PREVIEW-150',invoiceDate:'2026-11-07',dueDate:'',lineItems:[{description:'Class 5 course installment',quantity:1,unitPrice:130.47}],subtotal:130.47,gstRate:5,qstRate:9.975,gstAmount:6.52,qstAmount:13.01,total:150,taxesEnabled:true,
    notes:'Synthetic preview only. Not a real student receipt.',paymentStatus:'paid',remainingBalance:600,balanceNeedsReview:true,
    balanceNote:'Based on the saved balance of $750.00, with later recorded course payments applied. Unpaid invoices remain due.',
    paymentHistory:{throughDate:'2026-11-07',totalPaid:400,payments:[{date:'2026-09-01',amount:250,method:'cash',invoiceNumber:'PREVIEW-250',balanceAfter:null},{date:'2026-11-07',amount:150,method:'card',invoiceNumber:'PREVIEW-150',balanceAfter:null}]},
  })
  mkdirSync('output/pdf',{recursive:true});writeFileSync('output/pdf/invoice-ledger-preview.pdf',pdf)
}
main().catch(error=>{console.error(error);process.exitCode=1})
