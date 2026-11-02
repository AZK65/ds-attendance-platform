import {
  CLASS5_REMINDER_MIN_AGE_MS,
  CLASS5_REMINDER_MAX_AGE_MS,
  buildClass5PaymentReminderMessage,
  class5PaymentRetryUrl,
  class5ReminderSkipReason,
  formatClass5FirstPaymentLabel,
  registrationFirstName,
  type Class5ReminderRegistration,
  type Class5ReminderSkipReason,
} from './class5-payment-reminder'

// One automatic email for an unpaid Class 5 checkout. Independent of the
// WhatsApp reminder: its own switch, its own sent timestamp, and it does not
// wait for WhatsApp to be connected.

export const CLASS5_PAYMENT_REMINDER_EMAIL_PREFERENCE_KEY = 'class5PaymentReminderEmailEnabled'
export const CLASS5_PAYMENT_REMINDER_EMAIL_SUBJECT = 'Your Qazi Driving School registration payment'
export const CLASS5_REMINDER_EMAIL_MESSAGE_TYPE = 'class5-payment-reminder-email'
export const CLASS5_REMINDER_EMAIL_FROM = 'Qazi Driving School <info@qazidriving.ca>'
// Same file invoices and the public site serve. Hosted so mail clients can load it.
export const CLASS5_REMINDER_EMAIL_LOGO_URL = 'https://qazidriving.ca/qazi-logo.png'
// Marketing site tokens: --color-brand-red, --color-brand-blue, --color-brand-green, --color-ink.
export const CLASS5_REMINDER_BRAND = {
  red: '#e32726',
  blue: '#1e3fcb',
  green: '#2fa94a',
  ink: '#0e1116',
  muted: '#3b4150',
  surface: '#f4f5f8',
  cream: '#fafaf7',
  rule: '#e5e7ec',
} as const

const LITERAL_FIRST_PAYMENT = '$250'

export interface Class5ReminderEmailRegistration {
  id: string
  vehicleType: string | null
  status: string
  fullName: string | null
  email: string | null
  paymentStatus: string | null
  paymentCapturedAt: Date | null
  paymentReturnToken: string | null
  paymentCheckoutCreatedAt: Date | null
  paymentReminderEmailSentAt: Date | null
  createdAt: Date
}

export type Class5ReminderEmailSkipReason = Class5ReminderSkipReason | 'missing-email'

