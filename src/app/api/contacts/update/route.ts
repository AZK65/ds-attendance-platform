import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { id, phone, name } = await request.json()

    if (!id || !phone) {
      return NextResponse.json({ error: 'id and phone are required' }, { status: 400 })
    }

    await prisma.contact.upsert({
      where: { id },
      update: {
        phone,
        name: name || null,
        lastSynced: new Date(),
      },
      create: {
        id,
        phone,
        name: name || null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update contact:', error)
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}
