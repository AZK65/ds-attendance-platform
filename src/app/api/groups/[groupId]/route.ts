import { NextRequest, NextResponse } from 'next/server'
import { getGroupParticipants, getGroupInfo, getWhatsAppState, getGroupLastMessage, getPendingInvites } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'
import { syncGroupMembers } from '@/lib/group-sync'

// Per-group rate limiter for the WA participant fetch. WhatsApp will
// throttle (or worse — silently drop the session) if we fire N getContactById
// calls back-to-back for the same group. Rapid clicks in SignInMode /
// Resync were doing exactly that. 30 s min gap between fresh syncs; other
// callers get DB-served data without a WA round trip.
const lastWaSyncAt = new Map<string, number>()
const WA_SYNC_COOLDOWN_MS = 30_000

// GET /api/groups/[groupId]
//
// DB-FIRST, WA-IN-BACKGROUND design (rewritten after several bugs from
// mixing "return WA data" with "return DB data" in different branches):
//
//   1. Read the group + its GroupMember rows from Prisma.
//   2. Return them immediately as the response.
//   3. If we should sync from WhatsApp (stale + connected + off cooldown),
//      kick that off in the background (fire-and-forget). Never blocks the
//      response. The next GET will see the updated DB.
//   4. The only case we do an inline WA sync is when there's genuinely no
//      Group row yet AND WA is connected — that's the "first ever" case.
//
// Guarantees:
//   - If DB has N rows for this group, the response returns exactly those
//     N rows. Period. No branch returns 0 when DB has more.
//   - No user-triggered path (SignInMode, Resync, page-open bursts) can
//     stack multiple WA participant enumerations — the cooldown gates the
//     background sync too.
//   - Manual isAdmin toggles ("Make admin" button on the members table)
//     always survive: syncGroupMembers no longer writes isAdmin on update,
//     and this endpoint never returns WA's isAdmin verbatim.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true'
  const state = getWhatsAppState()

  const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
  const cachedMembers = await prisma.groupMember.findMany({
    where: { groupId: decodedGroupId },
    include: { contact: true },
  })

  const buildResponse = (source: 'db' | 'db-first-sync' = 'db') => ({
    group: {
      id: decodedGroupId,
      name: group?.name || '',
      participantCount: cachedMembers.length,
      lastSynced: group?.lastSynced || new Date(0),
      vehicleType: group?.vehicleType || 'car',
    },
    participants: cachedMembers.map(m => ({
      id: m.contactId,
      phone: m.phone,
      name: m.contact?.name || null,
      pushName: m.contact?.pushName || null,
      isAdmin: m.isAdmin,
      isSuperAdmin: m.isSuperAdmin,
    })),
    moduleNumber: group?.moduleNumber ?? null,
    lastModuleMessageDate: group?.lastMessageDate?.toISOString() ?? null,
    fromCache: source === 'db',
    isConnected: state.isConnected,
  })

  // Case: unknown group AND we can't fetch from WA — 404.
  if (!group && (!state.isConnected)) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  // Case: brand-new group we haven't seen before, but WA is up. Sync
  // inline this once so the roster is populated for the caller (else we'd
  // return 0 with fromCache:true and the user would think it's broken).
  if (!group && state.isConnected) {
    try {
      const info = await getGroupInfo(decodedGroupId)
      const waParticipants = await getGroupParticipants(decodedGroupId)
      const lastMessage = await getGroupLastMessage(decodedGroupId).catch(() => null)
      await prisma.group.upsert({
        where: { id: decodedGroupId },
        update: {
          name: info.name,
          participantCount: waParticipants.length,
          moduleNumber: lastMessage?.moduleNumber ?? undefined,
          lastMessageDate: lastMessage?.timestamp ?? undefined,
          lastSynced: new Date(),
        },
        create: {
          id: decodedGroupId,
          name: info.name,
          participantCount: waParticipants.length,
          moduleNumber: lastMessage?.moduleNumber ?? null,
          lastMessageDate: lastMessage?.timestamp ?? null,
        },
      })
      await syncGroupMembers(decodedGroupId, waParticipants)
      lastWaSyncAt.set(decodedGroupId, Date.now())
      // Re-read for the response.
      const freshGroup = await prisma.group.findUnique({ where: { id: decodedGroupId } })
      const freshMembers = await prisma.groupMember.findMany({
        where: { groupId: decodedGroupId },
        include: { contact: true },
      })
      const pending = await getPendingInvites(decodedGroupId).catch(() => [])
      return NextResponse.json({
        group: {
          id: decodedGroupId,
          name: freshGroup?.name || info.name,
          participantCount: freshMembers.length,
          lastSynced: freshGroup?.lastSynced || new Date(),
          vehicleType: freshGroup?.vehicleType || 'car',
        },
        participants: freshMembers.map(m => ({
          id: m.contactId,
          phone: m.phone,
          name: m.contact?.name || null,
          pushName: m.contact?.pushName || null,
          isAdmin: m.isAdmin,
          isSuperAdmin: m.isSuperAdmin,
        })),
        pendingInvites: pending,
        moduleNumber: lastMessage?.moduleNumber ?? null,
        lastModuleMessageDate: lastMessage?.timestamp ?? null,
        fromCache: false,
        isConnected: true,
      })
    } catch (err) {
      console.error(`[GET /groups/${decodedGroupId}] initial sync failed:`, err)
      return NextResponse.json({ error: 'Failed to fetch group from WhatsApp' }, { status: 500 })
    }
  }

  // Case (normal): Group row exists. Return DB immediately + kick off a
  // background sync if warranted.
  const now = Date.now()
  const lastSync = lastWaSyncAt.get(decodedGroupId) || 0
  const withinCooldown = now - lastSync < WA_SYNC_COOLDOWN_MS
  const staleEnoughToSync =
    !!group &&
    (forceRefresh || Date.now() - group.lastSynced.getTime() > 15 * 60 * 1000)
  const shouldSync = state.isConnected && staleEnoughToSync && !withinCooldown

  if (shouldSync) {
    lastWaSyncAt.set(decodedGroupId, now) // reserve the slot BEFORE async work
    // Fire-and-forget. Errors logged, never surface to the caller — the
    // response has already gone out with DB-served rows.
    ;(async () => {
      try {
        const info = await getGroupInfo(decodedGroupId)
        const waParticipants = await getGroupParticipants(decodedGroupId)
        const lastMessage = await getGroupLastMessage(decodedGroupId).catch(() => null)
        await prisma.group.upsert({
          where: { id: decodedGroupId },
          update: {
            name: info.name,
            participantCount: waParticipants.length,
            moduleNumber: lastMessage?.moduleNumber ?? undefined,
            lastMessageDate: lastMessage?.timestamp ?? undefined,
            lastSynced: new Date(),
          },
          create: {
            id: decodedGroupId,
            name: info.name,
            participantCount: waParticipants.length,
            moduleNumber: lastMessage?.moduleNumber ?? null,
            lastMessageDate: lastMessage?.timestamp ?? null,
          },
        })
        await syncGroupMembers(decodedGroupId, waParticipants)
        console.log(`[GET /groups/${decodedGroupId}] background sync ok (${waParticipants.length} from WA, ${cachedMembers.length} previously in DB)`)
      } catch (err) {
        console.error(`[GET /groups/${decodedGroupId}] background sync failed:`, err)
      }
    })()
  }

  const pendingInvites = await getPendingInvites(decodedGroupId).catch(() => [])
  return NextResponse.json({ ...buildResponse('db'), pendingInvites })
}

