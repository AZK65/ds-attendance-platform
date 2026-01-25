import { NextResponse } from 'next/server'
import { getWhatsAppState, getGroupsWithDetails, getGroupParticipants } from '@/lib/whatsapp/client'

interface ParticipantWithGroup {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  groupId: string
  groupName: string
  moduleNumber: number | null
}

export async function GET() {
  const state = getWhatsAppState()

  if (!state.isConnected) {
    return NextResponse.json({
      participants: [],
      isConnected: false
    })
  }

  try {
    // Get all groups with their module info
    const groups = await getGroupsWithDetails()

    // Filter valid groups
    const validGroups = groups.filter(g => g.name && g.name !== 'Status Broadcast')

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
            moduleNumber: group.moduleNumber || null
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
