import { NextRequest, NextResponse } from 'next/server'
import { searchContacts, getGroupParticipants, getWhatsAppState } from '@/lib/whatsapp/client'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const excludeGroupId = searchParams.get('excludeGroupId')

  try {
    const state = getWhatsAppState()
    if (!state.isConnected) {
      return NextResponse.json({ contacts: [] })
    }

    // Get contacts from WhatsApp
    const allContacts = await searchContacts(search)

    // Get current group members to exclude them
    let excludeIds: Set<string> = new Set()
    if (excludeGroupId) {
      try {
        const participants = await getGroupParticipants(excludeGroupId)
        excludeIds = new Set(participants.map(p => p.id))
      } catch {
        // Group might not exist or not accessible
      }
    }

    // Filter out existing group members
    const contacts = allContacts.filter(c => !excludeIds.has(c.id))

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error('Search contacts error:', error)
    return NextResponse.json(
      { error: 'Failed to search contacts' },
      { status: 500 }
    )
  }
}
