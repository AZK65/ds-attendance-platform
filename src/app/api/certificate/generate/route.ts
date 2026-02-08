import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import bwipjs from 'bwip-js'

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
  attestationNumber: string
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

// Generate Code 128 barcode as PNG buffer
async function generateCode128Barcode(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer({
      bcid: 'code128',
      text: text,
      scale: 3,
      height: 12,
      includetext: false,
      textxalign: 'center',
    }, (err: Error | string, png: Buffer) => {
      if (err) {
        reject(err)
      } else {
        resolve(png)
      }
    })
  })
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

    // Helper to check a checkbox
    const setCheckbox = (fieldName: string, checked: boolean = true) => {
      if (!checked) return
      try {
        const field = form.getCheckBox(fieldName)
        field.check()
        successfulFields.push(fieldName)
        console.log('✓ Checked "' + fieldName + '"')
      } catch {
        // Field not found
      }
    }

    // Try multiple field name variations
    const trySetField = (variations: string[], value: string) => {
      if (!value) return
      for (const fieldName of variations) {
        try {
          const field = form.getTextField(fieldName)
          field.setText(value)
          successfulFields.push(fieldName)
          console.log('✓ Set "' + fieldName + '" = "' + value + '"')
          return // Success, stop trying
        } catch {
          // Continue to next variation
        }
      }
      console.log('✗ Could not set any of: ' + variations.join(', '))
    }

    // ============================================
    // STUDENT IDENTIFICATION - Page 1 & Page 2
    // ============================================

    // Name (Nom, prénom)
    trySetField([
      'Nom prénom', 'Nom, prénom', 'Nom prenom', 'NomPrenom',
      'Nom', 'nom', 'Name', 'name', 'Nom_prenom',
      'Nom prénom_2', 'Nom, prénom_2', 'Nom prenom_2', 'Nom_2'
    ], formData.name)

    // Address
    trySetField([
      'Adresse Numéro rue app', 'Adresse (Numéro, rue, app. )',
      'Adresse', 'adresse', 'Address',
      'Adresse Numéro rue app_2', 'Adresse_2'
    ], formData.address)

    // Municipality
    trySetField([
      'Municipalité', 'Municipalite', 'municipalite', 'Municipality', 'Ville',
      'Municipalité_2', 'Municipalite_2'
    ], formData.municipality)

    // Province
    trySetField(['Province', 'province', 'Province_2'], formData.province)

    // Postal Code
    trySetField([
      'Code postal', 'CodePostal', 'codePostal', 'CP',
      'Code postal_2', 'CodePostal_2'
    ], formData.postalCode)

    // Contract Number
    trySetField([
      'Numéro de contrat', 'Numero de contrat', 'NumeroContrat',
      'Contrat', 'contrat', 'NO_CONTRAT',
      'Numéro de contrat_2', 'Contrat_2'
    ], formData.contractNumber)

    // Phone
    trySetField([
      'Téléphone', 'Telephone', 'telephone', 'Phone', 'Tel',
      'Téléphone_2', 'Telephone_2'
    ], formData.phone)

    // Phone Alt
    trySetField([
      'Téléphone autre', 'Telephone autre', 'PhoneAlt', 'Tel2',
      'Téléphone autre_2'
    ], formData.phoneAlt)

    // Driver's License Number
    trySetField([
      'Numéro de permis', 'Numero de permis', 'NumeroPermis',
      'Permis', 'permis', 'NO_PERMIS', 'LicenceNumber',
      'Numéro de permis 00 0 0 0 0000 01'
    ], formData.licenceNumber)

    // Attestation Number
    trySetField([
      "Numéro d'attestation", "Numero d'attestation", 'NumeroAttestation',
      'Attestation', 'attestation', 'NO_ATTESTATION',
      "Numéro d'attestation_2"
    ], formData.attestationNumber)

    // ============================================
    // PHASE 1 - Modules 1-5 (Page 1)
    // ============================================
    trySetField(['Date1_af_date', 'M1', 'Module1', 'Module 1'], formData.module1Date)
    trySetField(['Date2_af_date', 'M2', 'Module2', 'Module 2'], formData.module2Date)
    trySetField(['Date3_af_date', 'M3', 'Module3', 'Module 3'], formData.module3Date)
    trySetField(['Date4_af_date', 'M4', 'Module4', 'Module 4'], formData.module4Date)
    trySetField(['Date5_af_date', 'M5', 'Module5', 'Module 5'], formData.module5Date)

    // Phase 1 on Page 2 (duplicate)
    trySetField(['Date6_af_date', 'M1_2', 'Module1_2'], formData.module1Date)
    trySetField(['Date7_af_date', 'M2_2', 'Module2_2'], formData.module2Date)
    trySetField(['Date8_af_date', 'M3_2', 'Module3_2'], formData.module3Date)
    trySetField(['Date9_af_date', 'M4_2', 'Module4_2'], formData.module4Date)
    trySetField(['Date10_af_date', 'M5_2', 'Module5_2'], formData.module5Date)

    // ============================================
    // PHASE 2 - Module 6, Sorties 1-4, Module 7
    // ============================================
    trySetField(['Date11_af_date', 'M6', 'Module6', 'Module 6'], formData.module6Date)
    trySetField(['Date12_af_date', 'S1', 'Sortie1', 'Sortie 1'], formData.sortie1Date)
    trySetField(['Date13_af_date', 'S2', 'Sortie2', 'Sortie 2'], formData.sortie2Date)
    trySetField(['Date14_af_date', 'M7', 'Module7', 'Module 7'], formData.module7Date)
    trySetField(['Date15_af_date', 'S3', 'Sortie3', 'Sortie 3'], formData.sortie3Date)
    trySetField(['Date16_af_date', 'S4', 'Sortie4', 'Sortie 4'], formData.sortie4Date)

    // ============================================
    // PHASE 3 - Module 8-10, Sorties 5-10
    // ============================================
    trySetField(['Date17_af_date', 'M8', 'Module8', 'Module 8'], formData.module8Date)
    trySetField(['Date18_af_date', 'S5', 'Sortie5', 'Sortie 5'], formData.sortie5Date)
    trySetField(['Date19_af_date', 'S6', 'Sortie6', 'Sortie 6'], formData.sortie6Date)
    trySetField(['Date20_af_date', 'M9', 'Module9', 'Module 9'], formData.module9Date)
    trySetField(['Date21_af_date', 'S7', 'Sortie7', 'Sortie 7'], formData.sortie7Date)
    trySetField(['Date22_af_date', 'S8', 'Sortie8', 'Sortie 8'], formData.sortie8Date)
    trySetField(['Date23_af_date', 'M10', 'Module10', 'Module 10'], formData.module10Date)
    trySetField(['Date24_af_date', 'S9', 'Sortie9', 'Sortie 9'], formData.sortie9Date)
    trySetField(['Date25_af_date', 'S10', 'Sortie10', 'Sortie 10'], formData.sortie10Date)

    // ============================================
    // PHASE 4 - Module 11-12, Sorties 11-15
    // ============================================
    trySetField(['Date26_af_date', 'M11', 'Module11', 'Module 11'], formData.module11Date)
    trySetField(['Date27_af_date', 'S11', 'Sortie11', 'Sortie 11'], formData.sortie11Date)
    trySetField(['Date28_af_date', 'S12', 'Sortie12', 'Sortie 12'], formData.sortie12Date)
    trySetField(['Date29_af_date', 'S13', 'Sortie13', 'Sortie 13'], formData.sortie13Date)
    trySetField(['Date30_af_date', 'M12', 'Module12', 'Module 12'], formData.module12Date)
    trySetField(['Date31_af_date', 'S14', 'Sortie14', 'Sortie 14'], formData.sortie14Date)
    trySetField(['Date32_af_date', 'S15', 'Sortie15', 'Sortie 15'], formData.sortie15Date)

    // ============================================
    // CHECKBOXES - Réussi/Échoué/Incomplet
    // ============================================
    if (formData.certificateType === 'full') {
      setCheckbox('Réussi')
      setCheckbox('Réussi_2')
      setCheckbox('Réussie')
      setCheckbox('Réussie_2')
      setCheckbox('Reussi')
      setCheckbox('reussi')
    }

    // ============================================
    // BARCODE GENERATION - Code 128
    // ============================================
    if (formData.attestationNumber) {
      try {
        const barcodeBuffer = await generateCode128Barcode(formData.attestationNumber)
        const barcodeImage = await pdfDoc.embedPng(barcodeBuffer)
        const barcodeDims = barcodeImage.scale(0.5)

        const page1 = pdfDoc.getPages()[0]
        const { width: pageWidth } = page1.getSize()

        // Position barcode in top right
        page1.drawImage(barcodeImage, {
          x: pageWidth - barcodeDims.width - 45,
          y: 735,
          width: barcodeDims.width,
          height: barcodeDims.height,
        })

        // Add to page 2 if exists
        if (pdfDoc.getPageCount() > 1) {
          const page2 = pdfDoc.getPages()[1]
          page2.drawImage(barcodeImage, {
            x: pageWidth - barcodeDims.width - 45,
            y: 735,
            width: barcodeDims.width,
            height: barcodeDims.height,
          })
        }

        console.log('✓ Generated Code 128 barcode for: ' + formData.attestationNumber)
      } catch (barcodeError) {
        console.error('Failed to generate barcode:', barcodeError)
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
