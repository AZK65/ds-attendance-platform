import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

interface OCRResponse {
  licenceNumber: string
  expiryDate: string
  issueDate: string
  birthDate: string
  name: string
  address: string
}

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json()

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      )
    }

    // Call OpenRouter with Kimi K2.5 for OCR
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

Analyze this driver's license image and extract the following information:
1. Driver's Licence Number (Numéro de permis) - This is a 13-character code like "N1326100391 07"
2. Expiry Date (Date d'expiration)
3. Issue Date (Date de délivrance)
4. Date of Birth (Date de naissance)
5. Full Name (Nom complet)
6. Address (Adresse)

Return ONLY a valid JSON object with these exact keys (no markdown, no code blocks, just raw JSON):
{
  "licenceNumber": "the licence number or empty string if not found",
  "expiryDate": "YYYY-MM-DD format or empty string",
  "issueDate": "YYYY-MM-DD format or empty string",
  "birthDate": "YYYY-MM-DD format or empty string",
  "name": "LastName, FirstName format or empty string",
  "address": "full address or empty string"
}

If you cannot read a field clearly, use an empty string for that field.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: image
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenRouter API error:', errorText)
      return NextResponse.json(
        { error: 'OCR service failed' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: 'No response from OCR service' },
        { status: 500 }
      )
    }

    // Parse the JSON response from Kimi
    let extractedData: OCRResponse
    try {
      // Clean the response - remove any markdown code blocks if present
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
      cleanContent = cleanContent.trim()

      extractedData = JSON.parse(cleanContent)
    } catch {
      console.error('Failed to parse OCR response:', content)
      // Return empty data if parsing fails
      extractedData = {
        licenceNumber: '',
        expiryDate: '',
        issueDate: '',
        birthDate: '',
        name: '',
        address: ''
      }
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
