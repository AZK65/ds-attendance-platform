import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get('contactId')

  if (!contactId) {
    return NextResponse.json(
      { error: 'contactId is required' },
      { status: 400 }
    )
  }

  try {
    const records = await prisma.attendanceRecord.findMany({
      where: { contactId },
      include: {
        attendanceSheet: {
          include: { group: true }
        }
      },
      orderBy: { date: 'desc' }
    })

    return NextResponse.json({ records })
  } catch (error) {
    console.error('Failed to fetch student attendance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch student attendance' },
      { status: 500 }
    )
  }
}
