import { after } from 'next/server'
import { prisma } from '@/lib/db'
import { EmailStatusUnknownError, getEmailSender, sendEmailViaResend } from '@/lib/email'
import { CLASS5_REMINDER_EMAIL_FROM } from '@/lib/class5-payment-reminder-email'
import {
  ONLINE_PAYMENT_INVOICE_EMAIL_MESSAGE_TYPE,
  ONLINE_PAYMENT_INVOICE_EMAIL_PREFERENCE_KEY,
  deliverOnlinePaymentInvoiceEmail,
  registrationInvoiceTag,
  type OnlinePaymentInvoiceEmailReceipt,
  type OnlinePaymentInvoiceEmailResult,
  type OnlinePaymentInvoiceSnapshot,
} from '@/lib/online-payment-invoice-email'

export async function isInvoiceEmailAfterOnlinePaymentEnabled(): Promise<boolean> {
  try {
    const row = await prisma.appPreference.findUnique({
      where: { key: ONLINE_PAYMENT_INVOICE_EMAIL_PREFERENCE_KEY },
    })
    return row?.value === '1'
  } catch (error) {
    console.error('[OnlinePaymentInvoiceEmail] Setting read failed, leaving receipt emails off:', error)
    return false
  }
}

// Same sender as the Class 5 reminder. No API key means we are not ready:
// leave the invoice unclaimed so a later confirmation retry can send.
async function receiptFromAddress(): Promise<string | null> {
  if (!process.env.RESEND_API_KEY) return null
  try {
    const sender = await getEmailSender()
    if (sender?.from) return sender.from
  } catch (error) {
    console.error('[OnlinePaymentInvoiceEmail] Sender lookup failed:', error)
  }
  return CLASS5_REMINDER_EMAIL_FROM
}

function toSnapshot(row: {
  id: string
  invoiceNumber: string
  studentName: string
  studentEmail: string | null
  invoiceDate: string
  total: number
  paymentStatus: string
  paymentMethod: string | null
  cloverPaid: boolean
  notes: string | null
}): OnlinePaymentInvoiceSnapshot {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    invoiceDate: row.invoiceDate,
    total: row.total,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    cloverPaid: row.cloverPaid,
    notes: row.notes,
  }
}

function toReceipt(row: {
  invoiceId: string
  eligibleAt: Date
  claimedAt: Date | null
  sentAt: Date | null
}): OnlinePaymentInvoiceEmailReceipt {
  return {
    invoiceId: row.invoiceId,
    eligibleAt: row.eligibleAt,
    claimedAt: row.claimedAt,
    sentAt: row.sentAt,
  }
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002'
}

async function findInvoice(input: { registrationId: string; invoiceId?: string }): Promise<OnlinePaymentInvoiceSnapshot | null> {
  const tag = registrationInvoiceTag(input.registrationId)
  if (input.invoiceId) {
    const row = await prisma.invoice.findUnique({ where: { id: input.invoiceId } })
    if (!row?.notes?.includes(tag)) return null
    return toSnapshot(row)
  }
  const row = await prisma.invoice.findFirst({
    where: { notes: { contains: tag } },
    orderBy: { createdAt: 'desc' },
  })
  return row ? toSnapshot(row) : null
}

export async function deliverOnlinePaymentInvoiceEmailFromDb(input: {
  registrationId: string
  invoiceId?: string
  justConfirmed: boolean
}): Promise<OnlinePaymentInvoiceEmailResult> {
  let providerId: string | undefined
  let statusUnknown = false
  return deliverOnlinePaymentInvoiceEmail({
    isEnabled: isInvoiceEmailAfterOnlinePaymentEnabled,
    getFromAddress: receiptFromAddress,
    findInvoice,
    findReceipt: async (invoiceId) => {
      const row = await prisma.onlinePaymentInvoiceEmail.findUnique({ where: { invoiceId } })
      return row ? toReceipt(row) : null
    },
    arm: async (invoiceId, at) => {
      try {
        const created = await prisma.onlinePaymentInvoiceEmail.create({
          data: { invoiceId, eligibleAt: at },
        })
        return toReceipt(created)
      } catch (error) {
        if (!isUniqueConflict(error)) throw error
        const existing = await prisma.onlinePaymentInvoiceEmail.findUnique({ where: { invoiceId } })
        if (existing) return toReceipt(existing)
        throw error
      }
    },
    claim: async (invoiceId, at, staleBefore) => {
      const claimed = await prisma.onlinePaymentInvoiceEmail.updateMany({
        where: {
          invoiceId,
          sentAt: null,
          OR: [
            { claimedAt: null },
            { claimedAt: { lt: staleBefore } },
          ],
        },
        data: { claimedAt: at },
      })
      return claimed.count === 1
    },
    markSent: async (invoiceId, at) => {
      await prisma.onlinePaymentInvoiceEmail.update({
        where: { invoiceId },
        data: { sentAt: at },
      })
    },
    release: async (invoiceId, claimedAt) => {
      await prisma.onlinePaymentInvoiceEmail.updateMany({
        where: { invoiceId, sentAt: null, claimedAt },
        data: { claimedAt: null },
      })
    },
    renderPdf: async (invoice) => {
      const { renderStoredInvoicePdf } = await import('@/lib/online-payment-invoice-pdf')
      return renderStoredInvoicePdf(invoice.id)
    },
    send: async (message) => {
      const data = await sendEmailViaResend({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: [{ filename: message.attachment.filename, content: message.attachment.content }],
      }).catch((error) => {
        statusUnknown = error instanceof EmailStatusUnknownError
        throw error
      })
      console.log(`[OnlinePaymentInvoiceEmail] Sent ${message.attachment.filename} to ${message.to}, id: ${data?.id}`)
      providerId = typeof data?.id === 'string' ? data.id : undefined
    },
    logSend: async (entry) => {
      await prisma.invoiceEmailAttempt.create({ data: {
        invoiceId: entry.invoiceId,
        recipient: entry.email,
        source: 'online-payment',
        status: statusUnknown ? 'unknown' : entry.status,
        sentAt: entry.status === 'sent' ? new Date() : null,
        providerId,
        error: entry.error?.slice(0, 500) || null,
      } }).catch((error) => console.error('[OnlinePaymentInvoiceEmail] Could not save invoice history:', error))
      await prisma.messageLog.create({
        data: {
          type: ONLINE_PAYMENT_INVOICE_EMAIL_MESSAGE_TYPE,
          to: entry.email,
          toName: entry.name,
          message: entry.message.slice(0, 500),
          status: entry.status,
          error: entry.error ? entry.error.slice(0, 500) : null,
        },
      })
    },
  }, input)
}

/**
 * Schedule the receipt email without delaying or failing payment confirmation.
 * `after` keeps the work alive once the response has been sent. If that hook
 * is unavailable, the send still runs and its errors are logged.
 */
export function scheduleOnlinePaymentInvoiceEmail(input: {
  registrationId: string
  invoiceId?: string
  justConfirmed: boolean
}) {
  const run = () => deliverOnlinePaymentInvoiceEmailFromDb(input).catch((error) => {
    console.error('[OnlinePaymentInvoiceEmail] Failed:', error)
  })
  try {
    after(run)
  } catch (error) {
    console.error('[OnlinePaymentInvoiceEmail] Could not keep the send alive after the response:', error)
    void run()
  }
}
