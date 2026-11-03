import {
  CLASS5_REMINDER_MIN_AGE_MS,
  CLASS5_REMINDER_MAX_AGE_MS,
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

export interface Class5ReminderEmailRegistration {
  id: string
  vehicleType: string | null
  status: string
  fullName: string | null
  email: string | null
  paymentStatus: string | null
  paymentAmount: number | null
  paymentCapturedAt: Date | null
  paymentReturnToken: string | null
  paymentCheckoutCreatedAt: Date | null
  paymentReminderEmailSentAt: Date | null
  createdAt: Date
}

// Address and phone stored for certificates and the school knowledge base.
export const CLASS5_REMINDER_SCHOOL_ADDRESS = '786 rue Jean-Talon Ouest, Montréal, QC H3N 1S2'
export const CLASS5_REMINDER_SCHOOL_PHONE = '(514) 274-6948'

// A label only when the cents value is a real deposit. The literal "$250"
// fallback used in the sentence is not treated as a known amount.
export function knownFirstPaymentLabel(cents: number | null | undefined): string | null {
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents <= 0 || cents > 1_000_000) return null
  return formatClass5FirstPaymentLabel(cents)
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

// Plain text carries the approved wording, split into short paragraphs, plus
// the link. HTML keeps those words and puts the link on the button.
export function buildClass5PaymentReminderEmail(input: {
  firstName: string
  amountLabel: string
  knownAmountLabel?: string | null
  retryUrl: string
}): Class5PaymentReminderEmail {
  const known = input.knownAmountLabel?.trim() || null
  const buttonLabel = 'Complete payment to Register'
  const summary = known
    ? `Class 5 registration · First payment ${known}`
    : 'Class 5 registration'
  const safeUrl = escapeHtml(input.retryUrl)
  const safeButton = escapeHtml(buttonLabel)
  const safeSummary = escapeHtml(summary)
  const safeName = escapeHtml(input.firstName)
  const safeAmount = escapeHtml(input.amountLabel)
  const ink = CLASS5_REMINDER_BRAND.ink
  const blue = CLASS5_REMINDER_BRAND.blue
  const muted = '#6b7280'
  const text = [
    `Hi ${input.firstName},`,
    '',
    `This is Qazi Driving School. We saw your Class 5 registration but the first ${input.amountLabel} payment didn't go through.`,
    '',
    'If you couldn\'t pay, you can use this link:',
    input.retryUrl,
    '',
    'Let us know if you have any issues.',
    '',
    'Qazi Driving School',
    CLASS5_REMINDER_SCHOOL_ADDRESS,
    CLASS5_REMINDER_SCHOOL_PHONE,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(CLASS5_PAYMENT_REMINDER_EMAIL_SUBJECT)}</title>
<style>
  @media screen and (max-width: 480px) {
    .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f5f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e6ebf1;border-radius:8px;">
          <tr>
            <td class="email-pad" align="center" style="padding:40px 40px 8px;background:#ffffff;">
              <img src="${CLASS5_REMINDER_EMAIL_LOGO_URL}" alt="Qazi Driving School" width="220" style="display:block;width:220px;max-width:80%;height:auto;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:28px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${ink};">
              <p style="margin:0 0 16px;">Hi ${safeName},</p>
              <p style="margin:0 0 16px;">This is Qazi Driving School. We saw your Class 5 registration but the first ${safeAmount} payment didn't go through.</p>
              <p style="margin:0;">If you couldn't pay, you can use this link.</p>
            </td>
          </tr>
          <tr>
            <td class="email-pad" align="center" style="padding:28px 40px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="${blue}" style="background:${blue};border-radius:6px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="8%" strokecolor="${blue}" fillcolor="${blue}">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${safeButton}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.2;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;background:${blue};white-space:nowrap;">${safeButton}</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" align="center" style="padding:8px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:12px 16px;background:#f4f5f8;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${CLASS5_REMINDER_BRAND.muted};">
                    ${safeSummary}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:20px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${ink};">
              <p style="margin:0;">Let us know if you have any issues.</p>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:28px 40px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${muted};">
              Qazi Driving School<br>
              ${escapeHtml(CLASS5_REMINDER_SCHOOL_ADDRESS)}<br>
              ${escapeHtml(CLASS5_REMINDER_SCHOOL_PHONE)}
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:8px 40px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#9aa1ab;">
              Button not working? Copy this link:<br>
              <a href="${safeUrl}" style="color:#9aa1ab;text-decoration:underline;word-break:break-all;">${safeUrl}</a>
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

  let settingCents: number | null = null
  try {
    settingCents = await deps.depositCents()
  } catch (error) {
    console.error('[Class5ReminderEmail] Pricing read failed, using $250 in the sentence only:', error)
  }
  const amountLabel = formatClass5FirstPaymentLabel(settingCents)

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

    const knownAmountLabel = knownFirstPaymentLabel(reg.paymentAmount) ?? knownFirstPaymentLabel(settingCents)
    const built = buildClass5PaymentReminderEmail({ firstName, amountLabel, knownAmountLabel, retryUrl })
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
