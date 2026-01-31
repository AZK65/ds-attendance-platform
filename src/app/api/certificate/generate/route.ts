import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'

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
  templatePdf: string  // Base64 encoded PDF from user
}

// Barcode position configuration (adjust these based on your PDF template)
// These values need to be calibrated to match your actual PDF template
const BARCODE_CONFIG = {
  // Position on page 1 where barcode is located (to copy from)
  page1: {
    x: 30,      // X position from left (in points, 72 points = 1 inch)
    y: 30,      // Y position from bottom
    width: 200, // Width of barcode area
    height: 50  // Height of barcode area
  },
  // Position on page 2 where barcode should be copied to (same position)
  page2: {
    x: 30,      // Same X position
    y: 30,      // Same Y position
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData: CertificateFormData = await request.json()

    if (!formData.templatePdf) {
      return NextResponse.json(
        { error: 'No template PDF provided' },
        { status: 400 }
      )
    }

    // Load the user-uploaded PDF template
    const base64Data = formData.templatePdf.replace(/^data:application\/pdf;base64,/, '')
    const templateBytes = Buffer.from(base64Data, 'base64')
    const pdfDoc = await PDFDocument.load(templateBytes)

    // Get the form from the PDF
    const form = pdfDoc.getForm()

    // Log all field names for debugging
    const fields = form.getFields()
    console.log('PDF form fields found:', fields.map(f => `${f.getName()} (${f.constructor.name})`).join(', '))

    // Helper function to safely set text field
    const setTextField = (fieldName: string, value: string) => {
      if (!value) return
      try {
        const field = form.getTextField(fieldName)
        field.setText(value)
        console.log(`Set field "${fieldName}" to "${value}"`)
      } catch (e) {
        // Field not found - this is expected for fields that don't exist in the PDF
      }
    }

    // Helper function to check a checkbox
    const setCheckbox = (fieldName: string, checked: boolean) => {
      if (!checked) return
      try {
        const field = form.getCheckBox(fieldName)
        if (checked) {
          field.check()
        } else {
          field.uncheck()
        }
      } catch (e) {
        // Checkbox not found
      }
    }

    // Student Information - try multiple field name variations
    setTextField('Nom', formData.name)
    setTextField('nom', formData.name)
    setTextField('Name', formData.name)
    setTextField('name', formData.name)
    setTextField('NOM_ELEVE', formData.name)
    setTextField('Nom_eleve', formData.name)
    setTextField('NomEleve', formData.name)

    setTextField('Adresse', formData.address)
    setTextField('adresse', formData.address)
    setTextField('Address', formData.address)
    setTextField('address', formData.address)
    setTextField('ADRESSE_ELEVE', formData.address)
    setTextField('AdresseEleve', formData.address)

    setTextField('Municipalite', formData.municipality)
    setTextField('municipalite', formData.municipality)
    setTextField('Municipality', formData.municipality)
    setTextField('Ville', formData.municipality)
    setTextField('ville', formData.municipality)
    setTextField('City', formData.municipality)

    setTextField('Province', formData.province)
    setTextField('province', formData.province)

    setTextField('CodePostal', formData.postalCode)
    setTextField('codePostal', formData.postalCode)
    setTextField('Code_postal', formData.postalCode)
    setTextField('PostalCode', formData.postalCode)
    setTextField('CP', formData.postalCode)

    setTextField('Contrat', formData.contractNumber)
    setTextField('contrat', formData.contractNumber)
    setTextField('NumeroContrat', formData.contractNumber)
    setTextField('Contract', formData.contractNumber)
    setTextField('NO_CONTRAT', formData.contractNumber)
    setTextField('NoContrat', formData.contractNumber)

    setTextField('Telephone', formData.phone)
    setTextField('telephone', formData.phone)
    setTextField('Phone', formData.phone)
    setTextField('Tel', formData.phone)
    setTextField('TEL', formData.phone)

    // Driver's Licence Number - try ALL possible field name variations
    console.log(`Attempting to set licence number: "${formData.licenceNumber}"`)
    setTextField('Permis', formData.licenceNumber)
    setTextField('permis', formData.licenceNumber)
    setTextField('NumeroPermis', formData.licenceNumber)
    setTextField('Licence', formData.licenceNumber)
    setTextField('licence', formData.licenceNumber)
    setTextField('NO_PERMIS', formData.licenceNumber)
    setTextField('NoPermis', formData.licenceNumber)
    setTextField('PermisConduire', formData.licenceNumber)
    setTextField('permis_conduire', formData.licenceNumber)
    setTextField('PERMIS', formData.licenceNumber)
    setTextField('LicenceNumber', formData.licenceNumber)
    setTextField('DriverLicence', formData.licenceNumber)
    setTextField('DL', formData.licenceNumber)
    setTextField('NPermis', formData.licenceNumber)
    setTextField('No_permis', formData.licenceNumber)

    // Phase 1 dates
    setTextField('M1', formData.module1Date)
    setTextField('Module1', formData.module1Date)
    setTextField('module1', formData.module1Date)
    setTextField('DATE_M1', formData.module1Date)

    setTextField('M2', formData.module2Date)
    setTextField('Module2', formData.module2Date)
    setTextField('module2', formData.module2Date)
    setTextField('DATE_M2', formData.module2Date)

    setTextField('M3', formData.module3Date)
    setTextField('Module3', formData.module3Date)
    setTextField('module3', formData.module3Date)
    setTextField('DATE_M3', formData.module3Date)

    setTextField('M4', formData.module4Date)
    setTextField('Module4', formData.module4Date)
    setTextField('module4', formData.module4Date)
    setTextField('DATE_M4', formData.module4Date)

    setTextField('M5', formData.module5Date)
    setTextField('Module5', formData.module5Date)
    setTextField('module5', formData.module5Date)
    setTextField('DATE_M5', formData.module5Date)

    // Phase 2 dates
    setTextField('M6', formData.module6Date)
    setTextField('Module6', formData.module6Date)
    setTextField('DATE_M6', formData.module6Date)

    setTextField('S1', formData.sortie1Date)
    setTextField('Sortie1', formData.sortie1Date)
    setTextField('Session1', formData.sortie1Date)
    setTextField('DATE_S1', formData.sortie1Date)

    setTextField('S2', formData.sortie2Date)
    setTextField('Sortie2', formData.sortie2Date)
    setTextField('Session2', formData.sortie2Date)
    setTextField('DATE_S2', formData.sortie2Date)

    setTextField('M7', formData.module7Date)
    setTextField('Module7', formData.module7Date)
    setTextField('DATE_M7', formData.module7Date)

    setTextField('S3', formData.sortie3Date)
    setTextField('Sortie3', formData.sortie3Date)
    setTextField('Session3', formData.sortie3Date)
    setTextField('DATE_S3', formData.sortie3Date)

    setTextField('S4', formData.sortie4Date)
    setTextField('Sortie4', formData.sortie4Date)
    setTextField('Session4', formData.sortie4Date)
    setTextField('DATE_S4', formData.sortie4Date)

    // Phase 3 dates
    setTextField('M8', formData.module8Date)
    setTextField('Module8', formData.module8Date)
    setTextField('DATE_M8', formData.module8Date)

    setTextField('S5', formData.sortie5Date)
    setTextField('Sortie5', formData.sortie5Date)
    setTextField('Session5', formData.sortie5Date)
    setTextField('DATE_S5', formData.sortie5Date)

    setTextField('S6', formData.sortie6Date)
    setTextField('Sortie6', formData.sortie6Date)
    setTextField('Session6', formData.sortie6Date)
    setTextField('DATE_S6', formData.sortie6Date)

    setTextField('M9', formData.module9Date)
    setTextField('Module9', formData.module9Date)
    setTextField('DATE_M9', formData.module9Date)

    setTextField('S7', formData.sortie7Date)
    setTextField('Sortie7', formData.sortie7Date)
    setTextField('Session7', formData.sortie7Date)
    setTextField('DATE_S7', formData.sortie7Date)

    setTextField('S8', formData.sortie8Date)
    setTextField('Sortie8', formData.sortie8Date)
    setTextField('Session8', formData.sortie8Date)
    setTextField('DATE_S8', formData.sortie8Date)

    setTextField('M10', formData.module10Date)
    setTextField('Module10', formData.module10Date)
    setTextField('DATE_M10', formData.module10Date)

    setTextField('S9', formData.sortie9Date)
    setTextField('Sortie9', formData.sortie9Date)
    setTextField('Session9', formData.sortie9Date)
    setTextField('DATE_S9', formData.sortie9Date)

    setTextField('S10', formData.sortie10Date)
    setTextField('Sortie10', formData.sortie10Date)
    setTextField('Session10', formData.sortie10Date)
    setTextField('DATE_S10', formData.sortie10Date)

    // Phase 4 dates
    setTextField('M11', formData.module11Date)
    setTextField('Module11', formData.module11Date)
    setTextField('DATE_M11', formData.module11Date)

    setTextField('S11', formData.sortie11Date)
    setTextField('Sortie11', formData.sortie11Date)
    setTextField('Session11', formData.sortie11Date)
    setTextField('DATE_S11', formData.sortie11Date)

    setTextField('S12', formData.sortie12Date)
    setTextField('Sortie12', formData.sortie12Date)
    setTextField('Session12', formData.sortie12Date)
    setTextField('DATE_S12', formData.sortie12Date)

    setTextField('S13', formData.sortie13Date)
    setTextField('Sortie13', formData.sortie13Date)
    setTextField('Session13', formData.sortie13Date)
    setTextField('DATE_S13', formData.sortie13Date)

    setTextField('M12', formData.module12Date)
    setTextField('Module12', formData.module12Date)
    setTextField('DATE_M12', formData.module12Date)

    setTextField('S14', formData.sortie14Date)
    setTextField('Sortie14', formData.sortie14Date)
    setTextField('Session14', formData.sortie14Date)
    setTextField('DATE_S14', formData.sortie14Date)

    setTextField('S15', formData.sortie15Date)
    setTextField('Sortie15', formData.sortie15Date)
    setTextField('Session15', formData.sortie15Date)
    setTextField('DATE_S15', formData.sortie15Date)

    // Check the "Réussi" checkbox for full course
    if (formData.certificateType === 'full') {
      setCheckbox('Reussi', true)
      setCheckbox('reussi', true)
      setCheckbox('REUSSI', true)
      setCheckbox('Réussi', true)
    }

    // Get pages for barcode copy
    const pages = pdfDoc.getPages()
    const page2 = pages.length > 1 ? pages[1] : null

    // Copy barcode from page 1 to page 2 if page 2 exists
    if (page2) {
      try {
        console.log('Copying barcode from page 1 to page 2...')

        // Save current state to create a snapshot for embedding
        const tempPdfBytes = await pdfDoc.save()
        const tempPdfDoc = await PDFDocument.load(tempPdfBytes)

        // Embed the barcode region from page 1
        const [embeddedPage1] = await pdfDoc.embedPages([tempPdfDoc.getPages()[0]], [{
          left: BARCODE_CONFIG.page1.x,
          bottom: BARCODE_CONFIG.page1.y,
          right: BARCODE_CONFIG.page1.x + BARCODE_CONFIG.page1.width,
          top: BARCODE_CONFIG.page1.y + BARCODE_CONFIG.page1.height,
        }])

        // Draw the barcode region on page 2 at the same position
        page2.drawPage(embeddedPage1, {
          x: BARCODE_CONFIG.page2.x,
          y: BARCODE_CONFIG.page2.y,
          width: BARCODE_CONFIG.page1.width,
          height: BARCODE_CONFIG.page1.height,
        })

        console.log('Barcode copied to page 2 successfully')
      } catch (barcodeError) {
        console.error('Failed to copy barcode:', barcodeError)
        // Continue without barcode copy - don't fail the whole generation
      }
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
      { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
