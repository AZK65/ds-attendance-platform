import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/invoice/services?type=car|truck (optional filter)
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type')

    const where: Record<string, unknown> = { isActive: true }

    if (type && (type === 'car' || type === 'truck')) {
      // Return services matching the type OR "both"
      where.vehicleType = { in: [type, 'both'] }
    }

    const services = await prisma.invoiceService.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ services })
  } catch (error) {
    console.error('Error fetching invoice services:', error)
    return NextResponse.json(
      { error: 'Failed to fetch services' },
      { status: 500 }
    )
  }
}

// POST /api/invoice/services - create a new service
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, price, vehicleType, taxInclusive } = body

    if (!name || price === undefined) {
      return NextResponse.json(
        { error: 'Name and price are required' },
        { status: 400 }
      )
    }

    // Get max sort order for auto-ordering
    const maxSort = await prisma.invoiceService.aggregate({
      _max: { sortOrder: true },
      where: { isActive: true },
    })

    const service = await prisma.invoiceService.create({
      data: {
        name,
        description: description || null,
        price: parseFloat(price) || 0,
        vehicleType: vehicleType || 'both',
        taxInclusive: taxInclusive ?? true,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    })

    return NextResponse.json({ service })
  } catch (error) {
    console.error('Error creating invoice service:', error)
    return NextResponse.json(
      { error: 'Failed to create service' },
      { status: 500 }
    )
  }
}

// PUT /api/invoice/services - update an existing service
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Service ID is required' },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}
    if (updates.name !== undefined) data.name = updates.name
    if (updates.description !== undefined) data.description = updates.description
    if (updates.price !== undefined) data.price = parseFloat(updates.price) || 0
    if (updates.vehicleType !== undefined) data.vehicleType = updates.vehicleType
    if (updates.taxInclusive !== undefined) data.taxInclusive = updates.taxInclusive
    if (updates.sortOrder !== undefined) data.sortOrder = updates.sortOrder
    if (updates.isActive !== undefined) data.isActive = updates.isActive

    const service = await prisma.invoiceService.update({
      where: { id },
      data,
    })

    return NextResponse.json({ service })
  } catch (error) {
    console.error('Error updating invoice service:', error)
    return NextResponse.json(
      { error: 'Failed to update service' },
      { status: 500 }
    )
  }
}

// DELETE /api/invoice/services - soft delete a service
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Service ID is required' },
        { status: 400 }
      )
    }

    const service = await prisma.invoiceService.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ service })
  } catch (error) {
    console.error('Error deleting invoice service:', error)
    return NextResponse.json(
      { error: 'Failed to delete service' },
      { status: 500 }
    )
  }
}
