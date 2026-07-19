import { prisma } from '@/lib/db'

export interface Installment {
  label: string
  sub: string | null
  amount: number
}

export interface ClassPricing {
  depositCents: number // amount actually authorized on the card at registration
  schedule: Installment[] // displayed installment plan
  note: string // optional summary line (e.g. truck cost breakdown)
  total: number // derived: sum of schedule amounts
}

export interface Pricing {
  car: ClassPricing
  truck: ClassPricing
}

// Defaults mirror what used to be hardcoded in register/page.tsx and
// api/register/authorize. Used as the seed and as the fallback whenever the
// PricingSettings row is missing or a schedule fails to parse — so pricing
// can never end up blank/zero from a bad read.
export const DEFAULT_CAR_SCHEDULE: Installment[] = [
  { label: 'On Registration', sub: null, amount: 250 },
  { label: '1st Certificate', sub: null, amount: 150 },
  { label: 'Phase 2', sub: 'Road Class 1', amount: 150 },
  { label: 'Phase 3', sub: 'Road Class 6', amount: 150 },
  { label: 'Phase 3', sub: 'Road Class 9', amount: 150 },
  { label: 'Phase 4', sub: 'Road Class 12', amount: 150 },
]

export const DEFAULT_TRUCK_SCHEDULE: Installment[] = [
  { label: 'Installment 1', sub: 'On registration', amount: 2262.5 },
  { label: 'Installment 2', sub: 'Theory phase', amount: 2262.5 },
  { label: 'Installment 3', sub: 'Practical phase', amount: 2262.5 },
  { label: 'Installment 4', sub: 'Final + Laval exam', amount: 2262.5 },
]

export const DEFAULT_TRUCK_NOTE =
  '$9,050 before taxes — $2,250 theory + $6,500 practical + $300 SAAQ exam in Laval. Paid in 4 installments.'

export const DEFAULT_CAR_DEPOSIT_CENTS = 25000
export const DEFAULT_TRUCK_DEPOSIT_CENTS = 25000

function parseSchedule(raw: string, fallback: Installment[]): Installment[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback
    const clean = parsed
      .filter(r => r && typeof r.amount === 'number' && isFinite(r.amount) && r.amount >= 0)
      .map(r => ({
        label: String(r.label ?? '').slice(0, 80),
        sub: r.sub == null || r.sub === '' ? null : String(r.sub).slice(0, 80),
        amount: Math.round(Number(r.amount) * 100) / 100,
      }))
    return clean.length > 0 ? clean : fallback
  } catch {
    return fallback
  }
}

const sum = (rows: Installment[]) => Math.round(rows.reduce((n, r) => n + r.amount, 0) * 100) / 100

// Read pricing from the DB, falling back to defaults for anything missing.
// Never throws — a DB error yields the default pricing so registration and
// the charge path keep working.
export async function getPricing(): Promise<Pricing> {
  let row: {
    carDepositCents: number; carSchedule: string; carNote: string
    truckDepositCents: number; truckSchedule: string; truckNote: string
  } | null = null
  try {
    row = await prisma.pricingSettings.findUnique({ where: { id: 'default' } })
  } catch (e) {
    console.error('[pricing] read failed, using defaults:', e)
  }

  const carSchedule = row ? parseSchedule(row.carSchedule, DEFAULT_CAR_SCHEDULE) : DEFAULT_CAR_SCHEDULE
  const truckSchedule = row ? parseSchedule(row.truckSchedule, DEFAULT_TRUCK_SCHEDULE) : DEFAULT_TRUCK_SCHEDULE

  return {
    car: {
      depositCents: row?.carDepositCents ?? DEFAULT_CAR_DEPOSIT_CENTS,
      schedule: carSchedule,
      note: row?.carNote ?? '',
      total: sum(carSchedule),
    },
    truck: {
      depositCents: row?.truckDepositCents ?? DEFAULT_TRUCK_DEPOSIT_CENTS,
      schedule: truckSchedule,
      note: row?.truckNote ?? DEFAULT_TRUCK_NOTE,
      total: sum(truckSchedule),
    },
  }
}

// Deposit (in cents) actually charged today for a given vehicle type.
export async function getDepositCents(vehicleType: string | null | undefined): Promise<number> {
  const pricing = await getPricing()
  return vehicleType === 'truck' ? pricing.truck.depositCents : pricing.car.depositCents
}
