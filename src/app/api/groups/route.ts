import { NextResponse } from 'next/server'
import { getGroupsWithDetails, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function GET() {
  const state = getWhatsAppState()

  if (!state.isConnected) {
    // Return from database if not connected
    const cachedGroups = await prisma.group.findMany({
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({
      groups: cachedGroups.map(g => ({
        id: g.id,
        name: g.name,
        participantCount: g.participantCount,
        moduleNumber: g.moduleNumber ?? null,
        lastMessageDate: g.lastMessageDate?.toISOString() ?? null,
        lastMessagePreview: g.lastMessagePreview ?? null
      })),
      fromCache: true,
      isConnected: false
    })
  }

  try {
    // Fetch groups with details (module info, last message date)
    const groups = await getGroupsWithDetails()

    // Update database with group info (skip groups without names)
    for (const group of groups) {
      if (!group.name) continue  // Skip groups without a name

      await prisma.group.upsert({
        where: { id: group.id },
        update: {
          name: group.name,
          participantCount: group.participantCount,
          moduleNumber: group.moduleNumber ?? undefined,
          lastMessageDate: group.lastMessageDate ?? undefined,
          lastMessagePreview: group.lastMessagePreview ?? undefined,
          lastSynced: new Date()
        },
        create: {
          id: group.id,
          name: group.name,
          participantCount: group.participantCount,
          moduleNumber: group.moduleNumber ?? null,
          lastMessageDate: group.lastMessageDate ?? null,
          lastMessagePreview: group.lastMessagePreview ?? null,
        }
      })
    }

    return NextResponse.json({
      groups,
      fromCache: false,
      isConnected: true
    })
  } catch (error) {
    console.error('Get groups error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    )
  }
}
