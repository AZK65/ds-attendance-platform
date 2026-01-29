import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

interface CertificateFormData {
  name: string
  address: string
  municipality: string
  province: string
  postalCode: string
  contractNumber: string
  phone: string
  phoneAlt: string
  licenceNumber: string
  module1Date: string
  module2Date: string
  module3Date: string
  module4Date: string
  module5Date: string
  module6Date: string
  sortie1Date: string
  sortie2Date: string
  module7Date: string
  sortie3Date: string
  sortie4Date: string
  module8Date: string
  sortie5Date: string
  sortie6Date: string
  module9Date: string
  sortie7Date: string
  sortie8Date: string
  module10Date: string
  sortie9Date: string
  sortie10Date: string
  module11Date: string
  sortie11Date: string
  sortie12Date: string
  sortie13Date: string
  module12Date: string
  sortie14Date: string
  sortie15Date: string
  certificateType: 'phase1' | 'full'
}

// Helper to format date from YYYY-MM-DD to display format
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return dateStr // Keep YYYY-MM-DD format for the certificate
}

export async function POST(request: NextRequest) {
  try {
    const formData: CertificateFormData = await request.json()

    // Load the template PDF
    const templatePath = path.join(process.cwd(), 'driving-certificate-6890-filled.pdf')

    let pdfDoc: PDFDocument

    if (fs.existsSync(templatePath)) {
      // Load existing template
      const templateBytes = fs.readFileSync(templatePath)
      pdfDoc = await PDFDocument.load(templateBytes)
    } else {
      // Create new PDF if template not found
      pdfDoc = await PDFDocument.create()
    }

    // Get the font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Choose which page to work with based on certificate type
    const pageIndex = formData.certificateType === 'phase1' ? 0 : 1

    // Make sure we have the page, or create it
    while (pdfDoc.getPageCount() <= pageIndex) {
      pdfDoc.addPage()
    }

    const page = pdfDoc.getPage(pageIndex)
    const { height } = page.getSize()

    // Define text color
    const textColor = rgb(0, 0.25, 0.53) // Blue color matching the template

    // Clear areas and add new text
    // Student Information Section (positions based on template layout)
    // Note: PDF coordinates start from bottom-left, so we need to flip Y

    // Name field - approximately at y=680 from bottom on the template
    const nameY = height - 145
    page.drawText(formData.name, {
      x: 42,
      y: nameY,
      size: 11,
      font: font,
      color: textColor,
    })

    // Address field
    const addressY = height - 173
    page.drawText(formData.address, {
      x: 42,
      y: addressY,
      size: 11,
      font: font,
      color: textColor,
    })

    // Municipality
    const cityY = height - 203
    page.drawText(formData.municipality, {
      x: 42,
      y: cityY,
      size: 11,
      font: font,
      color: textColor,
    })

    // Province
    page.drawText(formData.province, {
      x: 280,
      y: cityY,
      size: 11,
      font: font,
      color: textColor,
    })

    // Postal Code
    page.drawText(formData.postalCode, {
      x: 395,
      y: cityY,
      size: 11,
      font: font,
      color: textColor,
    })

    // Contract Number (split into boxes)
    const contractY = height - 232
    const contractNum = formData.contractNumber.padStart(3, ' ')
    for (let i = 0; i < Math.min(contractNum.length, 8); i++) {
      page.drawText(contractNum[i] || '', {
        x: 55 + (i * 15),
        y: contractY,
        size: 11,
        font: font,
        color: textColor,
      })
    }

    // Phone
    page.drawText(formData.phone, {
      x: 178,
      y: contractY,
      size: 11,
      font: font,
      color: textColor,
    })

    // License Number (for full certificate - page 2)
    if (formData.certificateType === 'full' && formData.licenceNumber) {
      const licenceY = height - 87
      // Split licence number for individual boxes
      const licNum = formData.licenceNumber.replace(/\s/g, '')
      for (let i = 0; i < Math.min(licNum.length, 13); i++) {
        page.drawText(licNum[i] || '', {
          x: 190 + (i * 15.5),
          y: licenceY,
          size: 11,
          font: boldFont,
          color: textColor,
        })
      }
    }

    // Phase 1 module dates
    const phase1StartY = formData.certificateType === 'phase1' ? height - 520 : height - 467
    const phase1Dates = [
      formData.module1Date,
      formData.module2Date,
      formData.module3Date,
      formData.module4Date,
      formData.module5Date,
    ]

    phase1Dates.forEach((date, index) => {
      if (date) {
        page.drawText(formatDate(date), {
          x: formData.certificateType === 'phase1' ? 90 : 72,
          y: phase1StartY - (index * 16),
          size: 9,
          font: font,
          color: textColor,
        })
      }
    })

    // For full certificate, add all other phases
    if (formData.certificateType === 'full') {
      // Phase 2 dates
      const phase2Data = [
        { date: formData.module6Date, label: 'Module 6' },
        { date: formData.sortie1Date, label: 'Sortie 1' },
        { date: formData.sortie2Date, label: 'Sortie 2' },
        { date: formData.module7Date, label: 'Module 7' },
        { date: formData.sortie3Date, label: 'Sortie 3' },
        { date: formData.sortie4Date, label: 'Sortie 4' },
      ]

      const phase2StartY = height - 546
      phase2Data.forEach((item, index) => {
        if (item.date) {
          page.drawText(formatDate(item.date), {
            x: 72,
            y: phase2StartY - (index * 14),
            size: 9,
            font: font,
            color: textColor,
          })
        }
      })

      // Phase 3 dates
      const phase3Data = [
        formData.module8Date,
        formData.sortie5Date,
        formData.sortie6Date,
        formData.module9Date,
        formData.sortie7Date,
        formData.sortie8Date,
        formData.module10Date,
        formData.sortie9Date,
        formData.sortie10Date,
      ]

      const phase3StartY = height - 546
      phase3Data.forEach((date, index) => {
        if (date) {
          page.drawText(formatDate(date), {
            x: 240,
            y: phase3StartY - (index * 14),
            size: 9,
            font: font,
            color: textColor,
          })
        }
      })

      // Phase 4 dates
      const phase4Data = [
        formData.module11Date,
        formData.sortie11Date,
        formData.sortie12Date,
        formData.sortie13Date,
        formData.module12Date,
        formData.sortie14Date,
        formData.sortie15Date,
      ]

      const phase4StartY = height - 546
      phase4Data.forEach((date, index) => {
        if (date) {
          page.drawText(formatDate(date), {
            x: 408,
            y: phase4StartY - (index * 14),
            size: 9,
            font: font,
            color: textColor,
          })
        }
      })
    }

    // Serialize the PDF
    const pdfBytes = await pdfDoc.save()

    // Return the PDF
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificate-${formData.name || 'student'}.pdf"`,
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
