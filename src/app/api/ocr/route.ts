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
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'DS Attendance Platform - Certificate Maker'
    },
    body: JSON.stringify({
      model: 'moonshotai/kimi-k2.5',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an OCR assistant specialized in reading Quebec driver's licenses.

Analyze this driver's license image and extract:
1. Driver's Licence Number (Numéro de permis) - Format like "A2536-090400-01" or similar
2. Full Name (Nom complet) - Last name, First name
3. Address (Adresse)

Return ONLY a valid JSON object (no markdown, no code blocks):
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
      temperature: 0.1
    })
  })

  if (!response.ok) {
    console.error('Licence OCR failed:', await response.text())
    return {}
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) return {}

  try {
    return JSON.parse(cleanJsonResponse(content))
  } catch {
    console.error('Failed to parse licence OCR:', content)
    return {}
  }
}

async function processAttendanceImage(attendanceImage: string): Promise<Partial<ExtractedData>> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'DS Attendance Platform - Certificate Maker'
    },
    body: JSON.stringify({
      model: 'moonshotai/kimi-k2.5',
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
              text: `You are an OCR assistant specialized in reading driving school attendance sheets.

This is a "STUDENT ATTENDANCE SHEET" (Qazi Driving School format) with dates for driving course modules and in-car sessions.

Extract ALL dates from this attendance sheet. The sheet has:
- Student info: Name, Phone, Contract Number, Class 5 Licence Number, Registration Date, Expiry Date
- PHASE 1: M1-The Vehicle, M2-The Driver, M3-The Environment, M4-At-Risk Behaviours, M5-Evaluation (theory modules)
- PHASE 2: M6-Accompanied Driving, In-Car Sessions 1-4, M7-OELA Strategy
- PHASE 3: M8-Speed, In-Car Sessions 5-6, M9-Sharing the Road, In-Car Sessions 7-8, M10-Alcohol and Drugs, In-Car Sessions 9-10
- PHASE 4: M11-Fatigue and Distractions, In-Car Sessions 11-13, M12-Eco-driving, In-Car Sessions 14-15

Look for the DATE column next to each module/session row. Dates are typically written as DD/MM/YYYY or YYYY-MM-DD.

Return ONLY valid JSON (no markdown):
{
  "name": "student name if visible",
  "contractNumber": "contract number",
  "phone": "phone number",
  "licenceNumber": "Class 5 Licence Number if shown",
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

IMPORTANT: Convert ALL dates to YYYY-MM-DD format. If a date shows "02/01/2025", convert to "2025-01-02". Use empty string for dates not found.`
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    })
  })

  if (!response.ok) {
    console.error('Attendance OCR failed:', await response.text())
    return {}
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) return {}

  try {
    return JSON.parse(cleanJsonResponse(content))
  } catch {
    console.error('Failed to parse attendance OCR:', content)
    return {}
  }
}

export async function POST(request: NextRequest) {
  try {
    const { licenceImage, attendanceImage } = await request.json()

    if (!licenceImage && !attendanceImage) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      )
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      )
    }

    // Process both images in parallel if both provided
    const results = await Promise.all([
      licenceImage ? processLicenceImage(licenceImage) : Promise.resolve({}),
      attendanceImage ? processAttendanceImage(attendanceImage) : Promise.resolve({})
    ])

    // Merge results, with attendance data taking precedence for shared fields
    const extractedData: ExtractedData = {
      ...emptyData,
      ...results[0], // Licence data
      ...results[1], // Attendance data (overwrites if same field)
    }

    // If licence has better name/licenceNumber, prefer it
    if (results[0].licenceNumber && !results[1].licenceNumber) {
      extractedData.licenceNumber = results[0].licenceNumber
    }
    if (results[0].name && !results[1].name) {
      extractedData.name = results[0].name
    }

    return NextResponse.json(extractedData)
  } catch (error) {
    console.error('OCR error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
