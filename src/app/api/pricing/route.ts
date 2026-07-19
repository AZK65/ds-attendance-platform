import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  getPricing,
  DEFAULT_CAR_SCHEDULE, DEFAULT_TRUCK_SCHEDULE, DEFAULT_TRUCK_NOTE,
  DEFAULT_CAR_DEPOSIT_CENTS, DEFAULT_TRUCK_DEPOSIT_CENTS,
  type Installment,
} from '@/lib/pricing'

// GET /api/pricing — PUBLIC. Read by this app's /register page and the
// external marketing site (cross-origin; see CORS allowlist in middleware).
// Returns the editable Class 5 (car) and Class 1 (truck) pricing.
export async function GET() {
  const pricing = await getPricing()
  return NextResponse.json(pricing)
}

// Sanitize an incoming installment list.
function cleanSchedule(input: unknown, fallback: Installment[]): Installment[] {
  if (!Array.isArray(input)) return fallback
  const clean = input
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => ({
      label: String(r.label ?? '').slice(0, 80),
      sub: r.sub == null || r.sub === '' ? null : String(r.sub).slice(0, 80),
      amount: Math.max(0, Math.round(Number(r.amount) * 100) / 100),
    }))
    .filter(r => isFinite(r.amount))
  return clean.length > 0 ? clean : fallback
}

function cleanDeposit(input: unknown, fallback: number): number {
  const n = Math.round(Number(input))
  if (!isFinite(n) || n < 0 || n > 100_000_00) return fallback // cap at $100k
  return n
}

// PUT /api/pricing — admin save. This path is public in middleware (so GET
// works cross-origin), so we enforce auth HERE: only a request carrying the
// admin session cookie may write pricing.
export async function PUT(request: NextRequest) {
  if (request.cookies.get('auth-token')?.value !== 'valid') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const car = body?.car ?? {}
    const truck = body?.truck ?? {}

    const data = {
      carDepositCents: cleanDeposit(car.depositCents, DEFAULT_CAR_DEPOSIT_CENTS),
      carSchedule: JSON.stringify(cleanSchedule(car.schedule, DEFAULT_CAR_SCHEDULE)),
      carNote: typeof car.note === 'string' ? car.note.slice(0, 300) : '',
      truckDepositCents: cleanDeposit(truck.depositCents, DEFAULT_TRUCK_DEPOSIT_CENTS),
      truckSchedule: JSON.stringify(cleanSchedule(truck.schedule, DEFAULT_TRUCK_SCHEDULE)),
      truckNote: typeof truck.note === 'string' ? truck.note.slice(0, 300) : DEFAULT_TRUCK_NOTE,
    }

    await prisma.pricingSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    })

    return NextResponse.json({ success: true, pricing: await getPricing() })
  } catch (e) {
    console.error('[pricing] save failed:', e)
    return NextResponse.json({ error: 'Failed to save pricing' }, { status: 500 })
  }
}
