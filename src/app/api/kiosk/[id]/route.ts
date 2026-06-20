import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendToKiosk, broadcastKiosks } from '@/lib/kiosk-hub'

const COMMANDS = ['reset', 'lock', 'unlock', 'message', 'reload']

// POST /api/kiosk/[id] — send a command to the kiosk (authed)
// Body: { type: 'reset'|'lock'|'unlock'|'message'|'reload', message? }
// Pushes instantly over the kiosk's SSE stream; if it isn't connected, the
// command is stored and flushed when it reconnects.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json() as { type?: string; message?: string }
    if (!body.type || !COMMANDS.includes(body.type)) {
      return NextResponse.json({ error: 'Unknown command' }, { status: 400 })
    }
    const kiosk = await prisma.kiosk.findUnique({ where: { id } })
    if (!kiosk) return NextResponse.json({ error: 'Kiosk not found' }, { status: 404 })

    const command = {
      id: `cmd_${Date.now().toString(36)}`,
      type: body.type,
      ...(body.message ? { message: body.message } : {}),
    }

    const delivered = sendToKiosk(kiosk.kioskId, { type: 'command', command })
    // If not connected right now, persist so it's flushed on reconnect.
    await prisma.kiosk.update({
      where: { id },
      data: { pendingCommand: delivered ? null : JSON.stringify(command) },
    })
    broadcastKiosks().catch(() => {})
    return NextResponse.json({ ok: true, delivered, command })
  } catch (error) {
    console.error('Error queuing kiosk command:', error)
    return NextResponse.json({ error: 'Failed to queue command' }, { status: 500 })
  }
}

// PATCH /api/kiosk/[id] — rename (authed). Body: { name }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json() as { name?: string }
    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    const kiosk = await prisma.kiosk.update({ where: { id }, data: { name } })
    broadcastKiosks().catch(() => {})
    return NextResponse.json({ kiosk: { id: kiosk.id, name: kiosk.name } })
  } catch (error) {
    console.error('Error renaming kiosk:', error)
    return NextResponse.json({ error: 'Failed to rename kiosk' }, { status: 500 })
  }
}

// DELETE /api/kiosk/[id] — remove a kiosk entry (authed)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.kiosk.delete({ where: { id } })
    broadcastKiosks().catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting kiosk:', error)
    return NextResponse.json({ error: 'Failed to delete kiosk' }, { status: 500 })
  }
}
