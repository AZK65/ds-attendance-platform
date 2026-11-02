import { normalizeNorthAmericanPhone, samePhone } from './phone-normalize'

// One automatic WhatsApp reminder for an unpaid Class 5 (car) registration.
// The checkout that created the return token lives in
// src/app/api/register/checkout/route.ts. The marketing site (qazidriving.ca)
// reads payment, registration, and token on both /en/register and /inscription
// and opens the payment step so "Continue to Clover" starts a fresh session.

export const CLASS5_PAYMENT_REMINDER_PREFERENCE_KEY = 'class5PaymentReminderEnabled'
export const CLASS5_REMINDER_MIN_AGE_MS = 20 * 60 * 1000
export const CLASS5_REMINDER_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const CLASS5_REMINDER_MESSAGE_TYPE = 'class5-payment-reminder'

// Messaged by hand on Nov 1, 2026 around 9:32 PM EST. The inbox log keeps only
// the first 200 characters, which can cut the registration id off the link,
// so the age window and the message-log rule are not enough on their own.
export const HAND_MESSAGED_CLASS5_REGISTRATION_IDS = [
  'cmvymdw1g0efjac1bwi6msvdu',
  'cmvx4gqjq17a2oe3z9t32jhwu',
] as const

const HAND_MESSAGED_IDS = new Set<string>(HAND_MESSAGED_CLASS5_REGISTRATION_IDS)

const CLOSED_STATUSES = new Set([
  'confirmed',
  'approved',
  'cancelled',
  'canceled',
  'rejected',
])

const PAID_OR_HELD_STATUSES = new Set([
  'captured',
  'authorized',
  'cash-paid',
  'cash-pending',
  'card-pending',
  'voided',
])

// checkout_pending is the hosted-checkout state. failed is the unpaid card
// result the admin review already treats as "payment didn't go through".
const UNPAID_CHECKOUT_STATUSES = new Set(['checkout_pending', 'failed'])

const LITERAL_FIRST_PAYMENT = '$250'
const MAX_CLEAN_DEPOSIT_CENTS = 1_000_000

export interface Class5ReminderRegistration {
  id: string
  vehicleType: string | null
  status: string
  fullName: string | null
  phoneNumber: string | null
  paymentStatus: string | null
  paymentCapturedAt: Date | null
  paymentReturnToken: string | null
  paymentCheckoutCreatedAt: Date | null
  paymentReminderSentAt: Date | null
  createdAt: Date
}

export type Class5ReminderSkipReason =
  | 'already-sent'
  | 'hand-messaged'
  | 'not-class-5'
  | 'closed'
  | 'not-submitted'
  | 'paid-or-captured'
  | 'not-unpaid-checkout'
  | 'too-new'
  | 'too-old'
  | 'checkout-still-open'
  | 'missing-phone'
  | 'invalid-phone'
  | 'missing-token'
  | 'missing-name'

export function marketingSiteBase(raw?: string | null): string {
  const value = (raw ?? process.env.MARKETING_SITE_URL ?? '').trim()
  return (value || 'https://qazidriving.ca').replace(/\/+$/, '')
}

// Same query names the marketing registration page already reads. The token
// is StudentRegistration.paymentReturnToken, not a new secret.
export function class5PaymentRetryUrl(
  registrationId: string,
  returnToken: string,
  base?: string | null,
): string {
  const params = new URLSearchParams({
    payment: 'failure',
    registration: registrationId,
    token: returnToken,
  })
  return `${marketingSiteBase(base)}/en/register?${params.toString()}`
}

export function registrationFirstName(fullName: string | null | undefined): string | null {
  const first = (fullName || '').trim().split(/\s+/)[0] || ''
  if (!first || !/\p{L}/u.test(first)) return null
  return first.slice(0, 40)
}

// Class 5 deposit from Settings → Pricing, the same figure checkout charges.
// A missing or unusable value keeps the literal "$250" from the template.
export function formatClass5FirstPaymentLabel(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isInteger(cents)) return LITERAL_FIRST_PAYMENT
  if (cents <= 0 || cents > MAX_CLEAN_DEPOSIT_CENTS) return LITERAL_FIRST_PAYMENT
  const dollars = cents / 100
  if (Number.isInteger(dollars)) return `$${dollars}`
  return `$${dollars.toFixed(2)}`
}

export function buildClass5PaymentReminderMessage(input: {
  firstName: string
  amountLabel: string
  retryUrl: string
}): string {
  return `Hi ${input.firstName}, this is Qazi Driving School. We saw your Class 5 registration but the first ${input.amountLabel} payment didn't go through. If you couldn't pay, you can use this link: ${input.retryUrl}. Let us know if you have any issues.`
}

export function class5ReminderSkipReason(
  reg: Class5ReminderRegistration,
  now: Date,
): Class5ReminderSkipReason | null {
  if (HAND_MESSAGED_IDS.has(reg.id)) return 'hand-messaged'
  if (reg.paymentReminderSentAt) return 'already-sent'
  if (reg.vehicleType !== 'car') return 'not-class-5'
  if (CLOSED_STATUSES.has(reg.status)) return 'closed'
  if (reg.status !== 'submitted') return 'not-submitted'
  if (reg.paymentCapturedAt) return 'paid-or-captured'
  const paymentStatus = reg.paymentStatus || ''
  if (PAID_OR_HELD_STATUSES.has(paymentStatus)) return 'paid-or-captured'
  if (!UNPAID_CHECKOUT_STATUSES.has(paymentStatus)) return 'not-unpaid-checkout'

  const age = now.getTime() - reg.createdAt.getTime()
  if (age < CLASS5_REMINDER_MIN_AGE_MS) return 'too-new'
  if (age >= CLASS5_REMINDER_MAX_AGE_MS) return 'too-old'
  if (reg.paymentCheckoutCreatedAt) {
    const checkoutAge = now.getTime() - reg.paymentCheckoutCreatedAt.getTime()
    if (checkoutAge < CLASS5_REMINDER_MIN_AGE_MS) return 'checkout-still-open'
  }

  if (!reg.phoneNumber?.trim()) return 'missing-phone'
  if (!normalizeNorthAmericanPhone(reg.phoneNumber)) return 'invalid-phone'
  const token = reg.paymentReturnToken?.trim() || ''
  if (!/^[A-Fa-f0-9]{16,128}$/.test(token)) return 'missing-token'
  if (!registrationFirstName(reg.fullName)) return 'missing-name'
  return null
}

