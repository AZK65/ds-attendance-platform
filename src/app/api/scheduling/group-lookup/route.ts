import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  if (!name) {
    return NextResponse.json({ error: 'name parameter required' }, { status: 400 })
  }

  try {
    // Try exact match first
    let group = await prisma.group.findFirst({
      where: { name },
      select: { id: true, name: true },
    })

    // Fallback: contains match (case-insensitive for SQLite)
    if (!group) {
      group = await prisma.group.findFirst({
        where: { name: { contains: name } },
        select: { id: true, name: true },
      })
    }

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    return NextResponse.json({ groupId: group.id, name: group.name })
  } catch (error) {
    console.error('Group lookup error:', error)
    return NextResponse.json({ error: 'Failed to look up group' }, { status: 500 })
  }
}
