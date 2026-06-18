import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/leads/webhook
// Public endpoint that receives Google Ads "Lead Form" submissions in real
// time. Configure this URL + a secret key in the lead form asset's
// "Lead delivery options". Google posts JSON like:
//   {
//     "lead_id": "...", "api_version": "1.0",
//     "form_id": 123, "campaign_id": 456, "gcl_id": "...",
//     "google_key": "<the secret you set>", "is_test": false,
//     "user_column_data": [
//       { "column_id": "FULL_NAME",    "column_name": "Full name",    "string_value": "Jane Doe" },
//       { "column_id": "EMAIL",        "column_name": "Email",        "string_value": "jane@x.com" },
//       { "column_id": "PHONE_NUMBER", "column_name": "Phone number", "string_value": "+15145551234" },
//       ...custom question answers...
//     ]
//   }
// We must return HTTP 200 quickly to acknowledge; any other status makes
// Google retry and surfaces an error on the "Send test data" button.

interface LeadColumn {
  column_id?: string
  column_name?: string
  string_value?: string
}

// Column ids Google uses for the standard contact fields — everything else
// (city, postal code, qualifying-question answers, etc.) becomes "notes".
const CONTACT_IDS = new Set([
  'FULL_NAME', 'FIRST_NAME', 'LAST_NAME',
  'EMAIL', 'WORK_EMAIL', 'USER_EMAIL',
  'PHONE_NUMBER', 'WORK_PHONE',
])

// Quick reachability check (open the URL in a browser to confirm it's live).
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'google-ads-lead-webhook' })
}

export async function POST(request: NextRequest) {
  const expectedKey = process.env.GOOGLE_LEADS_WEBHOOK_KEY
  if (!expectedKey) {
    console.error('[leads/webhook] GOOGLE_LEADS_WEBHOOK_KEY is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Shared-secret check — this is how Google authenticates to us.
  if (body.google_key !== expectedKey) {
    console.warn('[leads/webhook] rejected: bad google_key')
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  const cols: LeadColumn[] = Array.isArray(body.user_column_data)
    ? (body.user_column_data as LeadColumn[])
    : []
  const val = (id: string) =>
    cols.find(c => (c.column_id || '').toUpperCase() === id)?.string_value?.trim() || ''

  const name =
    val('FULL_NAME') ||
    [val('FIRST_NAME'), val('LAST_NAME')].filter(Boolean).join(' ').trim() ||
    null
  const email = val('EMAIL') || val('WORK_EMAIL') || val('USER_EMAIL') || null
  const phone = val('PHONE_NUMBER') || val('WORK_PHONE') || null

  // Anything that isn't a standard contact field is captured as a note line
  // (this is where qualifying-question answers / messages show up).
  const notes =
    cols
      .filter(c => !CONTACT_IDS.has((c.column_id || '').toUpperCase()))
      .map(c => {
        const label = c.column_name || c.column_id || 'Field'
        const value = (c.string_value || '').trim()
        return value ? `${label}: ${value}` : ''
      })
      .filter(Boolean)
      .join('\n') || null

  const data = {
    name,
    email,
    phone,
    notes,
    source: 'google_ads',
    isTest: body.is_test === true,
    formId: body.form_id != null ? String(body.form_id) : null,
    campaignId: body.campaign_id != null ? String(body.campaign_id) : null,
    gclId: typeof body.gcl_id === 'string' ? body.gcl_id : null,
    rawData: JSON.stringify(body),
  }

  try {
    const leadId = body.lead_id != null ? String(body.lead_id) : null
    if (leadId) {
      // Upsert so Google's retries don't create duplicates.
      await prisma.lead.upsert({
        where: { leadId },
        create: { ...data, leadId },
        update: data,
      })
    } else {
      await prisma.lead.create({ data })
    }
  } catch (error) {
    console.error('[leads/webhook] failed to store lead:', error)
    // Still 500 so Google retries rather than silently dropping the lead.
    return NextResponse.json({ error: 'Failed to store lead' }, { status: 500 })
  }

  return NextResponse.json({})
}
