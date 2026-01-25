import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import PDFDocument from 'pdfkit'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const groupId = searchParams.get('groupId')

  if (!groupId) {
    return NextResponse.json({ error: 'groupId is required' }, { status: 400 })
  }

  try {
    const sheet = await prisma.attendanceSheet.findUnique({
      where: { groupId },
      include: {
        records: {
          include: { contact: true },
          orderBy: { contact: { phone: 'asc' } }
        },
        group: true
      }
    })

    if (!sheet) {
      return NextResponse.json(
        { error: 'Attendance sheet not found' },
        { status: 404 }
      )
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk) => chunks.push(chunk))

    doc.fontSize(20).font('Helvetica-Bold').text('Attendance Sheet', {
      align: 'center'
    })
    doc.moveDown(0.5)

    doc.fontSize(14).font('Helvetica').text(sheet.group.name, {
      align: 'center'
    })
    doc.moveDown(0.3)

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    doc.fontSize(10).fillColor('#666666').text(today, { align: 'center' })
    doc.moveDown(1)

    const presentCount = sheet.records.filter((r) => r.status === 'present').length
    const absentCount = sheet.records.filter((r) => r.status === 'absent').length
    const excusedCount = sheet.records.filter((r) => r.status === 'excused').length

    doc
      .fontSize(10)
      .fillColor('#000000')
      .text(
        `Total: ${sheet.records.length}  |  Present: ${presentCount}  |  Absent: ${absentCount}  |  Excused: ${excusedCount}`,
        { align: 'center' }
      )
    doc.moveDown(1)

    const tableTop = doc.y
    const tableLeft = 50
    const colWidths = {
      index: 30,
      name: 150,
      phone: 100,
      status: 70,
      notes: 145
    }
    const rowHeight = 25

    doc.fillColor('#f3f4f6')
    doc.rect(tableLeft, tableTop, 495, rowHeight).fill()

    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
    let x = tableLeft + 5
    doc.text('#', x, tableTop + 8, { width: colWidths.index })
    x += colWidths.index
    doc.text('Name', x, tableTop + 8, { width: colWidths.name })
    x += colWidths.name
    doc.text('Phone', x, tableTop + 8, { width: colWidths.phone })
    x += colWidths.phone
    doc.text('Status', x, tableTop + 8, { width: colWidths.status })
    x += colWidths.status
    doc.text('Notes', x, tableTop + 8, { width: colWidths.notes })

    doc
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .moveTo(tableLeft, tableTop + rowHeight)
      .lineTo(tableLeft + 495, tableTop + rowHeight)
      .stroke()

    let y = tableTop + rowHeight

    doc.font('Helvetica').fontSize(9)

    sheet.records.forEach((record, index) => {
      if (y > 750) {
        doc.addPage()
        y = 50
      }

      if (index % 2 === 1) {
        doc.fillColor('#f9fafb')
        doc.rect(tableLeft, y, 495, rowHeight).fill()
      }

      doc.fillColor('#000000')
      x = tableLeft + 5

      doc.text(String(index + 1), x, y + 8, { width: colWidths.index })
      x += colWidths.index

      const displayName =
        record.contact.name || record.contact.pushName || record.contact.phone
      doc.text(displayName, x, y + 8, {
        width: colWidths.name,
        ellipsis: true
      })
      x += colWidths.name

      doc.text(record.contact.phone, x, y + 8, { width: colWidths.phone })
      x += colWidths.phone

      let statusColor = '#000000'
      let statusText = record.status
      if (record.status === 'present') {
        statusColor = '#16a34a'
        statusText = 'Present'
      } else if (record.status === 'absent') {
        statusColor = '#dc2626'
        statusText = 'Absent'
      } else if (record.status === 'excused') {
        statusColor = '#6b7280'
        statusText = 'Excused'
      }
      doc.fillColor(statusColor).text(statusText, x, y + 8, {
        width: colWidths.status
      })
      x += colWidths.status

      doc.fillColor('#000000').text(record.notes || '-', x, y + 8, {
        width: colWidths.notes,
        ellipsis: true
      })

      doc
        .strokeColor('#e5e7eb')
        .moveTo(tableLeft, y + rowHeight)
        .lineTo(tableLeft + 495, y + rowHeight)
        .stroke()

      y += rowHeight
    })

    doc.end()

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
    })

    const filename = `attendance-${sheet.group.name.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
