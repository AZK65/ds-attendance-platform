import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { BRAND, logoHeightForWidth } from '@/lib/brand'
import { logoDataUrl } from '@/lib/brand-assets'
import { findInvoicesForStudent } from '@/lib/invoice-lookup'
import { listPriorPayments, printedRemainingBalance, type PaymentHistory } from '@/lib/invoice-payments'
import { parseExternalStudentId } from '@/lib/invoice-student-id'
import { prisma } from '@/lib/db'
import { studentBillingSummary } from '@/lib/invoice-billing'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
}

interface InvoiceData {
  // School
  schoolName: string
  schoolAddress: string
  schoolCity: string
  schoolProvince: string
  schoolPostalCode: string
  // Tax registration numbers
  gstNumber: string
  qstNumber: string
  // Student
  studentName: string
  studentAddress: string
  studentCity: string
  studentProvince: string
  studentPostalCode: string
  studentPhone: string
  studentEmail: string
  // Invoice
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  lineItems: LineItem[]
  subtotal: number
  gstRate: number
  qstRate: number
  gstAmount: number
  qstAmount: number
  total: number
  taxesEnabled: boolean
  notes: string
  remainingBalance?: number
  /** MySQL student id, when the caller already has it. Used only to find prior invoices. */
  externalStudentId?: number | null
  /**
   * Prior paid invoices. The POST handler fills this from the database.
   * Null means the lookup failed and the section is omitted.
   * An empty list means there are no payments yet.
   */
  paymentHistory?: PaymentHistory | null
  /** Saved payment status. "paid" prints the PAID marker. */
  paymentStatus?: string | null
  balanceNeedsReview?: boolean
}

