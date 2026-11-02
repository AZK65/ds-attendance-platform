import { prisma } from '@/lib/db'
import { getDepositCents } from '@/lib/pricing'
import { getEmailSender, sendEmailViaResend } from '@/lib/email'
import {
  CLASS5_REMINDER_EMAIL_FROM,
  CLASS5_PAYMENT_REMINDER_EMAIL_PREFERENCE_KEY,
  CLASS5_REMINDER_EMAIL_MESSAGE_TYPE,
  outgoingEmailCoversRegistration,
  processClass5PaymentReminderEmails,
  type Class5ReminderEmailRegistration,
  type Class5ReminderEmailRunResult,
} from '@/lib/class5-payment-reminder-email'
import { HAND_MESSAGED_CLASS5_REGISTRATION_IDS } from '@/lib/class5-payment-reminder'

const candidateSelect = {
  id: true,
  vehicleType: true,
  status: true,
  fullName: true,
  email: true,
  paymentStatus: true,
  paymentCapturedAt: true,
  paymentReturnToken: true,
  paymentCheckoutCreatedAt: true,
  paymentReminderEmailSentAt: true,
  createdAt: true,
} as const

export async function isClass5PaymentReminderEmailEnabled(): Promise<boolean> {
  try {
    const row = await prisma.appPreference.findUnique({
      where: { key: CLASS5_PAYMENT_REMINDER_EMAIL_PREFERENCE_KEY },
    })
    return row?.value === '1'
  } catch (error) {
    console.error('[Class5ReminderEmail] Setting read failed, leaving email reminders off:', error)
    return false
  }
}

// Invoice mail uses getEmailSender() (school name + the Resend sender on file).
// When that row is empty, use the school's address those emails are sent from.
// No API key means we are not ready: leave the registration unclaimed and retry
// on a later run instead of recording a failed send.
async function reminderFromAddress(): Promise<string | null> {
  if (!process.env.RESEND_API_KEY) return null
  try {
    const sender = await getEmailSender()
    if (sender?.from) return sender.from
  } catch (error) {
    console.error('[Class5ReminderEmail] Sender lookup failed:', error)
  }
  return CLASS5_REMINDER_EMAIL_FROM
}

export async function runClass5PaymentReminderEmails(now = new Date()): Promise<Class5ReminderEmailRunResult> {
  return processClass5PaymentReminderEmails({
    now,
    isEnabled: isClass5PaymentReminderEmailEnabled,
    getFromAddress: reminderFromAddress,
    listCandidates: async ({ createdAfter, createdBefore }) => {
      const rows = await prisma.studentRegistration.findMany({
        where: {
          vehicleType: 'car',
          status: 'submitted',
          paymentReminderEmailSentAt: null,
          paymentCapturedAt: null,
          paymentReturnToken: { not: null },
          email: { not: null },
          createdAt: { gt: createdAfter, lte: createdBefore },
          paymentStatus: { in: ['checkout_pending', 'failed'] },
          id: { notIn: [...HAND_MESSAGED_CLASS5_REGISTRATION_IDS] },
        },
        select: candidateSelect,
        orderBy: { createdAt: 'asc' },
        take: 25,
      })
      return rows as Class5ReminderEmailRegistration[]
    },
    wasAlreadyEmailed: async (reg, retryUrl) => {
      const logs = await prisma.messageLog.findMany({
        where: {
          status: 'sent',
          OR: [
            { message: { contains: reg.id } },
            { message: { contains: 'payment=failure' } },
          ],
        },
        select: { status: true, to: true, message: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return logs.some(log => outgoingEmailCoversRegistration({
        status: log.status,
        to: log.to,
        message: log.message,
        email: reg.email || '',
        registrationId: reg.id,
        retryUrl,
      }))
    },
    claim: async (id, claimedAt) => {
      const claimed = await prisma.studentRegistration.updateMany({
        where: {
          id,
          paymentReminderEmailSentAt: null,
          paymentCapturedAt: null,
          vehicleType: 'car',
          status: 'submitted',
        },
        data: { paymentReminderEmailSentAt: claimedAt },
      })
      return claimed.count === 1
    },
    release: async (id) => {
      await prisma.studentRegistration.updateMany({
        where: { id, paymentReminderEmailSentAt: { not: null } },
        data: { paymentReminderEmailSentAt: null },
      })
    },
    send: (message) => sendEmailViaResend({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    logSend: async (entry) => {
      await prisma.messageLog.create({
        data: {
          type: CLASS5_REMINDER_EMAIL_MESSAGE_TYPE,
          to: entry.email,
          toName: entry.name,
          message: entry.message.slice(0, 500),
          status: entry.status,
          error: entry.error ? entry.error.slice(0, 500) : null,
        },
      })
    },
    depositCents: () => getDepositCents('car'),
  })
}
