import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { BRAND, logoHeightForWidth } from '@/lib/brand'
import { logoDataUrl } from '@/lib/brand-assets'

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
    marginTop: 40,
    paddingTop: 15,
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
        React.createElement(Text, { style: styles.invoiceTitle }, 'INVOICE'),
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
        // Remaining Balance (if provided)
        data.remainingBalance !== undefined && data.remainingBalance > 0
          ? React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'flex-end', width: 250, paddingVertical: 4, marginTop: 4 } },
              React.createElement(Text, { style: { flex: 1, textAlign: 'right', paddingRight: 15, color: BRAND.red, fontSize: 10, fontWeight: 'bold' } }, 'Remaining Balance:'),
              React.createElement(Text, { style: { width: 100, textAlign: 'right', color: BRAND.red, fontSize: 10, fontWeight: 'bold' } }, formatCurrency(data.remainingBalance)),
            )
          : null,
      ),

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

export async function POST(request: NextRequest) {
  try {
    const body: InvoiceData = await request.json()

    if (!body.studentName || !body.invoiceNumber) {
      return NextResponse.json(
        { error: 'Student name and invoice number are required' },
        { status: 400 }
      )
    }

    const buffer = await buildInvoicePdf(body)
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
