import { NextRequest, NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import path from 'path'
import fs from 'fs'

const SCHOOL_INFO = {
  name: 'QAZI DRIVING SCHOOL',
  nameFr: 'ÉCOLE DE CONDUITE QAZI',
  certificateNumber: 'L526',
  phone: '514-274-6948',
  teacherName: 'Nasar',
}

interface TruckClassPDF {
  date: string       // "2026-02-20"
  startTime: string  // "09:00"
  endTime: string    // "10:00"
  isExam: boolean
  examLocation: string | null
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentName, studentPhone, classes } = body as {
      studentName: string
      studentPhone: string
      classes: TruckClassPDF[]
    }

    if (!studentName || !classes || classes.length === 0) {
      return NextResponse.json({ error: 'studentName and classes required' }, { status: 400 })
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk))

    // --- Header ---
    const logoPath = path.join(process.cwd(), 'public', 'qazi-logo.png')
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 222.5, 30, { width: 150 })
      doc.moveDown(3.5)
    } else {
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#047857').text(SCHOOL_INFO.nameFr, { align: 'center' })
      doc.fontSize(16).fillColor('#047857').text(SCHOOL_INFO.name, { align: 'center' })
      doc.moveDown(0.3)
    }

    // School info
    doc.fontSize(10).font('Helvetica').fillColor('#374151')
    doc.text(`School Certificate: ${SCHOOL_INFO.certificateNumber}  |  Phone: ${SCHOOL_INFO.phone}  |  Instructor: ${SCHOOL_INFO.teacherName}`, { align: 'center' })
    doc.moveDown(0.5)

    // Divider
    doc.strokeColor('#e5e7eb').lineWidth(1)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()
    doc.moveDown(0.5)

    // Title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#047857').text('Truck Training Schedule', { align: 'center' })
    doc.moveDown(0.5)

    // Student info
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('Student Information', 50)
    doc.moveDown(0.3)
    doc.fontSize(11).font('Helvetica').fillColor('#374151')
    doc.text(`Name: ${studentName}`, 50)
    if (studentPhone) {
      doc.text(`Phone: +${studentPhone}`, 50)
    }
    doc.moveDown(0.8)

    // --- Table ---
    const tableLeft = 50
    const colWidths = {
      index: 40,
      date: 160,
      time: 150,
      type: 70,
      location: 75,
    }
    const tableWidth = colWidths.index + colWidths.date + colWidths.time + colWidths.type + colWidths.location
    const rowHeight = 28

    // Draw header function (reusable for page breaks)
    const drawTableHeader = (y: number) => {
      doc.fillColor('#047857')
      doc.rect(tableLeft, y, tableWidth, rowHeight).fill()

      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
      let x = tableLeft + 5
      doc.text('#', x, y + 9, { width: colWidths.index })
      x += colWidths.index
      doc.text('Date', x, y + 9, { width: colWidths.date })
      x += colWidths.date
      doc.text('Time', x, y + 9, { width: colWidths.time })
      x += colWidths.time
      doc.text('Type', x, y + 9, { width: colWidths.type })
      x += colWidths.type
      doc.text('Location', x, y + 9, { width: colWidths.location })

      doc.strokeColor('#047857').lineWidth(1)
      doc.moveTo(tableLeft, y + rowHeight).lineTo(tableLeft + tableWidth, y + rowHeight).stroke()

      return y + rowHeight
    }

    let y = drawTableHeader(doc.y)
    doc.font('Helvetica').fontSize(10)

    // Number classes (exams don't get numbered)
    let classNumber = 0

    // Data rows
    classes.forEach((cls, index) => {
      if (!cls.isExam) classNumber++

      if (y > 720) {
        doc.addPage()
        y = 50
        y = drawTableHeader(y)
      }

      // Alternating row background
      if (index % 2 === 1) {
        doc.fillColor('#f0fdf4') // very light green
        doc.rect(tableLeft, y, tableWidth, rowHeight).fill()
      }

      // Exam rows get a light red background
      if (cls.isExam) {
        doc.fillColor('#fef2f2')
        doc.rect(tableLeft, y, tableWidth, rowHeight).fill()
      }

      doc.fillColor('#000000')
      let x = tableLeft + 5

      // Index / class number
      doc.font('Helvetica-Bold')
      if (cls.isExam) {
        doc.fillColor('#b91c1c')
        doc.text('EXAM', x, y + 9, { width: colWidths.index })
      } else {
        doc.fillColor('#047857')
        doc.text(String(classNumber), x, y + 9, { width: colWidths.index })
      }
      x += colWidths.index

      // Date
      doc.font('Helvetica').fillColor('#000000')
      doc.text(formatDateDisplay(cls.date), x, y + 9, { width: colWidths.date })
      x += colWidths.date

      // Time
      doc.text(`${formatTimeDisplay(cls.startTime)} – ${formatTimeDisplay(cls.endTime)}`, x, y + 9, { width: colWidths.time })
      x += colWidths.time

      // Type
      doc.font('Helvetica-Bold')
      if (cls.isExam) {
        doc.fillColor('#b91c1c').text('Exam', x, y + 9, { width: colWidths.type })
      } else {
        doc.fillColor('#047857').text('Class', x, y + 9, { width: colWidths.type })
      }
      x += colWidths.type

      // Location
      doc.font('Helvetica').fillColor('#374151')
      doc.text(cls.isExam && cls.examLocation ? cls.examLocation : '—', x, y + 9, { width: colWidths.location })

      // Row border
      doc.strokeColor('#e5e7eb').lineWidth(0.5)
      doc.moveTo(tableLeft, y + rowHeight).lineTo(tableLeft + tableWidth, y + rowHeight).stroke()

      y += rowHeight
    })

    // Summary
    doc.moveDown(1.5)
    const regularCount = classes.filter(c => !c.isExam).length
    const examCount = classes.filter(c => c.isExam).length
    doc.fontSize(10).font('Helvetica').fillColor('#374151')
    doc.text(`Total: ${regularCount} class${regularCount !== 1 ? 'es' : ''}${examCount > 0 ? ` + ${examCount} exam${examCount !== 1 ? 's' : ''}` : ''}`, 50)

    // Footer
    doc.moveDown(2)
    doc.strokeColor('#e5e7eb').lineWidth(1)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()
    doc.moveDown(0.5)

    doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
    doc.text(`${SCHOOL_INFO.nameFr} / ${SCHOOL_INFO.name}`, { align: 'center' })
    doc.text(`Certificate: ${SCHOOL_INFO.certificateNumber} | Phone: ${SCHOOL_INFO.phone} | Instructor: ${SCHOOL_INFO.teacherName}`, { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(8).text(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, { align: 'center' })

    doc.end()

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
    })

    const dateStr = new Date().toISOString().split('T')[0]
    const safeName = studentName.replace(/[^a-z0-9]/gi, '-')
    const filename = `Truck-Schedule-${safeName}-${dateStr}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Truck schedule PDF error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