export function outgoingMessageCoversRegistration(input: {
  status: string | null | undefined
  to: string | null | undefined
  message: string | null | undefined
  phoneNumber: string
  registrationId: string
  retryUrl: string
}): boolean {
  if (input.status !== 'sent') return false
  if (!samePhone(input.to, input.phoneNumber)) return false
  const message = input.message || ''
  if (!message) return false
  if (message.includes(input.registrationId)) return true
  if (message.includes(`registration=${input.registrationId}`)) return true
  if (input.retryUrl && message.includes(input.retryUrl)) return true
  // The full retry link, or the part the admin inbox keeps. That log stores
  // only the first 200 characters, which can slice the URL at "?payme".
  if (message.includes('payment=failure')) return true
  if (message.includes('/en/register?pay') || message.includes('/inscription?pay')) return true
  return false
}

export interface Class5ReminderSendLog {
  phone: string
  name: string | null
  registrationId: string
  message: string
  status: 'sent' | 'failed'
  error?: string
}

export interface Class5ReminderDeps {
  now?: Date
  isEnabled: () => Promise<boolean> | boolean
  isWhatsAppConnected: () => Promise<boolean> | boolean
  listCandidates: (window: { createdAfter: Date; createdBefore: Date }) => Promise<Class5ReminderRegistration[]>
  wasAlreadyMessaged: (reg: Class5ReminderRegistration, retryUrl: string) => Promise<boolean>
  claim: (id: string, claimedAt: Date) => Promise<boolean>
  release: (id: string, claimedAt: Date) => Promise<void>
  send: (phone: string, message: string) => Promise<void>
  pauseBot: (phone: string) => Promise<void>
  logSend: (entry: Class5ReminderSendLog) => Promise<void>
  depositCents: () => Promise<number | null>
}

export interface Class5ReminderRunResult {
  enabled: boolean
  connected: boolean
  checked: number
  sent: number
  failed: number
  skipped: number
}

export async function processClass5PaymentReminders(
  deps: Class5ReminderDeps,
): Promise<Class5ReminderRunResult> {
  const enabled = await deps.isEnabled()
  if (!enabled) {
    return { enabled: false, connected: false, checked: 0, sent: 0, failed: 0, skipped: 0 }
  }
  const connected = await deps.isWhatsAppConnected()
  if (!connected) {
    return { enabled: true, connected: false, checked: 0, sent: 0, failed: 0, skipped: 0 }
  }

  const now = deps.now ?? new Date()
  const createdBefore = new Date(now.getTime() - CLASS5_REMINDER_MIN_AGE_MS)
  const createdAfter = new Date(now.getTime() - CLASS5_REMINDER_MAX_AGE_MS)
  const candidates = await deps.listCandidates({ createdAfter, createdBefore })

  let amountLabel = LITERAL_FIRST_PAYMENT
  try {
    amountLabel = formatClass5FirstPaymentLabel(await deps.depositCents())
  } catch (error) {
    console.error('[Class5Reminder] Pricing read failed, using $250:', error)
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const reg of candidates) {
    if (class5ReminderSkipReason(reg, now)) {
      skipped++
      continue
    }
    const phone = normalizeNorthAmericanPhone(reg.phoneNumber)
    const firstName = registrationFirstName(reg.fullName)
    const token = reg.paymentReturnToken?.trim() || ''
    if (!phone || !firstName || !token) {
      skipped++
      continue
    }
    const retryUrl = class5PaymentRetryUrl(reg.id, token)
    if (await deps.wasAlreadyMessaged(reg, retryUrl)) {
      skipped++
      continue
    }

    const claimedAt = new Date()
    const claimed = await deps.claim(reg.id, claimedAt)
    if (!claimed) {
      skipped++
      continue
    }

    const message = buildClass5PaymentReminderMessage({ firstName, amountLabel, retryUrl })
    try {
      await deps.send(phone.digits, message)
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error)
      try {
        await deps.release(reg.id, claimedAt)
      } catch (releaseError) {
        console.error('[Class5Reminder] Could not release claim', reg.id, releaseError)
      }
      try {
        await deps.logSend({
          phone: phone.digits,
          name: reg.fullName,
          registrationId: reg.id,
          message,
          status: 'failed',
          error: errorText,
        })
      } catch (logError) {
        console.error('[Class5Reminder] Could not log failed send', reg.id, logError)
      }
      failed++
      continue
    }

    // Delivery already happened. A pause or log failure must not clear the
    // claim, or the next run would send a second message.
    try {
      await deps.pauseBot(phone.digits)
    } catch (pauseError) {
      console.error('[Class5Reminder] Bot pause failed after send', reg.id, pauseError)
    }
    try {
      await deps.logSend({
        phone: phone.digits,
        name: reg.fullName,
        registrationId: reg.id,
        message,
        status: 'sent',
      })
    } catch (logError) {
      console.error('[Class5Reminder] Could not log sent reminder', reg.id, logError)
    }
    sent++
  }

  return { enabled: true, connected: true, checked: candidates.length, sent, failed, skipped }
}