// Styles for the invoice PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: BRAND.ink,
  },
  stripe: {
    flexDirection: 'row',
    height: 6,
    marginHorizontal: -40,
    marginTop: -40,
    marginBottom: 16,
  },
  stripeBlue: { flex: 1, backgroundColor: BRAND.blue },
  stripeRed: { flex: 1, backgroundColor: BRAND.red },
  stripeGreen: { flex: 1, backgroundColor: BRAND.green },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 118,
    height: logoHeightForWidth(118),
  },
  invoiceTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: BRAND.blue,
    letterSpacing: 2,
  },
  // School & Invoice Info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  schoolInfo: {
    fontSize: 9,
    lineHeight: 1.6,
    color: '#555',
  },
  invoiceInfo: {
    textAlign: 'right',
    fontSize: 10,
  },
  invoiceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginBottom: 3,
  },
  invoiceInfoLabel: {
    fontWeight: 'bold',
    color: '#555',
  },
  invoiceInfoValue: {
    minWidth: 100,
    textAlign: 'right',
  },
  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 20,
  },
  dividerThick: {
    borderBottomWidth: 2,
    borderBottomColor: BRAND.blue,
    marginBottom: 20,
  },
  // Bill To
  billToSection: {
    marginBottom: 25,
  },
  billToLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: BRAND.blue,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  billToName: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  billToText: {
    fontSize: 10,
    lineHeight: 1.5,
    color: '#555',
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BRAND.blue700,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  colDescription: {
    flex: 4,
    fontSize: 10,
  },
  colQty: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
  },
  colPrice: {
    flex: 2,
    textAlign: 'right',
    fontSize: 10,
  },
  colAmount: {
    flex: 2,
    textAlign: 'right',
    fontSize: 10,
  },
  tableHeaderText: {
    fontWeight: 'bold',
    fontSize: 9,
    textTransform: 'uppercase',
    color: BRAND.onBlue,
    letterSpacing: 0.5,
  },
  // Totals
  totalsSection: {
    marginTop: 15,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 250,
    paddingVertical: 3,
  },
  totalLabel: {
    flex: 1,
    textAlign: 'right',
    paddingRight: 15,
    color: '#555',
  },
  totalValue: {
    width: 100,
    textAlign: 'right',
  },
  totalRowFinal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 250,
    paddingVertical: 6,
    borderTopWidth: 2,
    borderTopColor: BRAND.blue,
    marginTop: 3,
  },
  totalFinalLabel: {
    flex: 1,
    textAlign: 'right',
    paddingRight: 15,
    fontWeight: 'bold',
    fontSize: 13,
  },
  totalFinalValue: {
    width: 100,
    textAlign: 'right',
    fontWeight: 'bold',
    fontSize: 13,
  },
  // Notes
  notesSection: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  notesLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: BRAND.blue,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  notesText: {
    fontSize: 10,
    color: '#555',
    lineHeight: 1.5,
  },
  paymentSection: {
    marginTop: 16,
  },
  paymentTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: BRAND.blue,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  paymentEmpty: {
    fontSize: 9,
    color: BRAND.ink70,
    marginBottom: 8,
  },
  paymentHead: {
    flexDirection: 'row',
    backgroundColor: BRAND.surfaceMuted,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 0,
  },
  paymentHeadText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: BRAND.ink70,
    letterSpacing: 0.4,
  },
  paymentLine: {
    flexDirection: 'row',
    borderBottomWidth: 0.4,
    borderBottomColor: BRAND.rule,
    paddingVertical: 3,
    paddingLeft: 8,
    paddingRight: 0,
  },
  paymentDate: { flex: 2.2, fontSize: 9, color: BRAND.ink },
  paymentMethod: { flex: 1.3, fontSize: 9, color: BRAND.ink },
  paymentAmount: { flex: 1.5, fontSize: 9, color: BRAND.ink, textAlign: 'right' },
  paymentBalance: { flex: 1.6, fontSize: 9, color: BRAND.ink, textAlign: 'right' },
  paidMark: {
    marginTop: 6,
    alignSelf: 'flex-end',
    backgroundColor: BRAND.green,
    borderRadius: 2,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  paidMarkText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.4,
  },
  paymentSummary: {
    alignItems: 'flex-end',
    marginTop: 6,
  },
  paymentSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 250,
    paddingVertical: 2,
  },
  paymentSummaryFirst: {
    borderTopWidth: 0.6,
    borderTopColor: BRAND.rule,
    marginTop: 2,
    paddingTop: 5,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#999',
  },
})

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function paymentMethodLabel(method: string | null): string {
  if (!method) return '\u2014'
  if (method === 'cash') return 'Cash'
  if (method === 'card') return 'Card'
  if (method === 'online') return 'Online'
  return method
}

function formatPaymentDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function InvoiceDocument({ data, logoSrc }: { data: InvoiceData; logoSrc: string | null }) {
  return React.createElement(Document, null,
    React.createElement(Page, { size: 'LETTER', style: styles.page },
      React.createElement(View, { style: styles.stripe, fixed: true },
        React.createElement(View, { style: styles.stripeBlue }),
        React.createElement(View, { style: styles.stripeRed }),
        React.createElement(View, { style: styles.stripeGreen }),
      ),
      // Header
      React.createElement(View, { style: styles.header },
        React.createElement(View, { style: styles.headerLeft },
          logoSrc ? React.createElement(Image, { src: logoSrc, style: styles.logo }) : null,
        ),
        React.createElement(View, { style: { alignItems: 'flex-end' } },
          React.createElement(Text, { style: styles.invoiceTitle }, 'INVOICE'),
          data.paymentStatus === 'paid'
            ? React.createElement(View, { style: styles.paidMark },
                React.createElement(Text, { style: styles.paidMarkText }, 'PAID'),
              )
            : null,
        ),
      ),

      // School info + Invoice info
      React.createElement(View, { style: styles.infoRow },
        // School info (left)
        React.createElement(View, { style: styles.schoolInfo },
          React.createElement(Text, { style: { fontWeight: 'bold', fontSize: 11, marginBottom: 3, color: BRAND.ink } }, data.schoolName),
          React.createElement(Text, null, data.schoolAddress),
          React.createElement(Text, null, `${data.schoolCity}, ${data.schoolProvince} ${data.schoolPostalCode}`),
          data.gstNumber ? React.createElement(Text, { style: { marginTop: 4 } }, `TPS/GST: ${data.gstNumber}`) : null,
          data.qstNumber ? React.createElement(Text, null, `TVQ/QST: ${data.qstNumber}`) : null,
        ),
        // Invoice info (right)
        React.createElement(View, { style: styles.invoiceInfo },
          React.createElement(View, { style: styles.invoiceInfoRow },
            React.createElement(Text, { style: styles.invoiceInfoLabel }, 'Invoice #:'),
            React.createElement(Text, { style: styles.invoiceInfoValue }, data.invoiceNumber),
          ),
          React.createElement(View, { style: styles.invoiceInfoRow },
            React.createElement(Text, { style: styles.invoiceInfoLabel }, 'Date:'),
            React.createElement(Text, { style: styles.invoiceInfoValue }, data.invoiceDate),
          ),
          data.dueDate ? React.createElement(View, { style: styles.invoiceInfoRow },
            React.createElement(Text, { style: styles.invoiceInfoLabel }, 'Due Date:'),
            React.createElement(Text, { style: styles.invoiceInfoValue }, data.dueDate),
          ) : null,
        ),
      ),

      // Divider
      React.createElement(View, { style: styles.dividerThick }),

      // Bill To
      React.createElement(View, { style: styles.billToSection },
        React.createElement(Text, { style: styles.billToLabel }, 'Bill To'),
        React.createElement(Text, { style: styles.billToName }, data.studentName),
        data.studentAddress ? React.createElement(Text, { style: styles.billToText }, data.studentAddress) : null,
        (data.studentCity || data.studentProvince || data.studentPostalCode)
          ? React.createElement(Text, { style: styles.billToText },
              [data.studentCity, data.studentProvince, data.studentPostalCode].filter(Boolean).join(', ')
            )
          : null,
        data.studentPhone ? React.createElement(Text, { style: styles.billToText }, `Tel: ${data.studentPhone}`) : null,
        data.studentEmail ? React.createElement(Text, { style: styles.billToText }, `Email: ${data.studentEmail}`) : null,
      ),

      // Table Header
      React.createElement(View, { style: styles.tableHeader },
        React.createElement(Text, { style: { ...styles.colDescription, ...styles.tableHeaderText } }, 'Description'),
        React.createElement(Text, { style: { ...styles.colQty, ...styles.tableHeaderText } }, 'Qty'),
        React.createElement(Text, { style: { ...styles.colPrice, ...styles.tableHeaderText } }, 'Unit Price'),
        React.createElement(Text, { style: { ...styles.colAmount, ...styles.tableHeaderText } }, 'Amount'),
      ),

      // Table Rows
      ...data.lineItems.map((item, index) =>
        React.createElement(View, { key: index, style: styles.tableRow },
          React.createElement(Text, { style: styles.colDescription }, item.description || ''),
          React.createElement(Text, { style: styles.colQty }, String(item.quantity)),
          React.createElement(Text, { style: styles.colPrice }, formatCurrency(item.unitPrice)),
          React.createElement(Text, { style: styles.colAmount }, formatCurrency(item.quantity * item.unitPrice)),
        )
      ),

      // Totals
      React.createElement(View, { style: styles.totalsSection },
        React.createElement(View, { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, 'Subtotal:'),
          React.createElement(Text, { style: styles.totalValue }, formatCurrency(data.subtotal)),
        ),
        data.taxesEnabled ? React.createElement(View, { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, `GST (${data.gstRate}%):`),
          React.createElement(Text, { style: styles.totalValue }, formatCurrency(data.gstAmount)),
        ) : null,
        data.taxesEnabled ? React.createElement(View, { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, `QST (${data.qstRate}%):`),
          React.createElement(Text, { style: styles.totalValue }, formatCurrency(data.qstAmount)),
        ) : null,
        React.createElement(View, { style: styles.totalRowFinal },
          React.createElement(Text, { style: styles.totalFinalLabel }, 'Total:'),
          React.createElement(Text, { style: styles.totalFinalValue }, formatCurrency(data.total)),
        ),
        React.createElement(View, { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, 'Due on this invoice:'),
          React.createElement(Text, { style: styles.totalValue }, formatCurrency(data.paymentStatus === 'paid' || data.paymentStatus === 'refunded' ? 0 : Math.max(0, data.total))),
        ),
        // If payment history could not be read, the stored balance still appears once, here.
        !data.paymentHistory && printedRemainingBalance(data.remainingBalance) != null
          ? React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'flex-end', width: 250, paddingVertical: 4, marginTop: 4 } },
              React.createElement(Text, { style: { flex: 1, textAlign: 'right', paddingRight: 15, color: BRAND.red, fontSize: 10, fontWeight: 'bold' } }, 'Remaining balance:'),
              React.createElement(Text, { style: { width: 100, textAlign: 'right', color: BRAND.red, fontSize: 10, fontWeight: 'bold' } }, formatCurrency(printedRemainingBalance(data.remainingBalance) as number)),
            )
          : null,
      ),

      data.paymentHistory ? React.createElement(View, { style: styles.paymentSection },
        React.createElement(Text, { style: styles.paymentTitle }, 'Payment history'),
        data.paymentHistory.throughDate ? React.createElement(Text, { style: styles.paymentEmpty }, `Confirmed payments through ${formatPaymentDate(data.paymentHistory.throughDate)} (including this receipt when paid).`) : null,
        data.paymentHistory.payments.length === 0
          ? React.createElement(Text, { style: styles.paymentEmpty }, 'No payments yet')
          : React.createElement(View, null,
              React.createElement(View, { style: styles.paymentHead },
                React.createElement(Text, { style: [styles.paymentDate, styles.paymentHeadText] }, 'Date'),
                React.createElement(Text, { style: [styles.paymentMethod, styles.paymentHeadText] }, 'Method'),
                React.createElement(Text, { style: [styles.paymentAmount, styles.paymentHeadText] }, 'Amount'),
              ),
              ...data.paymentHistory.payments.map((payment) =>
                React.createElement(View, { key: payment.invoiceNumber, style: styles.paymentLine, wrap: false },
                  React.createElement(Text, { style: styles.paymentDate }, formatPaymentDate(payment.date)),
                  React.createElement(Text, { style: styles.paymentMethod }, paymentMethodLabel(payment.method)),
                  React.createElement(Text, { style: styles.paymentAmount }, formatCurrency(payment.amount)),
                ),
              ),
            ),
        React.createElement(View, { style: styles.paymentSummary },
          React.createElement(View, { style: [styles.paymentSummaryRow, styles.paymentSummaryFirst] },
            React.createElement(Text, { style: styles.totalLabel }, 'Paid through receipt date:'),
            React.createElement(Text, { style: styles.totalValue }, formatCurrency(data.paymentHistory.totalPaid)),
          ),
          data.balanceNeedsReview
            ? React.createElement(Text, { style: styles.paymentSummaryRow }, 'Historical account total is not confirmed. This invoice does not establish the full course balance.')
            : printedRemainingBalance(data.remainingBalance) != null
            ? React.createElement(View, { style: styles.paymentSummaryRow },
                React.createElement(Text, { style: { flex: 1, textAlign: 'right', paddingRight: 15, color: BRAND.red, fontSize: 11, fontWeight: 'bold' } }, data.balanceNeedsReview ? 'Saved balance (needs review):' : (data.remainingBalance ?? 0) < 0 ? 'Current account credit:' : 'Current account balance:'),
                React.createElement(Text, { style: { width: 100, textAlign: 'right', color: BRAND.red, fontSize: 11, fontWeight: 'bold' } }, formatCurrency(Math.abs(data.remainingBalance ?? 0))),
              )
            : null,
        ),
      ) : null,

      // Notes
      data.notes ? React.createElement(View, { style: styles.notesSection },
        React.createElement(Text, { style: styles.notesLabel }, 'Notes'),
        React.createElement(Text, { style: styles.notesText }, data.notes),
      ) : null,

      // Footer
      React.createElement(Text, { style: styles.footer },
        `${data.schoolName} | ${data.schoolAddress}, ${data.schoolCity}, ${data.schoolProvince} ${data.schoolPostalCode}`
      ),
    )
  )
}

