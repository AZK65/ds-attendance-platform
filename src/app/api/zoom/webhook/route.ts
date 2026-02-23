import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  handleMeetingStarted,
  handleMeetingEnded,
  handleParticipantJoined,
  handleParticipantLeft
} from '@/lib/zoom/live-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const event = body.event as string

    // CRC validation — Zoom sends this to verify the endpoint
    if (event === 'endpoint.url_validation') {
      const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN
      if (!secretToken) {
        console.error('[Webhook] ZOOM_WEBHOOK_SECRET_TOKEN not set')
        return NextResponse.json({ error: 'Secret token not configured' }, { status: 500 })
      }

      const plainToken = body.payload.plainToken as string
      const encryptedToken = crypto
        .createHmac('sha256', secretToken)
        .update(plainToken)
        .digest('hex')

      return NextResponse.json({ plainToken, encryptedToken })
    }

    // Verify webhook signature
    const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN
    if (secretToken) {
      const signature = request.headers.get('x-zm-signature')
      const timestamp = request.headers.get('x-zm-request-timestamp')

      if (signature && timestamp) {
        const message = `v0:${timestamp}:${JSON.stringify(body)}`
        const expectedSignature = `v0=${crypto
          .createHmac('sha256', secretToken)
          .update(message)
          .digest('hex')}`

        if (signature !== expectedSignature) {
          console.error('[Webhook] Invalid signature')
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }
      }
    }

    console.log(`[Webhook] Received event: ${event}`)

    // Route events to the live store
    switch (event) {
      case 'meeting.started':
        handleMeetingStarted(body.payload)
        break
      case 'meeting.ended':
        handleMeetingEnded(body.payload)
        break
      case 'meeting.participant_joined':
        handleParticipantJoined(body.payload)
        break
      case 'meeting.participant_left':
        handleParticipantLeft(body.payload)
        break
      default:
        console.log(`[Webhook] Unhandled event: ${event}`)
    }

    // Zoom requires a quick 200 response
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ status: 'ok' }) // Still return 200 to avoid Zoom retries
  }
}
