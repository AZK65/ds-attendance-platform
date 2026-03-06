import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import fs from 'fs'
import path from 'path'

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
}

// Styles for the invoice PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#333',
  },
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
    width: 80,
    height: 30,
  },
  invoiceTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
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
    borderBottomColor: '#333',
    marginBottom: 20,
  },
  // Bill To
  billToSection: {
    marginBottom: 25,
  },
  billToLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#888',
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
    backgroundColor: '#f5f5f5',
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
    color: '#555',
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
    borderTopColor: '#333',
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
    color: '#888',
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
          React.createElement(Text, { style: { fontWeight: 'bold', fontSize: 11, marginBottom: 3, color: '#333' } }, data.schoolName),
          React.createElement(Text, null, data.schoolAddress),
          React.createElement(Text, null, `${data.schoolCity}, ${data.schoolProvince} ${data.schoolPostalCode}`),
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

export async function POST(request: NextRequest) {
  try {
    const body: InvoiceData = await request.json()

    if (!body.studentName || !body.invoiceNumber) {
      return NextResponse.json(
        { error: 'Student name and invoice number are required' },
        { status: 400 }
      )
    }

    // Try to load the logo
    let logoSrc: string | null = null
    try {
      const logoPath = path.join(process.cwd(), 'public', 'qazi-logo.png')
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath)
        logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`
      }
    } catch (err) {
      console.warn('[Invoice] Could not load logo:', err)
    }

    const element = InvoiceDocument({ data: body, logoSrc })
    const buffer = await renderToBuffer(element)
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
