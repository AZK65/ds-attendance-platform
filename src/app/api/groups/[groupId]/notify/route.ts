import { NextRequest } from 'next/server'
import { sendPrivateMessage, getGroupParticipants } from '@/lib/whatsapp/client'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)

  let body: { module: number; time: string; memberPhones: string[]; message?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { module: moduleNum, time, memberPhones, message: customMessage } = body

  if (!moduleNum || !time || !memberPhones || memberPhones.length === 0) {
    return new Response(JSON.stringify({ error: 'module, time, and memberPhones are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Build the message
  const message = customMessage || `Reminder: Module ${moduleNum} class will be from ${time}. Please make sure to put your full name when joining the Zoom class. Invite Link: https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09 — Password: qazi`

  // Get participant names for the log
  let participantMap: Map<string, string> = new Map()
  try {
    const participants = await getGroupParticipants(decodedGroupId)
    for (const p of participants) {
      participantMap.set(p.phone, p.name || p.pushName || p.phone)
    }
  } catch {
    // If we can't get participants, just use phone numbers
  }

  // Stream results using SSE-style newline-delimited JSON
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0
      let failed = 0

      for (const phone of memberPhones) {
        const name = participantMap.get(phone) || phone
        try {
          await sendPrivateMessage(phone, message)
          sent++
          controller.enqueue(encoder.encode(
            JSON.stringify({ phone, name, status: 'sent' }) + '\n'
          ))
        } catch (error) {
          failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          controller.enqueue(encoder.encode(
            JSON.stringify({ phone, name, status: 'failed', error: errorMsg }) + '\n'
          ))
        }

        // Small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500))
      }

      // Send summary
      controller.enqueue(encoder.encode(
        JSON.stringify({ type: 'summary', sent, failed, total: memberPhones.length }) + '\n'
      ))
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache'
    }
  })
}
