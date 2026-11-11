import { NextResponse } from 'next/server'
import { runClass5PaymentReminders } from '@/lib/class5-payment-reminder-job'

// Called on an interval from instrumentation.ts. Middleware only accepts
// the INTERNAL_AUTH_SECRET header from this server, so a public caller
// cannot start a send.
export async function POST() {
  try {
    const result = await runClass5PaymentReminders()
    if (result.sent > 0 || result.failed > 0) {
      console.log(`[Class5Reminder] sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`)
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Class5Reminder] Run failed:', error)
    return NextResponse.json({ error: 'Failed to process payment reminders' }, { status: 500 })
  }
}
