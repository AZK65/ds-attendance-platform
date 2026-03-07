import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/invoice/packages?type=car|truck
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type')

    const where: Record<string, unknown> = { isActive: true }
    if (type && type !== 'both') {
      where.vehicleType = { in: [type, 'both'] }
    }

    const packages = await prisma.invoicePackage.findMany({
      where,
      include: {
        instalments: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ packages })
  } catch (error) {
    console.error('[Packages GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 })
  }
}

// POST /api/invoice/packages — create package with instalments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, vehicleType = 'both', totalPrice, taxInclusive = true, instalments = [] } = body

    if (!name || totalPrice === undefined) {
      return NextResponse.json({ error: 'Name and totalPrice are required' }, { status: 400 })
    }

    // Get max sort order
    const maxSort = await prisma.invoicePackage.aggregate({ _max: { sortOrder: true } })
    const nextSort = (maxSort._max.sortOrder || 0) + 1

    const pkg = await prisma.invoicePackage.create({
      data: {
        name,
        vehicleType,
        totalPrice: parseFloat(totalPrice),
        taxInclusive,
        sortOrder: nextSort,
        instalments: {
          create: instalments.map((inst: { name: string; amount: number }, idx: number) => ({
            instalmentNumber: idx + 1,
            name: inst.name,
            amount: parseFloat(String(inst.amount)),
            sortOrder: idx,
          })),
        },
      },
      include: { instalments: { orderBy: { sortOrder: 'asc' } } },
    })

    return NextResponse.json({ package: pkg })
  } catch (error) {
    console.error('[Packages POST] Error:', error)
    return NextResponse.json({ error: 'Failed to create package' }, { status: 500 })
  }
}

// PUT /api/invoice/packages — update package + replace instalments
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, vehicleType, totalPrice, taxInclusive, instalments } = body

    if (!id) {
      return NextResponse.json({ error: 'Package ID is required' }, { status: 400 })
    }

    // Update package and replace instalments in a transaction
    const pkg = await prisma.$transaction(async (tx) => {
      // Update package fields
      const updateData: Record<string, unknown> = {}
      if (name !== undefined) updateData.name = name
      if (vehicleType !== undefined) updateData.vehicleType = vehicleType
      if (totalPrice !== undefined) updateData.totalPrice = parseFloat(totalPrice)
      if (taxInclusive !== undefined) updateData.taxInclusive = taxInclusive

      await tx.invoicePackage.update({
        where: { id },
        data: updateData,
      })

      // Replace instalments if provided
      if (instalments) {
        // Delete existing
        await tx.packageInstalment.deleteMany({ where: { packageId: id } })
        // Create new
        for (let i = 0; i < instalments.length; i++) {
          await tx.packageInstalment.create({
            data: {
              packageId: id,
              instalmentNumber: i + 1,
              name: instalments[i].name,
              amount: parseFloat(String(instalments[i].amount)),
              sortOrder: i,
            },
          })
        }
      }

      return tx.invoicePackage.findUnique({
        where: { id },
        include: { instalments: { orderBy: { sortOrder: 'asc' } } },
      })
    })

    return NextResponse.json({ package: pkg })
  } catch (error) {
    console.error('[Packages PUT] Error:', error)
    return NextResponse.json({ error: 'Failed to update package' }, { status: 500 })
  }
}

// DELETE /api/invoice/packages — soft delete
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Package ID is required' }, { status: 400 })
    }

    await prisma.invoicePackage.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Packages DELETE] Error:', error)
    return NextResponse.json({ error: 'Failed to delete package' }, { status: 500 })
  }
}
