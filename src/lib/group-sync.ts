import { prisma } from '@/lib/db'
import { getGroupParticipants, getWhatsAppState } from '@/lib/whatsapp/client'

interface CachedMember {
  phone: string
  name: string | null
  pushName: string | null
  isAdmin: boolean
  isSuperAdmin: boolean
}

/**
 * Get group members — reads from DB cache first (instant), falls back to WhatsApp API.
 * If WhatsApp data is fetched, it's saved to the cache for next time.
 *
 * @param groupId WhatsApp group JID
 * @param forceRefresh If true, skip cache and fetch from WhatsApp directly
 * @returns Array of group members
 */
export async function getGroupMembers(
  groupId: string,
  forceRefresh = false
): Promise<CachedMember[]> {
  // Try cached data first (unless force refresh)
  if (!forceRefresh) {
    const cached = await prisma.groupMember.findMany({
      where: { groupId },
      include: { contact: true },
    })

    if (cached.length > 0) {
      return cached.map(m => ({
        phone: m.phone,
        name: m.contact.name,
        pushName: m.contact.pushName,
        isAdmin: m.isAdmin,
        isSuperAdmin: m.isSuperAdmin,
      }))
    }
  }

  // No cache or force refresh — try WhatsApp API
  const state = getWhatsAppState()
  if (!state.isConnected) {
    // WhatsApp down, return whatever we have in cache
    const cached = await prisma.groupMember.findMany({
      where: { groupId },
      include: { contact: true },
    })
    return cached.map(m => ({
      phone: m.phone,
      name: m.contact.name,
      pushName: m.contact.pushName,
      isAdmin: m.isAdmin,
      isSuperAdmin: m.isSuperAdmin,
    }))
  }

  // Fetch from WhatsApp and sync to DB
  const members = await getGroupParticipants(groupId)
  await syncGroupMembers(groupId, members)

  return members.map(m => ({
    phone: m.phone,
    name: m.name || null,
    pushName: m.pushName || null,
    isAdmin: m.isAdmin || false,
    isSuperAdmin: m.isSuperAdmin || false,
  }))
}

/**
 * Sync WhatsApp group participants to the GroupMember cache.
 * Creates/updates contacts and group memberships.
 */
export async function syncGroupMembers(
  groupId: string,
  members: Array<{
    id: string
    phone: string
    name?: string | null
    pushName?: string | null
    isAdmin?: boolean
    isSuperAdmin?: boolean
  }>
) {
  // Upsert all contacts
  for (const m of members) {
    await prisma.contact.upsert({
      where: { id: m.id },
      update: {
        phone: m.phone,
        name: m.name || undefined,
        pushName: m.pushName || undefined,
        lastSynced: new Date(),
      },
      create: {
        id: m.id,
        phone: m.phone,
        name: m.name || null,
        pushName: m.pushName || null,
      },
    })
  }

  // Delete old memberships for this group that are no longer in the list
  const currentContactIds = members.map(m => m.id)
  await prisma.groupMember.deleteMany({
    where: {
      groupId,
      contactId: { notIn: currentContactIds },
    },
  })

  // Upsert memberships
  for (const m of members) {
    await prisma.groupMember.upsert({
      where: { groupId_contactId: { groupId, contactId: m.id } },
      update: {
        phone: m.phone,
        isAdmin: m.isAdmin || false,
        isSuperAdmin: m.isSuperAdmin || false,
      },
      create: {
        groupId,
        contactId: m.id,
        phone: m.phone,
        isAdmin: m.isAdmin || false,
        isSuperAdmin: m.isSuperAdmin || false,
      },
    })
  }

  // Update group lastSynced
  await prisma.group.update({
    where: { id: groupId },
    data: { participantCount: members.length, lastSynced: new Date() },
  }).catch(() => {})
}
