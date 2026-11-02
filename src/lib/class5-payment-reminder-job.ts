import { prisma } from '@/lib/db'
import { getDepositCents } from '@/lib/pricing'
import { getWhatsAppState, sendPrivateMessage } from '@/lib/whatsapp/client'
import { pauseForAdminReply } from '@/lib/bot/handle-message'
import {
  CLASS5_PAYMENT_REMINDER_PREFERENCE_KEY,
  CLASS5_REMINDER_MESSAGE_TYPE,
  HAND_MESSAGED_CLASS5_REGISTRATION_IDS,
  outgoingMessageCoversRegistration,
  processClass5PaymentReminders,
  type Class5ReminderRegistration,
  type Class5ReminderRunResult,
} from '@/lib/class5-payment-reminder'

const candidateSelect = {
  id: true,
  vehicleType: true,
  status: true,
  fullName: true,
  phoneNumber: true,
  paymentStatus: true,
  paymentCapturedAt: true,
  paymentReturnToken: true,
  paymentCheckoutCreatedAt: true,
  paymentReminderSentAt: true,
  createdAt: true,
} as const

export async function isClass5PaymentReminderEnabled(): Promise<boolean> {
  try {
    const row = await prisma.appPreference.findUnique({
      where: { key: CLASS5_PAYMENT_REMINDER_PREFERENCE_KEY },
    })
    return row?.value === '1'
  } catch (error) {
    console.error('[Class5Reminder] Setting read failed, leaving reminders off:', error)
    return false
  }
}

// Sends through the same private-message helper the admin inbox uses.
// sendPrivateMessage does not mark the body as a bot reply, so the WhatsApp
// client's outbound listener applies the 24-hour bot pause. pauseForAdminReply
// records that pause in this turn as well, in case the event arrives late.
export async function runClass5PaymentReminders(now = new Date()): Promise<Class5ReminderRunResult> {
  return processClass5PaymentReminders({
    now,
    isEnabled: isClass5PaymentReminderEnabled,
    isWhatsAppConnected: () => getWhatsAppState().isConnected,
    listCandidates: async ({ createdAfter, createdBefore }) => {
      const rows = await prisma.studentRegistration.findMany({
        where: {
          vehicleType: 'car',
          status: 'submitted',
          paymentReminderSentAt: null,
          paymentCapturedAt: null,
          paymentReturnToken: { not: null },
          phoneNumber: { not: null },
          createdAt: { gt: createdAfter, lte: createdBefore },
          paymentStatus: { in: ['checkout_pending', 'failed'] },
          id: { notIn: [...HAND_MESSAGED_CLASS5_REGISTRATION_IDS] },
        },
        select: candidateSelect,
        orderBy: { createdAt: 'asc' },
        take: 25,
      })
      return rows as Class5ReminderRegistration[]
    },
    wasAlreadyMessaged: async (reg, retryUrl) => {
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
      return logs.some(log => outgoingMessageCoversRegistration({
        status: log.status,
        to: log.to,
        message: log.message,
        phoneNumber: reg.phoneNumber || '',
        registrationId: reg.id,
        retryUrl,
      }))
    },
    claim: async (id, claimedAt) => {
      const claimed = await prisma.studentRegistration.updateMany({
        where: {
          id,
          paymentReminderSentAt: null,
          paymentCapturedAt: null,
          vehicleType: 'car',
          status: 'submitted',
        },
        data: { paymentReminderSentAt: claimedAt },
      })
      return claimed.count === 1
    },
    release: async (id) => {
      await prisma.studentRegistration.updateMany({
        where: { id, paymentReminderSentAt: { not: null } },
        data: { paymentReminderSentAt: null },
      })
    },
    send: (phone, message) => sendPrivateMessage(phone, message),
    pauseBot: (phone) => pauseForAdminReply(phone),
    logSend: async (entry) => {
      await prisma.messageLog.create({
        data: {
          type: CLASS5_REMINDER_MESSAGE_TYPE,
          to: entry.phone,
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
