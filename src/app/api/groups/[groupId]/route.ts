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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true'
  const state = getWhatsAppState()

  if (!state.isConnected) {
    // Fallback to database when not connected
    const group = await prisma.group.findUnique({
      where: { id: decodedGroupId }
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Get participants from cached GroupMember table
    const cachedMembers = await prisma.groupMember.findMany({
      where: { groupId: decodedGroupId },
      include: { contact: true },
    })

    // If no cached members, fall back to all contacts (legacy behavior)
    const participants = cachedMembers.length > 0
      ? cachedMembers.map(m => ({
          id: m.contactId,
          phone: m.phone,
          name: m.contact.name,
          pushName: m.contact.pushName,
          isAdmin: m.isAdmin,
          isSuperAdmin: m.isSuperAdmin,
        }))
      : (await prisma.contact.findMany({ orderBy: { phone: 'asc' } })).map(c => ({
          id: c.id,
          phone: c.phone,
          name: c.name,
          pushName: c.pushName,
          isAdmin: false,
          isSuperAdmin: false,
        }))

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        participantCount: group.participantCount,
        lastSynced: group.lastSynced,
      },
      participants,
      pendingInvites: await getPendingInvites(decodedGroupId),
      moduleNumber: group.moduleNumber ?? null,
      lastModuleMessageDate: group.lastMessageDate?.toISOString() ?? null,
      fromCache: true,
      isConnected: false
    })
  }

  try {
    // Check if we can use cache (synced within last 15 minutes and not force refresh).
    // Important: we previously called getGroupLastMessage on every cached hit,
    // which routes through Puppeteer/whatsapp-web.js and is the dominant
    // latency on this endpoint. Use the stored group.moduleNumber /
    // lastMessageDate columns instead — they're updated whenever the cache
    // misses or refresh=true.
    if (!forceRefresh) {
      const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)

      if (group && group.lastSynced > fifteenMinAgo) {
        const cachedMembers = await prisma.groupMember.findMany({
          where: { groupId: decodedGroupId },
          include: { contact: true },
        })

        if (cachedMembers.length > 0) {
          return NextResponse.json({
            group: {
              id: group.id,
              name: group.name,
              participantCount: group.participantCount,
              lastSynced: group.lastSynced,
            },
            participants: cachedMembers.map(m => ({
              id: m.contactId,
              phone: m.phone,
              name: m.contact.name,
              pushName: m.contact.pushName,
              isAdmin: m.isAdmin,
              isSuperAdmin: m.isSuperAdmin,
            })),
            pendingInvites: await getPendingInvites(decodedGroupId),
            moduleNumber: group.moduleNumber ?? null,
            lastModuleMessageDate: group.lastMessageDate?.toISOString() ?? null,
            fromCache: true,
            isConnected: true,
          })
        }
      }
    }

    // Fetch fresh data from WhatsApp — but only if we haven't hammered
    // this group recently. Without the cooldown, rapid clicks (SignInMode
    // Resync, page-open bursts, refetchIntervals overlapping) fire a WA
    // participant enumeration each time; that means N getContactById
    // calls per click, which throttles the WA session and eventually
    // manifests as "connection bug" symptoms.
    const now = Date.now()
    const lastSync = lastWaSyncAt.get(decodedGroupId) || 0
    const withinCooldown = now - lastSync < WA_SYNC_COOLDOWN_MS
    if (withinCooldown) {
      const cached = await prisma.groupMember.findMany({
        where: { groupId: decodedGroupId },
        include: { contact: true },
      })
      const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
      const participants = cached.map(m => ({
        id: m.contactId,
        phone: m.phone,
        name: m.contact?.name || null,
        pushName: m.contact?.pushName || null,
        isAdmin: m.isAdmin,
        isSuperAdmin: m.isSuperAdmin,
      }))
      console.log(
        `[GET /groups/${decodedGroupId}] Within ${WA_SYNC_COOLDOWN_MS / 1000}s WA cooldown (last sync ${Math.round((now - lastSync) / 1000)}s ago); serving ${participants.length} rows from DB.`
      )
      return NextResponse.json({
        group: {
          id: decodedGroupId,
          name: group?.name || '',
          participantCount: participants.length,
          lastSynced: group?.lastSynced || new Date(0),
        },
        participants,
        pendingInvites: await getPendingInvites(decodedGroupId),
        moduleNumber: group?.moduleNumber ?? null,
        lastModuleMessageDate: group?.lastMessageDate?.toISOString() ?? null,
        fromCache: true,
        isConnected: true,
        rateLimited: true,
      })
    }
    lastWaSyncAt.set(decodedGroupId, now)

    const groupInfo = await getGroupInfo(decodedGroupId)
    const waParticipants = await getGroupParticipants(decodedGroupId)

    // Get module number and last message date
    const lastMessage = await getGroupLastMessage(decodedGroupId)
    const moduleNumber = lastMessage?.moduleNumber || null
    const lastModuleMessageDate = lastMessage?.timestamp || null

    // Sync to DB (group + members)
    await prisma.group.upsert({
      where: { id: decodedGroupId },
      update: {
        name: groupInfo.name,
        participantCount: waParticipants.length,
        moduleNumber: moduleNumber ?? undefined,
        lastMessageDate: lastModuleMessageDate ?? undefined,
        lastSynced: new Date()
      },
      create: {
        id: decodedGroupId,
        name: groupInfo.name,
        participantCount: waParticipants.length,
        moduleNumber: moduleNumber ?? null,
        lastMessageDate: lastModuleMessageDate ?? null,
      }
    })

    // Cache participants (names already enriched by getGroupParticipants).
    // The sync itself has its own don't-nuke-the-roster guard for LID drift.
    await syncGroupMembers(decodedGroupId, waParticipants)

    // ALWAYS re-read from DB after the sync so the response reflects our
    // platform-side isAdmin toggles (the "Make admin" button on the group
    // members table). If we returned waParticipants verbatim, WA's isAdmin
    // (which only tracks WA-side group admin, not our staff-hide flag)
    // would shadow the admin's manual toggles every fresh sync — the
    // toggle would appear to work on the group detail page, then get
    // reset the next time the sign-in mode or any other consumer hit
    // ?refresh=true.
    //
    // This also covers the LID-drift empty-WA case: if the sync returned
    // 0 members (and syncGroupMembers' guard preserved existing rows),
    // we still surface those rows here instead of "0 students".
    const cached = await prisma.groupMember.findMany({
      where: { groupId: decodedGroupId },
      include: { contact: true },
    })
    if (waParticipants.length === 0 && cached.length > 0) {
      console.warn(
        `[GET /groups/${decodedGroupId}] WA returned 0 participants; using ${cached.length} cached rows instead.`
      )
    }
    const participants = cached.map(m => ({
      id: m.contactId,
      phone: m.phone,
      name: m.contact?.name || null,
      pushName: m.contact?.pushName || null,
      isAdmin: m.isAdmin,
      isSuperAdmin: m.isSuperAdmin,
    }))

    return NextResponse.json({
      group: {
        id: decodedGroupId,
        name: groupInfo.name,
        participantCount: participants.length,
        lastSynced: new Date(),
      },
      participants,
      // After syncGroupMembers/getGroupParticipants ran, joined invites are
      // already resolved, so this only returns the still-pending ones.
      pendingInvites: await getPendingInvites(decodedGroupId),
      moduleNumber,
      lastModuleMessageDate,
      fromCache: false,
      isConnected: true
    })
  } catch (error) {
    console.error('Get group error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch group' },
      { status: 500 }
    )
  }
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
