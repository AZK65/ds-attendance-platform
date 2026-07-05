import { NextResponse } from 'next/server'
import { getGroupsWithDetails, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

async function pendingInviteCounts(): Promise<Map<string, number>> {
  try {
    const counts = await prisma.groupInvite.groupBy({
      by: ['groupId'],
      where: { status: 'pending' },
      _count: { _all: true },
    })
    return new Map(counts.map(c => [c.groupId, c._count._all]))
  } catch {
    return new Map()
  }
}

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

    const inviteCounts = await pendingInviteCounts()
    return NextResponse.json({
      groups: cachedGroups.map(g => ({
        id: g.id,
        name: g.name,
        participantCount: g.participantCount,
        moduleNumber: g.moduleNumber ?? null,
        vehicleType: g.vehicleType,
        lastMessageDate: g.lastMessageDate?.toISOString() ?? null,
        lastMessagePreview: g.lastMessagePreview ?? null,
        pendingInvites: inviteCounts.get(g.id) || 0
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

    // Re-read from Prisma so we get the persisted vehicleType (default
    // 'car') for every group. The objects returned from WhatsApp don't
    // carry that field.
    const annotated = await prisma.group.findMany({
      where: { id: { in: groups.map(g => g.id) } },
      select: { id: true, vehicleType: true },
    })
    const typeById = new Map(annotated.map(g => [g.id, g.vehicleType]))

    const inviteCounts = await pendingInviteCounts()
    return NextResponse.json({
      groups: groups.map(g => ({
        ...g,
        vehicleType: typeById.get(g.id) || 'car',
        pendingInvites: inviteCounts.get(g.id) || 0,
      })),
      fromCache: false,
      isConnected: true,
    })
  } catch (error) {
    console.error('Get groups error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    )
  }
}