// PATCH /api/groups/[groupId] — soft edits.
// Body: { action: 'archive' | 'unarchive' }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  try {
    const body = await request.json().catch(() => ({})) as { action?: string }
    if (body.action === 'archive') {
      await prisma.group.update({ where: { id: decodedGroupId }, data: { archivedAt: new Date() } })
      return NextResponse.json({ ok: true, archivedAt: new Date().toISOString() })
    }
    if (body.action === 'unarchive') {
      await prisma.group.update({ where: { id: decodedGroupId }, data: { archivedAt: null } })
      return NextResponse.json({ ok: true, archivedAt: null })
    }
    return NextResponse.json({ error: 'action must be archive or unarchive' }, { status: 400 })
  } catch (error) {
    console.error('[PATCH group]', error)
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 })
  }
}

// DELETE /api/groups/[groupId] — hard-delete the local Group record and all
// its cascaded data (members, attendance sheet, invites, bot pauses on any
// member phones). Does NOT touch the actual WhatsApp group — that stays
// intact on WA, we just stop tracking it locally. To re-track, sync groups
// again from /groups.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  try {
    // Cascades: GroupMember, AttendanceSheet (which cascades AttendanceRecord)
    // are all set up in schema.prisma. GroupInvite has no FK, so clean it
    // manually so it doesn't hang around orphaned.
    await prisma.groupInvite.deleteMany({ where: { groupId: decodedGroupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: decodedGroupId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[DELETE group]', error)
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 })
  }
}
