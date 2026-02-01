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

    // Get all field names for smart matching
    const fields = form.getFields()
    const fieldNames = fields.map(f => f.getName())
    console.log('=== ALL PDF FORM FIELDS ===')
    fieldNames.forEach(name => console.log(`  "${name}"`))
    console.log(`=== Total: ${fieldNames.length} fields ===`)

    // Track which fields were successfully set
    const successfulFields: string[] = []

    // Smart field setter - tries multiple variations and page suffixes
    const setFieldSmart = (baseNames: string[], value: string) => {
      if (!value) return

      // Suffixes to try for multi-page PDFs
      const suffixes = ['', '_2', '2', ' 2', '_p2', '_page2']

      for (const baseName of baseNames) {
        for (const suffix of suffixes) {
          const fieldName = baseName + suffix
          try {
            const field = form.getTextField(fieldName)
            field.setText(value)
            successfulFields.push(fieldName)
            console.log(`✓ Set "${fieldName}" = "${value}"`)
          } catch (e) {
            // Field not found - continue trying
          }
        }
      }
    }

    // Helper function to check a checkbox with variations
    const setCheckboxSmart = (baseNames: string[], checked: boolean) => {
      if (!checked) return

      const suffixes = ['', '_2', '2', ' 2', '_p2', '_page2']

      for (const baseName of baseNames) {
        for (const suffix of suffixes) {
          const fieldName = baseName + suffix
          try {
            const field = form.getCheckBox(fieldName)
            field.check()
            successfulFields.push(fieldName)
            console.log(`✓ Checked "${fieldName}"`)
          } catch (e) {
            // Checkbox not found - continue trying
          }
        }
      }
    }

    // Student Information
    setFieldSmart(['Nom', 'nom', 'Name', 'name', 'NOM_ELEVE', 'Nom_eleve', 'NomEleve', 'Nom prenom', 'Nom, prénom'], formData.name)
    setFieldSmart(['Adresse', 'adresse', 'Address', 'address', 'ADRESSE_ELEVE', 'AdresseEleve'], formData.address)
    setFieldSmart(['Municipalite', 'municipalite', 'Municipality', 'Ville', 'ville', 'City', 'Municipalité'], formData.municipality)
    setFieldSmart(['Province', 'province'], formData.province)
    setFieldSmart(['CodePostal', 'codePostal', 'Code_postal', 'PostalCode', 'CP', 'Code postal'], formData.postalCode)
    setFieldSmart(['Contrat', 'contrat', 'NumeroContrat', 'Contract', 'NO_CONTRAT', 'NoContrat', 'Numero de contrat', 'Numéro de contrat'], formData.contractNumber)
    setFieldSmart(['Telephone', 'telephone', 'Phone', 'Tel', 'TEL', 'Téléphone'], formData.phone)

    // Driver's Licence Number
    console.log(`Attempting to set licence number: "${formData.licenceNumber}"`)
    const permisFields = fieldNames.filter(name => name.toLowerCase().includes('permis'))
    console.log('Fields containing "permis":', permisFields)

    setFieldSmart([
      'Numero de Permis', 'Numéro de permis', 'Numero de permis', 'Numéro de Permis',
      'NumeroDePermis', 'numero_de_permis', 'Permis', 'permis', 'NumeroPermis',
      'NO_PERMIS', 'NoPermis', 'PermisConduire', 'permis_conduire', 'PERMIS',
      'LicenceNumber', 'DriverLicence', 'DL', 'NPermis', 'No_permis'
    ], formData.licenceNumber)

    // Phase 1 dates (modules 1-5)
    setFieldSmart(['M1', 'Module1', 'module1', 'DATE_M1', 'Module 1'], formData.module1Date)
    setFieldSmart(['M2', 'Module2', 'module2', 'DATE_M2', 'Module 2'], formData.module2Date)
    setFieldSmart(['M3', 'Module3', 'module3', 'DATE_M3', 'Module 3'], formData.module3Date)
    setFieldSmart(['M4', 'Module4', 'module4', 'DATE_M4', 'Module 4'], formData.module4Date)
    setFieldSmart(['M5', 'Module5', 'module5', 'DATE_M5', 'Module 5'], formData.module5Date)

    // Phase 2 dates
    setFieldSmart(['M6', 'Module6', 'module6', 'DATE_M6', 'Module 6'], formData.module6Date)
    setFieldSmart(['S1', 'Sortie1', 'sortie1', 'Session1', 'DATE_S1', 'Sortie 1'], formData.sortie1Date)
    setFieldSmart(['S2', 'Sortie2', 'sortie2', 'Session2', 'DATE_S2', 'Sortie 2'], formData.sortie2Date)
    setFieldSmart(['M7', 'Module7', 'module7', 'DATE_M7', 'Module 7'], formData.module7Date)
    setFieldSmart(['S3', 'Sortie3', 'sortie3', 'Session3', 'DATE_S3', 'Sortie 3'], formData.sortie3Date)
    setFieldSmart(['S4', 'Sortie4', 'sortie4', 'Session4', 'DATE_S4', 'Sortie 4'], formData.sortie4Date)

    // Phase 3 dates
    setFieldSmart(['M8', 'Module8', 'module8', 'DATE_M8', 'Module 8'], formData.module8Date)
    setFieldSmart(['S5', 'Sortie5', 'sortie5', 'Session5', 'DATE_S5', 'Sortie 5'], formData.sortie5Date)
    setFieldSmart(['S6', 'Sortie6', 'sortie6', 'Session6', 'DATE_S6', 'Sortie 6'], formData.sortie6Date)
    setFieldSmart(['M9', 'Module9', 'module9', 'DATE_M9', 'Module 9'], formData.module9Date)
    setFieldSmart(['S7', 'Sortie7', 'sortie7', 'Session7', 'DATE_S7', 'Sortie 7'], formData.sortie7Date)
    setFieldSmart(['S8', 'Sortie8', 'sortie8', 'Session8', 'DATE_S8', 'Sortie 8'], formData.sortie8Date)
    setFieldSmart(['M10', 'Module10', 'module10', 'DATE_M10', 'Module 10'], formData.module10Date)
    setFieldSmart(['S9', 'Sortie9', 'sortie9', 'Session9', 'DATE_S9', 'Sortie 9'], formData.sortie9Date)
    setFieldSmart(['S10', 'Sortie10', 'sortie10', 'Session10', 'DATE_S10', 'Sortie 10'], formData.sortie10Date)

    // Phase 4 dates
    setFieldSmart(['M11', 'Module11', 'module11', 'DATE_M11', 'Module 11'], formData.module11Date)
    setFieldSmart(['S11', 'Sortie11', 'sortie11', 'Session11', 'DATE_S11', 'Sortie 11'], formData.sortie11Date)
    setFieldSmart(['S12', 'Sortie12', 'sortie12', 'Session12', 'DATE_S12', 'Sortie 12'], formData.sortie12Date)
    setFieldSmart(['S13', 'Sortie13', 'sortie13', 'Session13', 'DATE_S13', 'Sortie 13'], formData.sortie13Date)
    setFieldSmart(['M12', 'Module12', 'module12', 'DATE_M12', 'Module 12'], formData.module12Date)
    setFieldSmart(['S14', 'Sortie14', 'sortie14', 'Session14', 'DATE_S14', 'Sortie 14'], formData.sortie14Date)
    setFieldSmart(['S15', 'Sortie15', 'sortie15', 'Session15', 'DATE_S15', 'Sortie 15'], formData.sortie15Date)

    // Check the "Réussi" checkbox for full course
    if (formData.certificateType === 'full') {
      setCheckboxSmart(['Reussi', 'reussi', 'REUSSI', 'Réussi', 'Réussie', 'reussie'], true)
    }

    // Log summary
    console.log('=== FIELDS SUCCESSFULLY SET ===')
    console.log(`Total: ${successfulFields.length}`)
    console.log('Fields:', successfulFields.join(', '))
    console.log('=== END SUMMARY ===')

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
