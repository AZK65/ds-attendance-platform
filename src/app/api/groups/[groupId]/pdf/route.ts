import { NextRequest, NextResponse } from 'next/server'
import { getGroupParticipants, getGroupInfo, getWhatsAppState, getGroupLastMessage } from '@/lib/whatsapp/client'
import PDFDocument from 'pdfkit'
import path from 'path'
import fs from 'fs'

// School information constants
const SCHOOL_INFO = {
  name: 'QAZI DRIVING SCHOOL',
  nameFr: 'ÉCOLE DE CONDUITE QAZI',
  certificateNumber: 'L526',
  phone: '514-274-6948',
  teacherName: 'Fayyaz Qazi'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)

  try {
    const state = getWhatsAppState()
    if (!state.isConnected) {
      return NextResponse.json(
        { error: 'WhatsApp not connected' },
        { status: 400 }
      )
    }

    const groupInfo = await getGroupInfo(decodedGroupId)
    const allParticipants = await getGroupParticipants(decodedGroupId)
    // Filter out the group owner (isSuperAdmin)
    const participants = allParticipants.filter(p => !p.isSuperAdmin)
    const lastMessage = await getGroupLastMessage(decodedGroupId)
    const moduleNumber = lastMessage?.moduleNumber || null

    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk) => chunks.push(chunk))

    // Try to add logo if it exists - centered
    const logoPath = path.join(process.cwd(), 'public', 'qazi-logo.png')
    if (fs.existsSync(logoPath)) {
      // Center the logo: page width is 595 (A4), logo width is 150, so x = (595 - 150) / 2 = 222.5
      doc.image(logoPath, 222.5, 30, { width: 150 })
      doc.moveDown(3.5)
    } else {
      // Text-based header if no logo - red theme
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#b91c1c').text(SCHOOL_INFO.nameFr, {
        align: 'center'
      })
      doc.fontSize(16).fillColor('#b91c1c').text(SCHOOL_INFO.name, {
        align: 'center'
      })
      doc.moveDown(0.3)
    }

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
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000').text('Class Attendance Sheet', {
      align: 'center'
    })
    doc.moveDown(0.3)

    // Group name
    doc.fontSize(12).font('Helvetica').text(groupInfo.name, {
      align: 'center'
    })
    doc.moveDown(0.3)

    // Date and Module info
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    doc.fontSize(10).fillColor('#666666').text(`Date: ${today}`, { align: 'center' })

    if (moduleNumber) {
      doc.moveDown(0.2)
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text(`Module ${moduleNumber}`, { align: 'center' })
    }
    doc.moveDown(0.3)

    // Member count
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#000000')
      .text(`Total Students: ${participants.length}`, { align: 'center' })
    doc.moveDown(0.8)

    // Table setup
    const tableTop = doc.y
    const tableLeft = 50
    const colWidths = {
      index: 35,
      name: 220,
      phone: 150,
      attendance: 90
    }
    const tableWidth = colWidths.index + colWidths.name + colWidths.phone + colWidths.attendance
    const rowHeight = 25

    // Header row - black theme
    doc.fillColor('#1f2937')
    doc.rect(tableLeft, tableTop, tableWidth, rowHeight).fill()

    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
    let x = tableLeft + 5
    doc.text('#', x, tableTop + 8, { width: colWidths.index })
    x += colWidths.index
    doc.text('Student Name', x, tableTop + 8, { width: colWidths.name })
    x += colWidths.name
    doc.text('Phone', x, tableTop + 8, { width: colWidths.phone })
    x += colWidths.phone
    doc.text('Present', x, tableTop + 8, { width: colWidths.attendance, align: 'center' })

    // Header border
    doc
      .strokeColor('#1f2937')
      .lineWidth(1)
      .moveTo(tableLeft, tableTop + rowHeight)
      .lineTo(tableLeft + tableWidth, tableTop + rowHeight)
      .stroke()

    let y = tableTop + rowHeight

    doc.font('Helvetica').fontSize(9)

    // Data rows
    participants.forEach((participant, index) => {
      if (y > 750) {
        doc.addPage()
        y = 50
      }

      // Alternating row background - light gray
      if (index % 2 === 1) {
        doc.fillColor('#f3f4f6')
        doc.rect(tableLeft, y, tableWidth, rowHeight).fill()
      }

      doc.fillColor('#000000')
      x = tableLeft + 5

      doc.text(String(index + 1), x, y + 8, { width: colWidths.index })
      x += colWidths.index

      // Name first (priority) - remove numbers/codes from name
      const rawName = participant.name || participant.pushName || '-'
      // Remove #numbers, trailing numbers, codes like "123", "(2)", "#5", etc.
      const displayName = rawName
        .replace(/\s*#\d+/g, '')           // Remove #123 patterns anywhere
        .replace(/\s*[\(\[]?\d+[\)\]]?\s*$/, '')  // Remove trailing numbers
        .trim() || rawName
      doc.text(displayName, x, y + 8, { width: colWidths.name - 5, ellipsis: true })
      x += colWidths.name

      // Phone with + prefix
      const phoneDisplay = '+' + participant.phone
      doc.fontSize(8).text(phoneDisplay, x, y + 9, { width: colWidths.phone })
      doc.fontSize(9)
      x += colWidths.phone

      // Checkbox for attendance - black border
      const checkboxX = x + (colWidths.attendance / 2) - 6
      const checkboxY = y + 6
      doc.strokeColor('#1f2937').lineWidth(1)
      doc.rect(checkboxX, checkboxY, 12, 12).stroke()

      // Row border
      doc
        .strokeColor('#e5e7eb')
        .lineWidth(1)
        .moveTo(tableLeft, y + rowHeight)
        .lineTo(tableLeft + tableWidth, y + rowHeight)
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

    doc.end()

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
    })

    // Create filename with module info if available
    const moduleStr = moduleNumber ? `-Module${moduleNumber}` : ''
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `Qazi-Attendance-${groupInfo.name.replace(/[^a-z0-9]/gi, '-')}${moduleStr}-${dateStr}.pdf`

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
