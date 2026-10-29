import { NextRequest, NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { BRAND } from '@/lib/brand'
import { drawPdfKitLetterhead, usePdfKitChrome } from '@/lib/brand-assets'

// School information constants
const SCHOOL_INFO = {
  name: 'QAZI DRIVING SCHOOL',
  nameFr: 'ÉCOLE DE CONDUITE QAZI',
  certificateNumber: 'L526',
  phone: '514-274-6948',
  teacherName: 'Fayyaz Qazi'
}

interface AttendanceRecord {
  whatsappName: string
  whatsappPhone: string
  zoomName: string
  duration: number
  status: 'present' | 'absent'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { groupName, records, date, moduleNumber } = body as {
      groupName: string
      records: AttendanceRecord[]
      date?: string
      moduleNumber?: number
    }

    if (!groupName || !records) {
      return NextResponse.json(
        { error: 'groupName and records are required' },
        { status: 400 }
      )
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk) => chunks.push(chunk))
    usePdfKitChrome(doc)
    drawPdfKitLetterhead(doc)

    // School info line
    doc.fontSize(10).font('Helvetica').fillColor('#374151')
    doc.text(`School Certificate: ${SCHOOL_INFO.certificateNumber}  |  Phone: ${SCHOOL_INFO.phone}  |  Teacher: ${SCHOOL_INFO.teacherName}`, {
      align: 'center'
    })
    doc.moveDown(0.5)

    // Divider line
    doc.strokeColor('#e5e7eb').lineWidth(1)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()
    doc.moveDown(0.5)

    // Title
    doc.fontSize(16).font('Helvetica-Bold').fillColor(BRAND.blue).text('Zoom Class Attendance Report', {
      align: 'center'
    })
    doc.moveDown(0.3)

    // Group name
    doc.fontSize(12).font('Helvetica').fillColor(BRAND.ink).text(groupName, {
      align: 'center'
    })
    doc.moveDown(0.3)

    // Date
    const displayDate = date || new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    doc.fontSize(10).fillColor('#666666').text(`Date: ${displayDate}`, { align: 'center' })

    // Module info if provided
    if (moduleNumber) {
      doc.moveDown(0.2)
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND.blue700).text(`Module ${moduleNumber}`, { align: 'center' })
    }
    doc.moveDown(0.5)

    // Summary stats
    const presentCount = records.filter((r) => r.status === 'present').length
    const absentCount = records.filter((r) => r.status === 'absent').length

    doc
      .fontSize(11)
      .fillColor(BRAND.ink)
      .font('Helvetica-Bold')
      .text(
        `Total: ${records.length}  |  Present: ${presentCount}  |  Absent: ${absentCount}`,
        { align: 'center' }
      )
    doc.moveDown(0.8)

    // Table setup
    const tableTop = doc.y
    const tableLeft = 40
    const colWidths = {
      index: 25,
      name: 130,
      phone: 85,
      zoomName: 120,
      duration: 55,
      status: 55
    }
    const totalWidth = Object.values(colWidths).reduce((a, b) => a + b, 0)
    const rowHeight = 22

    // Header row - black theme
    doc.fillColor(BRAND.blue700)
    doc.rect(tableLeft, tableTop, totalWidth, rowHeight).fill()

    doc.fillColor(BRAND.onBlue).fontSize(9).font('Helvetica-Bold')
    let x = tableLeft + 3
    doc.text('#', x, tableTop + 7, { width: colWidths.index })
    x += colWidths.index
    doc.text('Student Name', x, tableTop + 7, { width: colWidths.name })
    x += colWidths.name
    doc.text('Phone', x, tableTop + 7, { width: colWidths.phone })
    x += colWidths.phone
    doc.text('Zoom Name', x, tableTop + 7, { width: colWidths.zoomName })
    x += colWidths.zoomName
    doc.text('Duration', x, tableTop + 7, { width: colWidths.duration })
    x += colWidths.duration
    doc.text('Status', x, tableTop + 7, { width: colWidths.status })

    let y = tableTop + rowHeight

    doc.font('Helvetica').fontSize(8)

    // Sort: present first, then absent
    const sortedRecords = [...records].sort((a, b) => {
      if (a.status === 'present' && b.status === 'absent') return -1
      if (a.status === 'absent' && b.status === 'present') return 1
      return a.whatsappName.localeCompare(b.whatsappName)
    })

    // Helper to draw header on new page
    const drawHeader = (yPos: number) => {
      doc.fillColor(BRAND.blue700)
      doc.rect(tableLeft, yPos, totalWidth, rowHeight).fill()

      doc.fillColor(BRAND.onBlue).fontSize(9).font('Helvetica-Bold')
      let hx = tableLeft + 3
      doc.text('#', hx, yPos + 7, { width: colWidths.index })
      hx += colWidths.index
      doc.text('Student Name', hx, yPos + 7, { width: colWidths.name })
      hx += colWidths.name
      doc.text('Phone', hx, yPos + 7, { width: colWidths.phone })
      hx += colWidths.phone
      doc.text('Zoom Name', hx, yPos + 7, { width: colWidths.zoomName })
      hx += colWidths.zoomName
      doc.text('Duration', hx, yPos + 7, { width: colWidths.duration })
      hx += colWidths.duration
      doc.text('Status', hx, yPos + 7, { width: colWidths.status })

      doc.font('Helvetica').fontSize(8)
      return yPos + rowHeight
    }

    sortedRecords.forEach((record, index) => {
      // Page break if needed
      if (y > 750) {
        doc.addPage()
        y = drawHeader(50)
      }

      // Alternating row colors
      if (index % 2 === 0) {
        doc.fillColor(BRAND.surfaceMuted)
        doc.rect(tableLeft, y, totalWidth, rowHeight).fill()
      }

      // Row background for absent - light red
      if (record.status === 'absent') {
        doc.fillColor('#fef2f2')
        doc.rect(tableLeft, y, totalWidth, rowHeight).fill()
      }

      doc.fillColor(BRAND.ink)
      x = tableLeft + 3

      // Index
      doc.text(String(index + 1), x, y + 7, { width: colWidths.index })
      x += colWidths.index

      // WhatsApp Name - clean up the name
      const rawName = record.whatsappName || '-'
      const displayName = rawName
        .replace(/\s*#\d+/g, '')           // Remove #123 patterns anywhere
        .replace(/\s*[\(\[]?\d+[\)\]]?\s*$/, '')  // Remove trailing numbers
        .trim() || rawName
      doc.text(displayName, x, y + 7, {
        width: colWidths.name - 5,
        ellipsis: true
      })
      x += colWidths.name

      // Phone
      const phone = record.whatsappPhone ? `+${record.whatsappPhone}` : '-'
      doc.text(phone, x, y + 7, { width: colWidths.phone - 5 })
      x += colWidths.phone

      // Zoom Name
      doc.text(record.zoomName || '-', x, y + 7, {
        width: colWidths.zoomName - 5,
        ellipsis: true
      })
      x += colWidths.zoomName

      // Duration (format as Xh Ym or Xm)
      let durationText = '-'
      if (record.duration && record.duration > 0) {
        const mins = Math.floor(record.duration / 60)
        if (mins >= 60) {
          const hours = Math.floor(mins / 60)
          const remainingMins = mins % 60
          durationText = `${hours}h ${remainingMins}m`
        } else {
          durationText = `${mins}m`
        }
      }
      doc.text(durationText, x, y + 7, { width: colWidths.duration - 5 })
      x += colWidths.duration

      // Status with color
      if (record.status === 'present') {
        doc.fillColor(BRAND.green).font('Helvetica-Bold')
        doc.text('Present', x, y + 7, { width: colWidths.status })
      } else {
        doc.fillColor(BRAND.red).font('Helvetica-Bold')
        doc.text('Absent', x, y + 7, { width: colWidths.status })
      }
      doc.font('Helvetica')

      // Row border
      doc
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .moveTo(tableLeft, y + rowHeight)
        .lineTo(tableLeft + totalWidth, y + rowHeight)
        .stroke()

      y += rowHeight
    })

    // Footer with school info
    doc.moveDown(2)
    doc.strokeColor('#e5e7eb').lineWidth(1)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()
    doc.moveDown(0.5)

    doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
    doc.text(`${SCHOOL_INFO.nameFr} / ${SCHOOL_INFO.name}`, { align: 'center' })
    doc.text(`Certificate: ${SCHOOL_INFO.certificateNumber} | Phone: ${SCHOOL_INFO.phone} | Teacher: ${SCHOOL_INFO.teacherName}`, { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(8).text(`Generated on ${new Date().toLocaleString()}`, { align: 'center' })

    doc.end()

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
    })

    // Create filename with module info if available
    const moduleStr = moduleNumber ? `-Module${moduleNumber}` : ''
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `Qazi-ZoomAttendance-${groupName.replace(/[^a-z0-9]/gi, '-')}${moduleStr}-${dateStr}.pdf`

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