export async function buildInvoicePdf(body: InvoiceData) {
  const element = InvoiceDocument({ data: body, logoSrc: logoDataUrl() })
  return renderToBuffer(element)
}

/** Read confirmed receipts through this receipt's date. Does not write. */
export async function loadPaymentHistory(body: Pick<InvoiceData, 'invoiceNumber' | 'invoiceDate' | 'studentName' | 'studentPhone' | 'externalStudentId' | 'paymentStatus'>): Promise<{ history: PaymentHistory | null; paymentStatus: string | null; balance?: number; needsReview?: boolean }> {
  try {
    const saved = await prisma.invoice.findUnique({
      where: { invoiceNumber: body.invoiceNumber },
    })
    const externalStudentId = saved ? saved.externalStudentId : parseExternalStudentId(body.externalStudentId) ?? null
    const phone = saved ? saved.studentPhone || '' : body.studentPhone || ''
    const name = saved ? saved.studentName || '' : body.studentName || ''
    const paymentStatus = saved?.paymentStatus ?? body.paymentStatus ?? null
    if (externalStudentId == null && !phone && !name) return { history: { payments: [], totalPaid: 0 }, paymentStatus }
    const invoices = saved?.billingAccountId
      ? await prisma.invoice.findMany({ where: { billingAccountId: saved.billingAccountId } })
      : await findInvoicesForStudent({ externalStudentId, phone, name })
    const billing = await studentBillingSummary({ externalStudentId, phone, name })
    return {
      history: listPriorPayments(invoices, {
        billingAccountId: saved?.billingAccountId,
        invoiceNumber: body.invoiceNumber,
        invoiceDate: saved?.invoiceDate || body.invoiceDate,
        paidAt: saved?.paidAt,
        externalStudentId,
        phone,
        name,
      }),
      paymentStatus,
      balance: billing.netBalance,
      needsReview: billing.needsReview,
    }
  } catch (error) {
    console.warn('[Invoice] Payment history lookup failed:', error)
    throw new Error('Payment history could not be verified. Please retry before sending this invoice.')
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: InvoiceData = await request.json()

    if (!body.studentName || !body.invoiceNumber) {
      return NextResponse.json(
        { error: 'Student name and invoice number are required' },
        { status: 400 }
      )
    }

    // Regeneration must use saved money and student fields, not a stale browser
    // form left open before an edit or a payment confirmation.
    const saved = await prisma.invoice.findUnique({ where: { invoiceNumber: body.invoiceNumber } })
    if (saved) body = {
      ...body,
      studentName: saved.studentName, studentPhone: saved.studentPhone || '',
      studentEmail: saved.studentEmail || '', studentAddress: saved.studentAddress || '',
      studentCity: saved.studentCity || '', studentProvince: saved.studentProvince || '',
      studentPostalCode: saved.studentPostalCode || '', externalStudentId: saved.externalStudentId,
      invoiceDate: saved.invoiceDate, dueDate: saved.dueDate || '',
      lineItems: JSON.parse(saved.lineItems), subtotal: saved.subtotal,
      total: saved.total, gstAmount: saved.gstAmount, qstAmount: saved.qstAmount, notes: saved.notes || '',
    }

    const loaded = await loadPaymentHistory(body)
    const buffer = await buildInvoicePdf({
      ...body,
      paymentHistory: loaded.history,
      paymentStatus: loaded.paymentStatus,
      remainingBalance: loaded.balance,
      balanceNeedsReview: loaded.needsReview,
    })
    const uint8Array = new Uint8Array(buffer)

    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${body.invoiceNumber}.pdf"`,
      },
    })
  } catch (error) {
    console.error('[Invoice Generate] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate invoice PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
