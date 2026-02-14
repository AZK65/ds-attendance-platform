import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Get all teacher phone records
export async function GET() {
  try {
    const teachers = await prisma.teacherPhone.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ teachers })
  } catch (error) {
    console.error('Failed to fetch teacher phones:', error)
    return NextResponse.json({ error: 'Failed to fetch teacher phones' }, { status: 500 })
  }
}

// Create or update a teacher phone (upsert by subcalendarId)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subcalendarId, name, phone } = body

    if (!subcalendarId || !name || !phone) {
      return NextResponse.json(
        { error: 'subcalendarId, name, and phone are required' },
        { status: 400 }
      )
    }

    const teacher = await prisma.teacherPhone.upsert({
      where: { subcalendarId: parseInt(subcalendarId) },
      update: { name, phone },
      create: { subcalendarId: parseInt(subcalendarId), name, phone },
    })

    return NextResponse.json({ success: true, teacher })
  } catch (error) {
    console.error('Failed to save teacher phone:', error)
    return NextResponse.json({ error: 'Failed to save teacher phone' }, { status: 500 })
  }
}

// Delete a teacher phone
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subcalendarId = searchParams.get('subcalendarId')

    if (!subcalendarId) {
      return NextResponse.json({ error: 'subcalendarId required' }, { status: 400 })
    }

    await prisma.teacherPhone.delete({
      where: { subcalendarId: parseInt(subcalendarId) },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete teacher phone:', error)
    return NextResponse.json({ error: 'Failed to delete teacher phone' }, { status: 500 })
  }
}
