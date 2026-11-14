import type { Prisma, PrismaClient } from '@prisma/client'
import type { StaffSession } from '@/lib/admin-auth'

/** Active invoices only. Every normal read must include this. */
export const activeInvoiceWhere = { deletedAt: null } satisfies Prisma.InvoiceWhereInput

export const deletedInvoiceWhere = { deletedAt: { not: null } } satisfies Prisma.InvoiceWhereInput

type InvoiceDb = PrismaClient | Prisma.TransactionClient

export function omitDeletedInvoices<T extends { deletedAt?: Date | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.deletedAt == null)
}

export function deletedInvoiceBlock(invoice: { deletedAt: Date | null } | null): { status: number; error: string } | null {
  if (!invoice) return { status: 404, error: 'Invoice not found' }
  if (invoice.deletedAt) {
    return { status: 409, error: 'This invoice is deleted. Restore it from Recently deleted before changing it.' }
  }
  return null
}

export function staffDeletedBy(session: StaffSession | null): string | null {
  if (!session) return null
  const label = session.label?.trim()
  return (label || session.sid).slice(0, 200)
}

/**
 * Sets deletedAt and deletedBy only. Raw SQL so Prisma does not touch updatedAt
 * or any amount, balance, status, or number.
 */
export async function softDeleteInvoice(db: InvoiceDb, id: string, deletedBy: string | null): Promise<'missing' | 'deleted' | 'already'> {
  const existing = await db.invoice.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
  if (!existing) return 'missing'
  if (existing.deletedAt) return 'already'
  const count = await db.$executeRaw`
    UPDATE "Invoice"
    SET "deletedAt" = ${new Date()}, "deletedBy" = ${deletedBy}
    WHERE "id" = ${id} AND "deletedAt" IS NULL
  `
  return Number(count) > 0 ? 'deleted' : 'already'
}

/** Clears deletedAt and deletedBy only. */
export async function restoreInvoice(db: InvoiceDb, id: string): Promise<'missing' | 'restored' | 'active'> {
  const existing = await db.invoice.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
  if (!existing) return 'missing'
  if (!existing.deletedAt) return 'active'
  const count = await db.$executeRaw`
    UPDATE "Invoice"
    SET "deletedAt" = NULL, "deletedBy" = NULL
    WHERE "id" = ${id} AND "deletedAt" IS NOT NULL
  `
  return Number(count) > 0 ? 'restored' : 'active'
}
