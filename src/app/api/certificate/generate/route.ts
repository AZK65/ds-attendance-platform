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
    // ============================================

    // Name (Nom, prénom) - exact field: "Nom prénom"
    trySetField([
      'Nom prénom', 'Nom, prénom', 'Nom prenom', 'NomPrenom',
      'Nom', 'nom', 'Name', 'name', 'Nom_prenom',
      'Nom prénom_2', 'Nom, prénom_2', 'Nom prenom_2', 'Nom_2'
    ], formData.name)

    // Address - exact field: "Adresse"
    trySetField([
      'Adresse', 'Adresse Numéro rue app', 'Adresse (Numéro, rue, app. )',
      'adresse', 'Address',
      'Adresse_2', 'Adresse Numéro rue app_2'
    ], formData.address)

    // Municipality - exact field: "Municipalité"
    trySetField([
      'Municipalité', 'Municipalite', 'municipalite', 'Municipality', 'Ville',
      'Municipalité_2', 'Municipalite_2'
    ], formData.municipality)

    // Province - exact field: "Province"
    trySetField(['Province', 'province', 'Province_2'], formData.province)

    // Postal Code - exact field: "Code Postal"
    trySetField([
      'Code Postal', 'Code postal', 'CodePostal', 'codePostal', 'CP',
      'Code Postal_2', 'Code postal_2', 'CodePostal_2'
    ], formData.postalCode)

    // Contract Number - exact field: "Numéro de contrat"
    trySetField([
      'Numéro de contrat', 'Numero de contrat', 'NumeroContrat',
      'Contrat', 'contrat', 'NO_CONTRAT',
      'Numéro de contrat_2', 'Contrat_2'
    ], formData.contractNumber)

    // Phone - exact field: "Téléphone"
    trySetField([
      'Téléphone', 'Telephone', 'telephone', 'Phone', 'Tel',
      'Téléphone_2', 'Telephone_2'
    ], formData.phone)

    // Phone Alt - exact field: "Téléphone autre"
    trySetField([
      'Téléphone autre', 'Telephone autre', 'PhoneAlt', 'Tel2',
      'Téléphone autre_2'
    ], formData.phoneAlt)

    // Driver's License Number - exact field: "Numero de Permis"
    trySetField([
      'Numero de Permis', 'Numéro de permis', 'Numero de permis', 'Numéro de Permis',
      'NumeroPermis', 'Permis', 'permis', 'NO_PERMIS', 'LicenceNumber',
      'Numéro de permis 00 0 0 0 0000 01'
    ], formData.licenceNumber)

    // Attestation Number - exact field: "Numer D'Attestation"
    trySetField([
      "Numer D'Attestation", "Numer D\u2019Attestation",
      "Numéro d'attestation", "Numero d'attestation", "Numero D'Attestation",
      "Numéro D'Attestation", 'NumeroAttestation',
      'Attestation', 'attestation', 'NO_ATTESTATION',
      "Numéro d'attestation_2"
    ], formData.attestationNumber)

    // ============================================
    // SCHOOL INFORMATION
    // ============================================
    trySetField(["Nom de lécole", "Nom de l'école", "Nom de l\u2019école", "NomEcole", "SchoolName"], formData.schoolName)
    trySetField(['Address Ecole', 'Adresse Ecole', 'Adresse École', 'AdresseEcole', 'SchoolAddress'], formData.schoolAddress)
    trySetField(["Numero de L'Ecole", "Numéro de L'École", "Numero de L\u2019Ecole", "NumeroEcole", "SchoolNumber"], formData.schoolNumber)
    trySetField(['Municipalite Ecole', 'Municipalité École', 'MunicipaliteEcole', 'SchoolCity'], formData.schoolCity)
    trySetField(['Province Ecole', 'Province École', 'ProvinceEcole', 'SchoolProvince'], formData.schoolProvince)
    trySetField(['Code Postal Ecole', 'Code Postal École', 'CodePostalEcole', 'SchoolPostalCode'], formData.schoolPostalCode)
    // Teacher name on both pages
    trySetField(['Nom de la personne responsable', 'NomResponsable', 'TeacherName', 'Responsable'], 'Fayyaz Qazi')
    trySetField(['Nom de la personne responsable_3', 'Nom de la personne responsable_2', 'NomResponsable_2'], 'Fayyaz Qazi')

    // ============================================
    // PHASE 1 - Modules 1-5
    // Exact fields: "Date7_af_date.0" through "Date7_af_date.4"
    // ============================================
    trySetField(['Date7_af_date.0', 'Date1_af_date', 'M1', 'Module1', 'Module 1'], formData.module1Date)
    trySetField(['Date7_af_date.1', 'Date2_af_date', 'M2', 'Module2', 'Module 2'], formData.module2Date)
    trySetField(['Date7_af_date.2', 'Date3_af_date', 'M3', 'Module3', 'Module 3'], formData.module3Date)
    trySetField(['Date7_af_date.3', 'Date4_af_date', 'M4', 'Module4', 'Module 4'], formData.module4Date)
    trySetField(['Date7_af_date.4', 'Date5_af_date', 'M5', 'Module5', 'Module 5'], formData.module5Date)

    // ============================================
    // PHASE 2 - Module 6, Sorties 1-4, Module 7
    // Exact fields: "Date8_af_date.0" through "Date8_af_date.5"
    // ============================================
    trySetField(['Date8_af_date.0', 'Date11_af_date', 'M6', 'Module6', 'Module 6'], formData.module6Date)
    trySetField(['Date8_af_date.1', 'Date12_af_date', 'S1', 'Sortie1', 'Sortie 1'], formData.sortie1Date)
    trySetField(['Date8_af_date.2', 'Date13_af_date', 'S2', 'Sortie2', 'Sortie 2'], formData.sortie2Date)
    trySetField(['Date8_af_date.3', 'Date14_af_date', 'M7', 'Module7', 'Module 7'], formData.module7Date)
    trySetField(['Date8_af_date.4', 'Date15_af_date', 'S3', 'Sortie3', 'Sortie 3'], formData.sortie3Date)
    trySetField(['Date8_af_date.5', 'Date16_af_date', 'S4', 'Sortie4', 'Sortie 4'], formData.sortie4Date)

    // ============================================
    // PHASE 3 - Module 8-10, Sorties 5-10
    // Exact fields: "Date9_af_date.0" through "Date9_af_date.8"
    // ============================================
    trySetField(['Date9_af_date.0', 'Date17_af_date', 'M8', 'Module8', 'Module 8'], formData.module8Date)
    trySetField(['Date9_af_date.1', 'Date18_af_date', 'S5', 'Sortie5', 'Sortie 5'], formData.sortie5Date)
    trySetField(['Date9_af_date.2', 'Date19_af_date', 'S6', 'Sortie6', 'Sortie 6'], formData.sortie6Date)
    trySetField(['Date9_af_date.3', 'Date20_af_date', 'M9', 'Module9', 'Module 9'], formData.module9Date)
    trySetField(['Date9_af_date.4', 'Date21_af_date', 'S7', 'Sortie7', 'Sortie 7'], formData.sortie7Date)
    trySetField(['Date9_af_date.5', 'Date22_af_date', 'S8', 'Sortie8', 'Sortie 8'], formData.sortie8Date)
    trySetField(['Date9_af_date.6', 'Date23_af_date', 'M10', 'Module10', 'Module 10'], formData.module10Date)
    trySetField(['Date9_af_date.7', 'Date24_af_date', 'S9', 'Sortie9', 'Sortie 9'], formData.sortie9Date)
    trySetField(['Date9_af_date.8', 'Date25_af_date', 'S10', 'Sortie10', 'Sortie 10'], formData.sortie10Date)

    // ============================================
    // PHASE 4 - Module 11-12, Sorties 11-15
    // Exact fields: "Date10_af_date.0" through "Date10_af_date.6"
    // ============================================
    trySetField(['Date10_af_date.0', 'Date26_af_date', 'M11', 'Module11', 'Module 11'], formData.module11Date)
    trySetField(['Date10_af_date.1', 'Date27_af_date', 'S11', 'Sortie11', 'Sortie 11'], formData.sortie11Date)
    trySetField(['Date10_af_date.2', 'Date28_af_date', 'S12', 'Sortie12', 'Sortie 12'], formData.sortie12Date)
    trySetField(['Date10_af_date.3', 'Date29_af_date', 'S13', 'Sortie13', 'Sortie 13'], formData.sortie13Date)
    trySetField(['Date10_af_date.4', 'Date30_af_date', 'M12', 'Module12', 'Module 12'], formData.module12Date)
    trySetField(['Date10_af_date.5', 'Date31_af_date', 'S14', 'Sortie14', 'Sortie 14'], formData.sortie14Date)
    trySetField(['Date10_af_date.6', 'Date32_af_date', 'S15', 'Sortie15', 'Sortie 15'], formData.sortie15Date)

    // ============================================
    // CHECKBOXES - Réussi on both pages
    // ============================================
    if (formData.certificateType === 'full') {
      setCheckbox(['Réussi', 'Reussi', 'reussi', 'REUSSI', 'Réussie', 'reussie'])
      setCheckbox(['Réussi_2', 'Reussi_2', 'Réussie_2'])
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