export function normalizeReminderEmail(value: string | null | undefined): string | null {
  const email = (value || '').trim()
  if (!email || email.length > 254) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

// Same unpaid-checkout rules as the WhatsApp reminder, plus a usable email.
// A missing phone does not matter here, and a WhatsApp send does not count.
export function class5ReminderEmailSkipReason(
  reg: Class5ReminderEmailRegistration,
  now: Date,
): Class5ReminderEmailSkipReason | null {
  if (reg.paymentReminderEmailSentAt) return 'already-sent'
  const shared = class5ReminderSkipReason({
    id: reg.id,
    vehicleType: reg.vehicleType,
    status: reg.status,
    fullName: reg.fullName,
    phoneNumber: '15145550100',
    paymentStatus: reg.paymentStatus,
    paymentCapturedAt: reg.paymentCapturedAt,
    paymentReturnToken: reg.paymentReturnToken,
    paymentCheckoutCreatedAt: reg.paymentCheckoutCreatedAt,
    paymentReminderSentAt: null,
    createdAt: reg.createdAt,
  } satisfies Class5ReminderRegistration, now)
  if (shared) return shared
  if (!normalizeReminderEmail(reg.email)) return 'missing-email'
  return null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface Class5PaymentReminderEmail {
  subject: string
  text: string
  html: string
}

// Plain text stays the approved sentence. HTML adds the logo, the brand
// colours, and a payment button without changing those words.
export function buildClass5PaymentReminderEmail(input: {
  firstName: string
  amountLabel: string
  retryUrl: string
}): Class5PaymentReminderEmail {
  const text = buildClass5PaymentReminderMessage(input)
  const safeUrl = escapeHtml(input.retryUrl)
  const brand = CLASS5_REMINDER_BRAND
  const sentence = `Hi ${escapeHtml(input.firstName)}, this is Qazi Driving School. We saw your Class 5 registration but the first ${escapeHtml(input.amountLabel)} payment didn't go through. If you couldn't pay, you can use this link: <a href="${safeUrl}" style="color:${brand.blue};text-decoration:underline;">${safeUrl}</a>. Let us know if you have any issues.`
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(CLASS5_PAYMENT_REMINDER_EMAIL_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.surface};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.surface};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;">
          <tr>
            <td style="padding:0;font-size:0;line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="34%" height="8" style="background:${brand.red};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="33%" height="8" style="background:${brand.blue};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="33%" height="8" style="background:${brand.green};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 24px 4px;">
              <img src="${CLASS5_REMINDER_EMAIL_LOGO_URL}" alt="Qazi Driving School" width="168" style="display:block;width:168px;max-width:70%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${brand.ink};overflow-wrap:anywhere;">
              ${sentence}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" bgcolor="${brand.red}" style="border-radius:999px;background:${brand.red};">
                    <a href="${safeUrl}" style="display:block;padding:14px 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.3;font-weight:bold;color:#ffffff;text-decoration:none;">Complete your payment</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background:${brand.cream};border-top:1px solid ${brand.rule};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${brand.muted};">
              Qazi Driving School
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  return {
    subject: CLASS5_PAYMENT_REMINDER_EMAIL_SUBJECT,
    text,
    html,
  }
}

export function outgoingEmailCoversRegistration(input: {
  status: string | null | undefined
  to: string | null | undefined
  message: string | null | undefined
  email: string
  registrationId: string
  retryUrl: string
}): boolean {
  if (input.status !== 'sent') return false
  const to = normalizeReminderEmail(input.to)
  const email = normalizeReminderEmail(input.email)
  if (!to || !email || to.toLowerCase() !== email.toLowerCase()) return false
  const message = input.message || ''
  if (!message) return false
  if (message.includes(input.registrationId)) return true
  if (message.includes(`registration=${input.registrationId}`)) return true
  if (input.retryUrl && message.includes(input.retryUrl)) return true
  if (message.includes('payment=failure') && (message.includes('/en/register') || message.includes('/inscription'))) {
    return true
  }
  return false
}

export interface Class5ReminderEmailSendLog {
  email: string
  name: string | null
  registrationId: string
  message: string
  status: 'sent' | 'failed'
  error?: string
}

export interface Class5ReminderEmailContent {
  from: string
  to: string
  subject: string
  text: string
  html: string
}

export interface Class5ReminderEmailDeps {
  now?: Date
  isEnabled: () => Promise<boolean> | boolean
  getFromAddress: () => Promise<string | null>
  listCandidates: (window: { createdAfter: Date; createdBefore: Date }) => Promise<Class5ReminderEmailRegistration[]>
  wasAlreadyEmailed: (reg: Class5ReminderEmailRegistration, retryUrl: string) => Promise<boolean>
  claim: (id: string, claimedAt: Date) => Promise<boolean>
  release: (id: string) => Promise<void>
  send: (message: Class5ReminderEmailContent) => Promise<void>
  logSend: (entry: Class5ReminderEmailSendLog) => Promise<void>
  depositCents: () => Promise<number | null>
}

export interface Class5ReminderEmailRunResult {
  enabled: boolean
  ready: boolean
  checked: number
  sent: number
  failed: number
  skipped: number
}

export async function processClass5PaymentReminderEmails(
  deps: Class5ReminderEmailDeps,
): Promise<Class5ReminderEmailRunResult> {
  const enabled = await deps.isEnabled()
  if (!enabled) {
    return { enabled: false, ready: false, checked: 0, sent: 0, failed: 0, skipped: 0 }
  }
  const from = await deps.getFromAddress()
  if (!from) {
    return { enabled: true, ready: false, checked: 0, sent: 0, failed: 0, skipped: 0 }
  }

  const now = deps.now ?? new Date()
  const createdBefore = new Date(now.getTime() - CLASS5_REMINDER_MIN_AGE_MS)
  const createdAfter = new Date(now.getTime() - CLASS5_REMINDER_MAX_AGE_MS)
  const candidates = await deps.listCandidates({ createdAfter, createdBefore })

  let amountLabel = LITERAL_FIRST_PAYMENT
  try {
    amountLabel = formatClass5FirstPaymentLabel(await deps.depositCents())
  } catch (error) {
    console.error('[Class5ReminderEmail] Pricing read failed, using $250:', error)
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const reg of candidates) {
    if (class5ReminderEmailSkipReason(reg, now)) {
      skipped++
      continue
    }
    const email = normalizeReminderEmail(reg.email)
    const firstName = registrationFirstName(reg.fullName)
    const token = reg.paymentReturnToken?.trim() || ''
    if (!email || !firstName || !token) {
      skipped++
      continue
    }
    const retryUrl = class5PaymentRetryUrl(reg.id, token)
    if (await deps.wasAlreadyEmailed(reg, retryUrl)) {
      skipped++
      continue
    }

    const claimedAt = new Date()
    const claimed = await deps.claim(reg.id, claimedAt)
    if (!claimed) {
      skipped++
      continue
    }

    const built = buildClass5PaymentReminderEmail({ firstName, amountLabel, retryUrl })
    try {
      await deps.send({ from, to: email, subject: built.subject, text: built.text, html: built.html })
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error)
      try {
        await deps.release(reg.id)
      } catch (releaseError) {
        console.error('[Class5ReminderEmail] Could not release claim', reg.id, releaseError)
      }
      try {
        await deps.logSend({
          email,
          name: reg.fullName,
          registrationId: reg.id,
          message: built.text,
          status: 'failed',
          error: errorText,
        })
      } catch (logError) {
        console.error('[Class5ReminderEmail] Could not log failed send', reg.id, logError)
      }
      failed++
      continue
    }

    try {
      await deps.logSend({
        email,
        name: reg.fullName,
        registrationId: reg.id,
        message: `${built.subject}\n${built.text}`,
        status: 'sent',
      })
    } catch (logError) {
      console.error('[Class5ReminderEmail] Could not log sent reminder', reg.id, logError)
    }
    sent++
  }

  return { enabled: true, ready: true, checked: candidates.length, sent, failed, skipped }
}
