import { NextResponse } from 'next/server'
import { forceSyncGroups, getWhatsAppState } from '@/lib/whatsapp/client'

export async function POST() {
  const initialState = getWhatsAppState()
  console.log('[/api/groups/sync] Force sync requested, initial state:', initialState)

  try {
    const result = await forceSyncGroups()

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Sync failed',
          wasConnected: initialState.isConnected,
          isConnected: getWhatsAppState().isConnected
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      groupCount: result.groupCount,
      wasConnected: initialState.isConnected,
      isConnected: getWhatsAppState().isConnected
    })
  } catch (error) {
    console.error('[/api/groups/sync] Error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}
