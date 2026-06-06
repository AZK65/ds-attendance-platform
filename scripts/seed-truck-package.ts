/**
 * One-off / idempotent: create (or refresh) the Class 1 (truck) invoice
 * package so it shows up in /invoice/packages and can be applied to truck
 * invoices. Numbers come straight from the SAAQ Class 1 service contract /
 * registration agreement:
 *
 *   $2,250 theory + $6,500 practical + $300 SAAQ road exam in Laval
 *   = $9,050 before taxes, paid in 4 equal installments of $2,262.50.
 *
 * Kept in sync with TRUCK_PAYMENT_SCHEDULE / TRUCK_PACKAGE_TOTAL in
 * src/app/register/page.tsx and the truck agreement "Total cost" line.
 *
 * Run locally:
 *   npx tsx scripts/seed-truck-package.ts
 *
 * Run in production (inside the Docker container so it hits the prod DB):
 *   docker compose cp scripts/seed-truck-package.ts app:/app/scripts/
 *   docker compose exec app npx tsx scripts/seed-truck-package.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PACKAGE = {
  name: 'Class 1 Truck — Full Program',
  vehicleType: 'truck',
  totalPrice: 9050,
  taxInclusive: false, // prices are before taxes, matching the agreement
  instalments: [
    { name: 'Installment 1 (on registration)', amount: 2262.5 },
    { name: 'Installment 2 (theory phase)', amount: 2262.5 },
    { name: 'Installment 3 (practical phase)', amount: 2262.5 },
    { name: 'Installment 4 (final + Laval exam)', amount: 2262.5 },
  ],
}

async function main() {
  const existing = await prisma.invoicePackage.findFirst({
    where: { name: PACKAGE.name, vehicleType: PACKAGE.vehicleType },
  })

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.invoicePackage.update({
        where: { id: existing.id },
        data: {
          totalPrice: PACKAGE.totalPrice,
          taxInclusive: PACKAGE.taxInclusive,
          isActive: true,
        },
      })
      await tx.packageInstalment.deleteMany({ where: { packageId: existing.id } })
      for (let i = 0; i < PACKAGE.instalments.length; i++) {
        await tx.packageInstalment.create({
          data: {
            packageId: existing.id,
            instalmentNumber: i + 1,
            name: PACKAGE.instalments[i].name,
            amount: PACKAGE.instalments[i].amount,
            sortOrder: i,
          },
        })
      }
    })
    console.log(`✓ Updated existing truck package (${existing.id})`)
    return
  }

  const maxSort = await prisma.invoicePackage.aggregate({ _max: { sortOrder: true } })
  const created = await prisma.invoicePackage.create({
    data: {
      name: PACKAGE.name,
      vehicleType: PACKAGE.vehicleType,
      totalPrice: PACKAGE.totalPrice,
      taxInclusive: PACKAGE.taxInclusive,
      sortOrder: (maxSort._max.sortOrder || 0) + 1,
      instalments: {
        create: PACKAGE.instalments.map((inst, i) => ({
          instalmentNumber: i + 1,
          name: inst.name,
          amount: inst.amount,
          sortOrder: i,
        })),
      },
    },
  })
  console.log(`✓ Created truck package (${created.id})`)
}

main()
  .catch((err) => {
    console.error('❌ seed-truck-package failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
