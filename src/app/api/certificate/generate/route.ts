import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb } from 'pdf-lib'
import bwipjs from 'bwip-js'

interface CertificateFormData {
  name: string
  address: string
  municipality: string
  province: string
  postalCode: string
  contractNumber: string
  attestationNumber: string
  phone: string
  phoneAlt: string
  licenceNumber: string
  registrationDate: string
  expiryDate: string
  // School info from settings
  schoolName: string
  schoolAddress: string
  schoolCity: string
  schoolProvince: string
  schoolPostalCode: string
  schoolNumber: string
  // Dates
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
  templatePdf: string
}

export async function POST(request: NextRequest) {
  try {
    const formData: CertificateFormData = await request.json()
    console.log('=== GENERATE INPUT ===')
    console.log('licenceNumber:', JSON.stringify(formData.licenceNumber))
    console.log('registrationDate:', JSON.stringify(formData.registrationDate))
    console.log('expiryDate:', JSON.stringify(formData.expiryDate))
    console.log('name:', JSON.stringify(formData.name))

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

    // Get all field names for debugging
    const fields = form.getFields()
    const fieldNames = fields.map(f => f.getName())
    console.log('=== ALL PDF FORM FIELDS ===')
    fieldNames.forEach(name => console.log('  "' + name + '"'))
    console.log('=== Total: ' + fieldNames.length + ' fields ===')

    // Track which fields were successfully set
    const successfulFields: string[] = []

    // Helper to check a checkbox - tries multiple variations
    const setCheckbox = (variations: string[], checked: boolean = true) => {
      if (!checked) return
      for (const fieldName of variations) {
        try {
          const field = form.getCheckBox(fieldName)
          field.check()
          successfulFields.push(fieldName)
          console.log('✓ Checked "' + fieldName + '"')
        } catch {
          // Field not found
        }
      }
    }

    // Try multiple field name variations - sets ALL matching fields (for multi-page PDFs)
    const trySetField = (variations: string[], value: string) => {
      if (!value) return
      for (const fieldName of variations) {
        try {
          const field = form.getTextField(fieldName)
          field.setText(value)
          successfulFields.push(fieldName)
          console.log('✓ Set "' + fieldName + '" = "' + value + '"')
        } catch {
          // Continue to next variation
        }
      }
    }

    // ============================================
    // STUDENT IDENTIFICATION - Page 1 & Page 2
    // Page 2 fields use #1 suffix (e.g. "Nom prénom#1")
    // ============================================

    // Name - Page 1: "Nom prénom", Page 2: "Nom prénom#1"
    trySetField(['Nom prénom', 'Nom prénom#1'], formData.name)

    // Address - Page 1: "Adresse", Page 2: "Adresse#1"
    trySetField(['Adresse', 'Adresse#1'], formData.address)

    // Municipality - Page 1: "Municipalité", Page 2: "Municipalité#1"
    trySetField(['Municipalité', 'Municipalité#1'], formData.municipality)

    // Province - Page 1: "Province", Page 2: "Province#1"
    trySetField(['Province', 'Province#1'], formData.province)

    // Postal Code - Page 1: "Code Postal", Page 2: "Code Postal#1"
    trySetField(['Code Postal', 'Code Postal#1'], formData.postalCode)

    // Contract Number - Page 1: "Numéro de contrat", Page 2: "Numéro de contrat#1"
    trySetField(['Numéro de contrat', 'Numéro de contrat#1'], formData.contractNumber)

    // Phone - Page 1: "Téléphone", Page 2: "Téléphone#1"
    trySetField(['Téléphone', 'Téléphone#1'], formData.phone)

    // Phone Alt - Page 1: "Téléphone autre"
    trySetField(['Téléphone autre'], formData.phoneAlt)

    // Driver's License Number - Page 2: "Numero de Permis"
    // (not detected by pdf-lib on page 1, but exists on page 2)
    trySetField(['Numero de Permis'], formData.licenceNumber)

    // Registration Date - "Date5_af_date"
    trySetField(['Date5_af_date'], formData.registrationDate)

    // Expiry Date - "Date6_af_date"
    trySetField(['Date6_af_date'], formData.expiryDate)

    // Attestation Number - Page 1: "Numer D'Attestation", Page 2: "Numer D'Attestation#1"
    trySetField(["Numer D'Attestation", "Numer D'Attestation#1"], formData.attestationNumber)

    // ============================================
    // SCHOOL INFORMATION
    // ============================================
    trySetField(["Nom de lécole"], formData.schoolName)
    trySetField(['Address Ecole'], formData.schoolAddress)
    trySetField(["Numero de L'Ecole"], formData.schoolNumber)
    trySetField(['Municipalite Ecole'], formData.schoolCity)
    trySetField(['Province Ecole'], formData.schoolProvince)
    trySetField(['Code Postal Ecole'], formData.schoolPostalCode)
    // Teacher name on both pages
    trySetField(['Nom de la personne responsable'], 'Fayyaz Qazi')
    trySetField(['Nom de la personne responsable_3'], 'Fayyaz Qazi')

    // Signature dates - set to today's date (DD/MM/YYYY)
    const today = new Date()
    const signatureDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
    trySetField(['Date11_af_date'], signatureDate)
    trySetField(['Date12_af_date'], signatureDate)

    // ============================================
    // PHASE 1 - Modules 1-5
    // Exact fields: "Date7_af_date.0" through "Date7_af_date.4"
    // ============================================
    trySetField(['Date7_af_date.0'], formData.module1Date)
    trySetField(['Date7_af_date.1'], formData.module2Date)
    trySetField(['Date7_af_date.2'], formData.module3Date)
    trySetField(['Date7_af_date.3'], formData.module4Date)
    trySetField(['Date7_af_date.4'], formData.module5Date)

    // ============================================
    // PHASE 2 - Module 6, Sorties 1-4, Module 7
    // Exact fields: "Date8_af_date.0" through "Date8_af_date.5"
    // ============================================
    trySetField(['Date8_af_date.0'], formData.module6Date)
    trySetField(['Date8_af_date.1'], formData.sortie1Date)
    trySetField(['Date8_af_date.2'], formData.sortie2Date)
    trySetField(['Date8_af_date.3'], formData.module7Date)
    trySetField(['Date8_af_date.4'], formData.sortie3Date)
    trySetField(['Date8_af_date.5'], formData.sortie4Date)

    // ============================================
    // PHASE 3 - Module 8-10, Sorties 5-10
    // Exact fields: "Date9_af_date.0" through "Date9_af_date.8"
    // ============================================
    trySetField(['Date9_af_date.0'], formData.module8Date)
    trySetField(['Date9_af_date.1'], formData.sortie5Date)
    trySetField(['Date9_af_date.2'], formData.sortie6Date)
    trySetField(['Date9_af_date.3'], formData.module9Date)
    trySetField(['Date9_af_date.4'], formData.sortie7Date)
    trySetField(['Date9_af_date.5'], formData.sortie8Date)
    trySetField(['Date9_af_date.6'], formData.module10Date)
    trySetField(['Date9_af_date.7'], formData.sortie9Date)
    trySetField(['Date9_af_date.8'], formData.sortie10Date)

    // ============================================
    // PHASE 4 - Module 11-12, Sorties 11-15
    // Exact fields: "Date10_af_date.0" through "Date10_af_date.6"
    // ============================================
    trySetField(['Date10_af_date.0'], formData.module11Date)
    trySetField(['Date10_af_date.1'], formData.sortie11Date)
    trySetField(['Date10_af_date.2'], formData.sortie12Date)
    trySetField(['Date10_af_date.3'], formData.sortie13Date)
    trySetField(['Date10_af_date.4'], formData.module12Date)
    trySetField(['Date10_af_date.5'], formData.sortie14Date)
    trySetField(['Date10_af_date.6'], formData.sortie15Date)

    // ============================================
    // CHECKBOXES - Réussi on both pages
    // ============================================
    if (formData.certificateType === 'full') {
      setCheckbox(['Réussi'])
      setCheckbox(['Réussi_2'])
    }

    // ============================================
    // BARCODE GENERATION - Code 128
    // Generates barcode from attestation number and overlays on both pages
    // ============================================
    if (formData.attestationNumber) {
      try {
        // Strip spaces from the formatted attestation number to get raw digits
        const rawAttestation = formData.attestationNumber.replace(/\s+/g, '')
        console.log('Generating barcode for attestation: "' + rawAttestation + '"')

        // Generate barcode as PNG using bwip-js
        const barcodeBuffer = await bwipjs.toBuffer({
          bcid: 'code128',
          text: rawAttestation,
          scale: 3,
          height: 10,
          includetext: false,
        })

        // Embed barcode image in the PDF
        const barcodeImage = await pdfDoc.embedPng(barcodeBuffer)
        const pages = pdfDoc.getPages()

        // Barcode dimensions and positions (from the existing template)
        // Page 1: position (470, 695), size 100x38
        // Page 2: position (480.84, 690.69), size 100x38
        const barcodeWidth = 100
        const barcodeHeight = 38

        // Draw white rectangle to cover old barcode, then draw new barcode on Page 1
        if (pages.length >= 1) {
          const page1 = pages[0]
          page1.drawRectangle({
            x: 468,
            y: 693,
            width: barcodeWidth + 4,
            height: barcodeHeight + 4,
            color: rgb(1, 1, 1),
          })
          page1.drawImage(barcodeImage, {
            x: 470,
            y: 695,
            width: barcodeWidth,
            height: barcodeHeight,
          })
          console.log('✓ Barcode drawn on page 1')
        }

        // Draw on Page 2
        if (pages.length >= 2) {
          const page2 = pages[1]
          page2.drawRectangle({
            x: 478.84,
            y: 688.69,
            width: barcodeWidth + 4,
            height: barcodeHeight + 4,
            color: rgb(1, 1, 1),
          })
          page2.drawImage(barcodeImage, {
            x: 480.84,
            y: 690.69,
            width: barcodeWidth,
            height: barcodeHeight,
          })
          console.log('✓ Barcode drawn on page 2')
        }

        successfulFields.push('BARCODE')
      } catch (barcodeError) {
        console.error('Barcode generation failed:', barcodeError)
        // Continue without barcode - don't fail the whole PDF
      }
    }

    console.log('\n=== SUMMARY ===')
    console.log('Successfully set: ' + successfulFields.length + ' fields')
    console.log('=== END ===\n')

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="certificate-' + (formData.name || 'student') + '.pdf"',
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
