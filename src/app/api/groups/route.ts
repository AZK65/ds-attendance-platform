import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(request: NextRequest) {
  const state = getWhatsAppState()

  // Archived groups are hidden by default. Pass ?includeArchived=1 (or
  // ?archivedOnly=1 for the "Archived" tab) to see them.
  const includeArchived = request.nextUrl.searchParams.get('includeArchived') === '1'
  const archivedOnly = request.nextUrl.searchParams.get('archivedOnly') === '1'
  const archiveFilter = archivedOnly
    ? { archivedAt: { not: null } }
    : includeArchived
      ? {}
      : { archivedAt: null }

  // Always return cached data first (instant) — sync from WhatsApp in background
  const cachedGroups = await prisma.group.findMany({
    where: archiveFilter,
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
      select: { id: true, vehicleType: true, archivedAt: true },
    })
    const metaById = new Map(annotated.map(g => [g.id, { vehicleType: g.vehicleType, archivedAt: g.archivedAt }]))

    const inviteCounts = await pendingInviteCounts()
    // Apply the same archive filter here so the "connected + fresh sync"
    // path returns the same visible set as the cached path above.
    const filtered = groups.filter(g => {
      const meta = metaById.get(g.id)
      const isArchived = !!meta?.archivedAt
      if (archivedOnly) return isArchived
      if (!includeArchived) return !isArchived
      return true
    })
    return NextResponse.json({
      groups: filtered.map(g => ({
        ...g,
        vehicleType: metaById.get(g.id)?.vehicleType || 'car',
        archivedAt: metaById.get(g.id)?.archivedAt || null,
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
