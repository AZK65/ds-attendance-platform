import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

interface ExtractedData {
  // From licence
  licenceNumber: string
  name: string
  address: string

  // From attendance sheet
  contractNumber: string
  phone: string
  registrationDate: string
  expiryDate: string

  // Phase 1 dates
  module1Date: string
  module2Date: string
  module3Date: string
  module4Date: string
  module5Date: string

  // Phase 2 dates
  module6Date: string
  sortie1Date: string
  sortie2Date: string
  module7Date: string
  sortie3Date: string
  sortie4Date: string

  // Phase 3 dates
  module8Date: string
  sortie5Date: string
  sortie6Date: string
  module9Date: string
  sortie7Date: string
  sortie8Date: string
  module10Date: string
  sortie9Date: string
  sortie10Date: string

  // Phase 4 dates
  module11Date: string
  sortie11Date: string
  sortie12Date: string
  sortie13Date: string
  module12Date: string
  sortie14Date: string
  sortie15Date: string
}

const emptyData: ExtractedData = {
  licenceNumber: '',
  name: '',
  address: '',
  contractNumber: '',
  phone: '',
  registrationDate: '',
  expiryDate: '',
  module1Date: '',
  module2Date: '',
  module3Date: '',
  module4Date: '',
  module5Date: '',
  module6Date: '',
  sortie1Date: '',
  sortie2Date: '',
  module7Date: '',
  sortie3Date: '',
  sortie4Date: '',
  module8Date: '',
  sortie5Date: '',
  sortie6Date: '',
  module9Date: '',
  sortie7Date: '',
  sortie8Date: '',
  module10Date: '',
  sortie9Date: '',
  sortie10Date: '',
  module11Date: '',
  sortie11Date: '',
  sortie12Date: '',
  sortie13Date: '',
  module12Date: '',
  sortie14Date: '',
  sortie15Date: ''
}

function cleanJsonResponse(content: string): string {
  let cleanContent = content.trim()
  if (cleanContent.startsWith('```json')) {
    cleanContent = cleanContent.slice(7)
  }
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.slice(3)
  }
  if (cleanContent.endsWith('```')) {
    cleanContent = cleanContent.slice(0, -3)
  }
  return cleanContent.trim()
}

