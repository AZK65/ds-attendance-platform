import { NextResponse } from 'next/server'
import { getGroupsWithDetails, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function GET() {
  const state = getWhatsAppState()

  // Always return cached data first (instant) — sync from WhatsApp in background
  const cachedGroups = await prisma.group.findMany({
    orderBy: { name: 'asc' }
  })

  if (cachedGroups.length > 0) {
    // Background sync from WhatsApp (non-blocking — doesn't delay response)
    if (state.isConnected) {
      getGroupsWithDetails().then(async (groups) => {
        for (const group of groups) {
          if (!group.name) continue
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
          }).catch(() => {})
        }
      }).catch(() => {})
    }

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
      isConnected: state.isConnected
    })
  }

  // No cached data yet — must fetch live
  if (!state.isConnected) {
    return NextResponse.json({ groups: [], fromCache: true, isConnected: false })
  }

  try {
    const groups = await getGroupsWithDetails()

    for (const group of groups) {
      if (!group.name) continue
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
