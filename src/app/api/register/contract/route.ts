import { NextRequest, NextResponse } from 'next/server'
import { Class1ContractError, renderStoredClass1Contract } from '@/lib/class1-contract-render'
import type { Class1ContractLang } from '@/lib/class1-contract-pdf'

// GET /api/register/contract?registrationId=...&lang=en|fr (default: both pages).
// Admin-only — middleware treats /api/register as public, so we gate here.
// The PDF is rendered from the registration and from paid invoices. It is
// not saved. Viewing or emailing a contract that was already signed draws
// the stored signature images onto this layout.
export async function GET(request: NextRequest) {
  if (request.cookies.get('auth-token')?.value !== 'valid') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const registrationId = searchParams.get('registrationId')
  const lang = (searchParams.get('lang') as Class1ContractLang | null) || 'both'
  if (!registrationId) {
    return NextResponse.json({ error: 'registrationId required' }, { status: 400 })
  }
  if (lang !== 'en' && lang !== 'fr' && lang !== 'both') {
    return NextResponse.json({ error: 'lang must be en, fr, or both' }, { status: 400 })
  }
  try {
    const { buffer, fullName } = await renderStoredClass1Contract(registrationId, lang)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="contract-${fullName.replace(/\s+/g, '_') || registrationId}.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof Class1ContractError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[contract] generate failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate contract', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }
}
