import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppState, getGroupsWithDetails, getGroupParticipants } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

interface ParticipantWithGroup {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  groupId: string
  groupName: string
  moduleNumber: number | null
  lastMessageDate: string | null
}

export async function GET(request: NextRequest) {
  const courseOnly = request.nextUrl.searchParams.get('courseOnly') === 'true'
  const state = getWhatsAppState()

  // When WhatsApp is disconnected, fall back to database contacts
  if (!state.isConnected) {
    try {
      const records = await prisma.attendanceRecord.findMany({
        select: {
          contactId: true,
          contact: { select: { id: true, phone: true, name: true, pushName: true } },
          attendanceSheet: {
            select: { group: { select: { id: true, name: true } } }
          },
        },
        distinct: ['contactId'],
        orderBy: { date: 'desc' },
      })

      const participants: ParticipantWithGroup[] = records.map(r => ({
        id: r.contact.id,
        phone: r.contact.phone,
        name: r.contact.name,
        pushName: r.contact.pushName,
        groupId: r.attendanceSheet.group.id,
        groupName: r.attendanceSheet.group.name,
        moduleNumber: null,
        lastMessageDate: null,
      }))

      return NextResponse.json({ participants, isConnected: false })
    } catch (error) {
      console.error('DB fallback participants error:', error)
      return NextResponse.json({ participants: [], isConnected: false })
    }
  }

  try {
    // Get all groups with their module info
    const groups = await getGroupsWithDetails()

    // Filter groups based on courseOnly param
    const validGroups = courseOnly
      ? groups.filter(g => g.name && g.name !== 'Status Broadcast' && g.moduleNumber)
      : groups.filter(g => g.name && g.name !== 'Status Broadcast')

    // Fetch participants for all groups in parallel (batched to avoid overwhelming)
    const BATCH_SIZE = 5
    const allParticipants: ParticipantWithGroup[] = []

    for (let i = 0; i < validGroups.length; i += BATCH_SIZE) {
      const batch = validGroups.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (group) => {
          const participants = await getGroupParticipants(group.id)
          return participants.map(p => ({
            id: p.id,
            phone: p.phone,
            name: p.name || null,
            pushName: p.pushName || null,
            groupId: group.id,
            groupName: group.name!,
            moduleNumber: group.moduleNumber || null,
            lastMessageDate: group.lastMessageDate ? group.lastMessageDate.toISOString() : null
          }))
        })
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          allParticipants.push(...result.value)
        }
      }
    }

    return NextResponse.json({
      participants: allParticipants,
      isConnected: true
    })
  } catch (error) {
    console.error('Get all participants error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch participants' },
      { status: 500 }
    )
  }
}
