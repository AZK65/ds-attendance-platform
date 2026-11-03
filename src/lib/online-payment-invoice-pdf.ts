import { buildInvoicePdf, loadPaymentHistory } from '@/app/api/invoice/generate/route'
import { prisma } from '@/lib/db'

function parseLineItems(raw: string, fallbackTotal: number): { description: string; quantity: number; unitPrice: number }[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item) => {
        const row = item as { description?: unknown; quantity?: unknown; unitPrice?: unknown }
        return {
          description: typeof row.description === 'string' ? row.description : '',
          quantity: typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : 1,
          unitPrice: typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) ? row.unitPrice : 0,
        }
      })
    }
  } catch {
    // Fall through to a single line so a bad JSON blob still produces a PDF.
  }
  return [{ description: 'Registration payment', quantity: 1, unitPrice: fallbackTotal }]
}

/** Branded invoice PDF for a saved invoice. Reads school settings; does not write them. */
export async function renderStoredInvoicePdf(invoiceId: string): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)

  const [invoiceSettings, school] = await Promise.all([
    prisma.invoiceSettings.findUnique({ where: { id: 'default' } }),
    prisma.certificateSettings.findUnique({ where: { id: 'default' } }),
  ])

  const loaded = await loadPaymentHistory({
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    studentName: invoice.studentName,
    studentPhone: invoice.studentPhone || '',
    externalStudentId: invoice.externalStudentId,
    paymentStatus: invoice.paymentStatus,
  })

  const pdf = await buildInvoicePdf({
    schoolName: school?.schoolName || 'École de Conduite Qazi',
    schoolAddress: school?.schoolAddress || '786 rue Jean-Talon Ouest',
    schoolCity: school?.schoolCity || 'Montréal',
    schoolProvince: school?.schoolProvince || 'QC',
    schoolPostalCode: school?.schoolPostalCode || 'H3N 1S2',
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
    lineItems: parseLineItems(invoice.lineItems, invoice.total),
    subtotal: invoice.subtotal,
    gstRate: invoiceSettings?.defaultGstRate ?? 5,
    qstRate: invoiceSettings?.defaultQstRate ?? 9.975,
    gstAmount: invoice.gstAmount,
    qstAmount: invoice.qstAmount,
    total: invoice.total,
    taxesEnabled: invoiceSettings?.taxesEnabled ?? (invoice.gstAmount > 0 || invoice.qstAmount > 0),
    notes: invoice.notes || '',
    remainingBalance: typeof invoice.remainingBalance === 'number' ? invoice.remainingBalance : undefined,
    externalStudentId: invoice.externalStudentId,
    paymentHistory: loaded.history,
    paymentStatus: loaded.paymentStatus ?? invoice.paymentStatus,
  })
  return Buffer.from(pdf)
}
