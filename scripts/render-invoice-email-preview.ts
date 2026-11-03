/**
 * Render the online-payment receipt email and its invoice PDF from fake data.
 * Does not read production student records.
 *
 *   DATABASE_URL=file:/tmp/invoice-email-preview.db npx tsx scripts/render-invoice-email-preview.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildInvoicePdf } from '../src/app/api/invoice/generate/route'
import { buildOnlinePaymentInvoiceEmail } from '../src/lib/online-payment-invoice-email'

const outDir = process.argv[2] || '/opt/cursor/artifacts/invoice-email'
mkdirSync(outDir, { recursive: true })

const sample = {
  studentName: 'Sample Student',
  studentEmail: 'sample.student@example.com',
  invoiceNumber: 'INV-2026-0142',
  invoiceDate: '2026-11-03',
  total: 250,
}

async function main() {
  const email = buildOnlinePaymentInvoiceEmail({
    studentName: sample.studentName,
    invoiceNumber: sample.invoiceNumber,
    total: sample.total,
    invoiceDate: sample.invoiceDate,
  })
  const htmlPath = path.join(outDir, 'receipt-email.html')
  writeFileSync(htmlPath, email.html)
  writeFileSync(path.join(outDir, 'receipt-email.txt'), email.text)

  const pdf = await buildInvoicePdf({
    schoolName: 'Qazi Driving School',
    schoolAddress: '786 rue Jean-Talon Ouest',
    schoolCity: 'Montréal',
    schoolProvince: 'QC',
    schoolPostalCode: 'H3N 1S2',
    gstNumber: '123456789 RT0001',
    qstNumber: '1234567890 TQ0001',
    studentName: sample.studentName,
    studentAddress: '100 Example Street',
    studentCity: 'Montreal',
    studentProvince: 'QC',
    studentPostalCode: 'H2X 1Y4',
    studentPhone: '514-555-0199',
    studentEmail: sample.studentEmail,
    invoiceNumber: sample.invoiceNumber,
    invoiceDate: sample.invoiceDate,
    dueDate: '',
    lineItems: [
      { description: 'Class 5 (Car) — First payment (Registration)', quantity: 1, unitPrice: 217.44 },
    ],
    subtotal: 217.44,
    gstRate: 5,
    qstRate: 9.975,
    gstAmount: 10.87,
    qstAmount: 21.69,
    total: sample.total,
    taxesEnabled: true,
    notes: 'Sample invoice for layout preview. Not a real student.',
    remainingBalance: 750,
    externalStudentId: 42,
    paymentStatus: 'paid',
    paymentHistory: { payments: [], totalPaid: 0 },
  })
  const pdfPath = path.join(outDir, 'invoice-INV-2026-0142.pdf')
  writeFileSync(pdfPath, pdf)

  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    const logoBytes = readFileSync(path.join(process.cwd(), 'public', 'qazi-logo.png'))
    const logoUrl = `data:image/png;base64,${logoBytes.toString('base64')}`
    let html = email.html
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 }).catch(async () => {
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
    })
    const logoLoaded = await page.evaluate(() => {
      const img = document.querySelector('img')
      return !!img && img.complete && img.naturalWidth > 0
    })
    if (!logoLoaded) {
      html = email.html.replaceAll('https://qazidriving.ca/qazi-logo.png', logoUrl)
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
    }
    await page.setViewport({ width: 800, height: 900, deviceScaleFactor: 2 })
    const desktop = path.join(outDir, 'receipt-email-desktop.png')
    await page.screenshot({ path: desktop, fullPage: true })
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
    const mobile = path.join(outDir, 'receipt-email-mobile.png')
    await page.screenshot({ path: mobile, fullPage: true })
    console.log(htmlPath)
    console.log(pdfPath)
    console.log(desktop)
    console.log(mobile)
    console.log('logoLoaded', logoLoaded)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
