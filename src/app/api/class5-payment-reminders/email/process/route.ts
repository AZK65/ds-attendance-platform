import { NextResponse } from 'next/server'
import { runClass5PaymentReminderEmails } from '@/lib/class5-payment-reminder-email-job'

// Called on an interval from instrumentation.ts. Separate from the WhatsApp
// route so a disconnected WhatsApp client cannot block the email.
export async function POST() {
  try {
    const result = await runClass5PaymentReminderEmails()
    if (result.sent > 0 || result.failed > 0) {
      console.log(`[Class5ReminderEmail] sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`)
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Class5ReminderEmail] Run failed:', error)
    return NextResponse.json({ error: 'Failed to process payment reminder emails' }, { status: 500 })
  }
}
