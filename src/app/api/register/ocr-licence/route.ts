import { NextRequest, NextResponse } from 'next/server'
import { OCR_MODEL } from '@/lib/openrouter'

// POST /api/register/ocr-licence
// Public endpoint — runs OCR on a single Quebec driver's-licence photo and
// returns the fields we want to auto-fill in the registration form
// (licence number, expiration date, DOB, name, address).
//
// Uses OpenRouter (model from OCR_MODEL), same provider the certificate
// flow's OCR uses, but with a registration-specific prompt and a stricter
// output shape so we never accidentally surface unrelated data.

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

interface LicenceData {
  licenceNumber: string
  expiryDate: string
  dob: string
  name: string
  address: string
}

function cleanJson(content: string): string {
  let s = content.trim()
  if (s.startsWith('```json')) s = s.slice(7)
  else if (s.startsWith('```')) s = s.slice(3)
  if (s.endsWith('```')) s = s.slice(0, -3)
  return s.trim()
}

const EMPTY: LicenceData = { licenceNumber: '', expiryDate: '', dob: '', name: '', address: '' }

export async function POST(request: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OCR not configured' }, { status: 503 })
  }
  try {
    const { licenceImage } = await request.json() as { licenceImage?: string }
    if (!licenceImage || !licenceImage.startsWith('data:image/')) {
      return NextResponse.json({ error: 'licenceImage must be a data:image/* URL' }, { status: 400 })
    }
    // Cap on raw payload size so we don't accept multi-MB images by mistake.
    if (licenceImage.length > 6_000_000) {
      return NextResponse.json({ error: 'Image too large — keep under ~4 MB' }, { status: 413 })
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'DS Attendance Platform - Registration',
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an OCR assistant specialized in Quebec driver's licences and learner's permits.

Extract these fields from the licence image:
1. Licence Number (Numéro de permis) — the LARGE alphanumeric number near the top of the card. Format is like "N2605-100101-07" or "A2536-090400-01" (letter followed by digit groups separated by dashes). Do NOT use "No de référence" which is shorter and lower.
2. Expiration Date (Date d'expiration / Expiration) — return as YYYY-MM-DD.
3. Date of Birth (Date de naissance / DOB) — return as YYYY-MM-DD.
4. Full Name — Last name, First name (as printed on the card).
5. Address — single line including city and postal code.

Return ONLY a JSON object — no markdown, no code fences, no commentary:
{
  "licenceNumber": "exactly as printed on the card",
  "expiryDate": "YYYY-MM-DD",
  "dob": "YYYY-MM-DD",
  "name": "LastName, FirstName",
  "address": "full address"
}

Use empty string for any field you cannot read clearly.`,
            },
            { type: 'image_url', image_url: { url: licenceImage } },
          ],
        }],
        // Gemini Flash is a thinking model with mandatory reasoning; those
        // tokens count against max_tokens, so the cap must leave room for the
        // hidden reasoning AND the full JSON or the output truncates.
        max_tokens: 4000,
        temperature: 0,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[ocr-licence] OpenRouter failed:', res.status, errText.slice(0, 300))
      // Surface the provider's status + message so a config problem (data
      // policy, disabled key, rate limit) is distinguishable from an
      // unreadable photo. OpenRouter's error body is generic and never
      // contains our API key.
      let providerMessage = ''
      try {
        const parsed = JSON.parse(errText)
        providerMessage = parsed?.error?.message || parsed?.message || ''
      } catch {
        providerMessage = errText.slice(0, 200)
      }
      return NextResponse.json({
        ...EMPTY,
        _warning: `OCR provider error ${res.status}`,
        _providerMessage: providerMessage.slice(0, 200),
      })
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return NextResponse.json(EMPTY)

    try {
      const parsed = JSON.parse(cleanJson(content)) as Partial<LicenceData>
      return NextResponse.json({
        licenceNumber: parsed.licenceNumber?.trim() || '',
        expiryDate: parsed.expiryDate?.trim() || '',
        dob: parsed.dob?.trim() || '',
        name: parsed.name?.trim() || '',
        address: parsed.address?.trim() || '',
      })
    } catch {
      console.error('[ocr-licence] failed to parse:', content.slice(0, 200))
      return NextResponse.json(EMPTY)
    }
  } catch (err) {
    console.error('[ocr-licence] crash:', err)
    return NextResponse.json({ error: 'OCR failed', details: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