async function processLicenceImage(licenceImage: string): Promise<Partial<ExtractedData>> {
  console.log('Processing licence image, API key exists:', !!OPENROUTER_API_KEY)
  console.log('Image data length:', licenceImage?.length || 0)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'DS Attendance Platform - Certificate Maker'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an OCR assistant specialized in reading Quebec driver's licenses. Do not think, just extract the data.

Analyze this driver's license image and extract:
1. Driver's Licence Number (Numéro de permis) - Format like "A2536-090400-01" or similar
2. Full Name (Nom complet) - Last name, First name
3. Address (Adresse)

Return ONLY a valid JSON object (no markdown, no code blocks, no explanation):
{
  "licenceNumber": "the licence number exactly as shown",
  "name": "LastName, FirstName",
  "address": "full address"
}

Use empty string for fields you cannot read clearly.`
            },
            {
              type: 'image_url',
              image_url: { url: licenceImage }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Licence OCR failed:', response.status, errorText)
    return {}
  }

  const data = await response.json()
  console.log('Licence OCR response:', JSON.stringify(data).substring(0, 500))
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    console.error('No content in licence OCR response')
    return {}
  }

  try {
    return JSON.parse(cleanJsonResponse(content))
  } catch {
    console.error('Failed to parse licence OCR:', content)
    return {}
  }
}

async function processAttendanceImage(attendanceImage: string): Promise<Partial<ExtractedData>> {
  console.log('Processing attendance image, API key exists:', !!OPENROUTER_API_KEY)
  console.log('Image data length:', attendanceImage?.length || 0)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'DS Attendance Platform - Certificate Maker'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: attendanceImage }
            },
            {
              type: 'text',
              text: `You are an OCR assistant. Extract dates from this HANDWRITTEN driving school attendance sheet.

IMPORTANT: Dates are written as DD/MM/YYYY (day/month/year). Convert to YYYY-MM-DD format.
Example: "16/03/2025" written on paper → output as "2025-03-16" (March 16th)
Example: "02/02/2025" written on paper → output as "2025-02-02" (February 2nd)

The first number is the DAY (01-31), the second number is the MONTH (01-12), the third is the YEAR.

This is a "STUDENT ATTENDANCE SHEET" with:
- Student info: Name, Phone, Contract Number, Class 5 Licence Number, Registration Date, Expiry Date
- PHASE 1: M1, M2, M3, M4, M5 (theory modules)
- PHASE 2: M6, In-Car Sessions 1-4, M7
- PHASE 3: M8, Sessions 5-6, M9, Sessions 7-8, M10, Sessions 9-10
- PHASE 4: M11, Sessions 11-13, M12, Sessions 14-15

Return ONLY valid JSON:
{
  "name": "student name",
  "contractNumber": "contract number",
  "phone": "phone number",
  "licenceNumber": "licence number",
  "registrationDate": "YYYY-MM-DD",
  "expiryDate": "YYYY-MM-DD",
  "module1Date": "YYYY-MM-DD",
  "module2Date": "YYYY-MM-DD",
  "module3Date": "YYYY-MM-DD",
  "module4Date": "YYYY-MM-DD",
  "module5Date": "YYYY-MM-DD",
  "module6Date": "YYYY-MM-DD",
  "sortie1Date": "YYYY-MM-DD",
  "sortie2Date": "YYYY-MM-DD",
  "module7Date": "YYYY-MM-DD",
  "sortie3Date": "YYYY-MM-DD",
  "sortie4Date": "YYYY-MM-DD",
  "module8Date": "YYYY-MM-DD",
  "sortie5Date": "YYYY-MM-DD",
  "sortie6Date": "YYYY-MM-DD",
  "module9Date": "YYYY-MM-DD",
  "sortie7Date": "YYYY-MM-DD",
  "sortie8Date": "YYYY-MM-DD",
  "module10Date": "YYYY-MM-DD",
  "sortie9Date": "YYYY-MM-DD",
  "sortie10Date": "YYYY-MM-DD",
  "module11Date": "YYYY-MM-DD",
  "sortie11Date": "YYYY-MM-DD",
  "sortie12Date": "YYYY-MM-DD",
  "sortie13Date": "YYYY-MM-DD",
  "module12Date": "YYYY-MM-DD",
  "sortie14Date": "YYYY-MM-DD",
  "sortie15Date": "YYYY-MM-DD"
}

Use empty string for fields not found. Read each date carefully - the format is DD/MM/YYYY!`
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Attendance OCR failed:', response.status, errorText)
    return {}
  }

  const data = await response.json()
  console.log('Attendance OCR response:', JSON.stringify(data).substring(0, 500))
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    console.error('No content in attendance OCR response')
    return {}
  }

  try {
    return JSON.parse(cleanJsonResponse(content))
  } catch {
    console.error('Failed to parse attendance OCR:', content)
    return {}
  }
}

async function processCombinedImage(combinedImage: string): Promise<Partial<ExtractedData>> {
  console.log('Processing combined image, API key exists:', !!OPENROUTER_API_KEY)
  console.log('Image data length:', combinedImage?.length || 0)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'DS Attendance Platform - Certificate Maker'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: combinedImage }
            },
            {
              type: 'text',
              text: `You are an OCR assistant. Extract data from this image containing a Quebec driver's licence AND a handwritten attendance sheet.

IMPORTANT: Dates on the attendance sheet are written as DD/MM/YYYY (day/month/year). Convert to YYYY-MM-DD.
Example: "16/03/2025" on paper → "2025-03-16" (March 16th)
Example: "02/02/2025" on paper → "2025-02-02" (February 2nd)

The first number is DAY (01-31), second is MONTH (01-12), third is YEAR.

FROM THE DRIVER'S LICENCE: Licence Number, Full Name, Address

FROM THE ATTENDANCE SHEET: Contract Number, Phone, Registration/Expiry Dates, and ALL module/session dates

Return ONLY valid JSON:
{
  "licenceNumber": "licence number exactly as shown",
  "name": "LastName, FirstName",
  "address": "full address",
  "contractNumber": "contract number",
  "phone": "phone number",
  "registrationDate": "YYYY-MM-DD",
  "expiryDate": "YYYY-MM-DD",
  "module1Date": "YYYY-MM-DD",
  "module2Date": "YYYY-MM-DD",
  "module3Date": "YYYY-MM-DD",
  "module4Date": "YYYY-MM-DD",
  "module5Date": "YYYY-MM-DD",
  "module6Date": "YYYY-MM-DD",
  "sortie1Date": "YYYY-MM-DD",
  "sortie2Date": "YYYY-MM-DD",
  "module7Date": "YYYY-MM-DD",
  "sortie3Date": "YYYY-MM-DD",
  "sortie4Date": "YYYY-MM-DD",
  "module8Date": "YYYY-MM-DD",
  "sortie5Date": "YYYY-MM-DD",
  "sortie6Date": "YYYY-MM-DD",
  "module9Date": "YYYY-MM-DD",
  "sortie7Date": "YYYY-MM-DD",
  "sortie8Date": "YYYY-MM-DD",
  "module10Date": "YYYY-MM-DD",
  "sortie9Date": "YYYY-MM-DD",
  "sortie10Date": "YYYY-MM-DD",
  "module11Date": "YYYY-MM-DD",
  "sortie11Date": "YYYY-MM-DD",
  "sortie12Date": "YYYY-MM-DD",
  "sortie13Date": "YYYY-MM-DD",
  "module12Date": "YYYY-MM-DD",
  "sortie14Date": "YYYY-MM-DD",
  "sortie15Date": "YYYY-MM-DD"
}

Use empty string for fields not found. Remember: dates are DD/MM/YYYY - read carefully!`
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Combined OCR failed:', response.status, errorText)
    return {}
  }

  const data = await response.json()
  console.log('Combined OCR response (truncated):', JSON.stringify(data).substring(0, 500))

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    console.error('No content in combined OCR response')
    return {}
  }

  console.log('AI content (first 500 chars):', content.substring(0, 500))

  try {
    const cleaned = cleanJsonResponse(content)
    console.log('Cleaned JSON (first 300 chars):', cleaned.substring(0, 300))
    return JSON.parse(cleaned)
  } catch (e) {
    console.error('Failed to parse combined OCR. Error:', e instanceof Error ? e.message : e)
    console.error('Raw content:', content)
    return {}
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('OCR API called')
    const body = await request.json()
    const { licenceImage, attendanceImage, combinedImage } = body
    console.log('Received images - licence:', !!licenceImage, 'attendance:', !!attendanceImage, 'combined:', !!combinedImage)

    if (!licenceImage && !attendanceImage && !combinedImage) {
      console.error('No images provided in request')
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      )
    }

    if (!OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY is not configured')
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      )
    }
    console.log('API key configured, length:', OPENROUTER_API_KEY.length)

    let extractedData: ExtractedData

    // If combined image provided, process it with a single OCR call
    if (combinedImage) {
      console.log('Processing combined image...')
      const combinedData = await processCombinedImage(combinedImage)
      extractedData = {
        ...emptyData,
        ...combinedData
      }
    } else {
      // Process separate images in parallel
      const [licenceData, attendanceData] = await Promise.all([
        licenceImage ? processLicenceImage(licenceImage) : Promise.resolve({} as Partial<ExtractedData>),
        attendanceImage ? processAttendanceImage(attendanceImage) : Promise.resolve({} as Partial<ExtractedData>)
      ])

      // Merge results, with attendance data taking precedence for shared fields
      extractedData = {
        ...emptyData,
        ...licenceData, // Licence data
        ...attendanceData, // Attendance data (overwrites if same field)
      }

      // If licence has better name/licenceNumber, prefer it
      if (licenceData.licenceNumber && !attendanceData.licenceNumber) {
        extractedData.licenceNumber = licenceData.licenceNumber
      }
      if (licenceData.name && !attendanceData.name) {
        extractedData.name = licenceData.name
      }
    }

    // Check if any data was extracted
    const hasData = extractedData.name || extractedData.licenceNumber || extractedData.module1Date
    if (!hasData) {
      console.warn('OCR completed but no meaningful data extracted. The AI may not have been able to read the image.')
    }
    console.log('OCR completed, extracted fields:', Object.entries(extractedData).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none')
    return NextResponse.json(extractedData)
  } catch (error) {
    console.error('OCR error:', error instanceof Error ? error.message : error)
    console.error('OCR error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
