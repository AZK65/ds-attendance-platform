import { registrationFirstName } from './class5-payment-reminder'
import {
  CLASS5_REMINDER_BRAND,
  CLASS5_REMINDER_EMAIL_LOGO_URL,
  CLASS5_REMINDER_SCHOOL_ADDRESS,
  CLASS5_REMINDER_SCHOOL_PHONE,
  normalizeReminderEmail,
} from './class5-payment-reminder-email'

// One receipt email after a Clover hosted-checkout payment is confirmed.
// The switch defaults off. A database row is created only for a checkout
// confirmed while the switch is on, so older invoices are never emailed.

export const ONLINE_PAYMENT_INVOICE_EMAIL_PREFERENCE_KEY = 'invoiceEmailAfterOnlinePaymentEnabled'
export const ONLINE_PAYMENT_INVOICE_EMAIL_MESSAGE_TYPE = 'online-payment-invoice-email'

// Long enough for PDF generation and Resend to finish. A second callback
// during that window does not send again. A claim older than this, with no
// accepted send, can be taken over after a restart.
export const ONLINE_PAYMENT_INVOICE_EMAIL_CLAIM_LEASE_MS = 2 * 60 * 1000

const BRAND = CLASS5_REMINDER_BRAND

export interface OnlinePaymentInvoiceSnapshot {
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
}

export interface OnlinePaymentInvoiceEmailReceipt {
  invoiceId: string
  eligibleAt: Date
  claimedAt: Date | null
  sentAt: Date | null
}

export interface OnlinePaymentInvoiceEmailAttachment {
  filename: string
  content: string
}

export interface OnlinePaymentInvoiceEmailMessage {
  from: string
  to: string
  subject: string
  text: string
  html: string
  attachment: OnlinePaymentInvoiceEmailAttachment
}

export interface OnlinePaymentInvoiceEmailLog {
  email: string
  name: string | null
  invoiceId: string
  invoiceNumber: string
  message: string
  status: 'sent' | 'failed'
  error?: string
}

export interface OnlinePaymentInvoiceEmailDeps {
  now?: Date
  isEnabled: () => Promise<boolean> | boolean
  getFromAddress: () => Promise<string | null>
  findInvoice: (input: { registrationId: string; invoiceId?: string }) => Promise<OnlinePaymentInvoiceSnapshot | null>
  findReceipt: (invoiceId: string) => Promise<OnlinePaymentInvoiceEmailReceipt | null>
  arm: (invoiceId: string, at: Date) => Promise<OnlinePaymentInvoiceEmailReceipt>
  claim: (invoiceId: string, at: Date, staleBefore: Date) => Promise<boolean>
  markSent: (invoiceId: string, at: Date) => Promise<void>
  release: (invoiceId: string, claimedAt: Date) => Promise<void>
  renderPdf: (invoice: OnlinePaymentInvoiceSnapshot) => Promise<Buffer>
  send: (message: OnlinePaymentInvoiceEmailMessage) => Promise<void>
  logSend: (entry: OnlinePaymentInvoiceEmailLog) => Promise<void>
}

export interface OnlinePaymentInvoiceEmailResult {
  status: 'sent' | 'skipped' | 'failed'
  reason: string
}

export type OnlinePaymentInvoiceBlockReason =
  | 'not-registration-invoice'
  | 'not-paid'
  | 'not-online-checkout'
  | 'missing-email'

export function registrationInvoiceTag(registrationId: string): string {
  return `[auto:reg=${registrationId}]`
}

/**
 * Hosted checkout records a captured card charge: payment method "card",
 * cloverPaid, and the registration tag in the notes. Unpaid, failed,
 * refunded, cash, and hand-marked invoices fail this check.
 */
export function onlineCheckoutInvoiceBlockReason(
  invoice: OnlinePaymentInvoiceSnapshot,
  registrationId: string,
): OnlinePaymentInvoiceBlockReason | null {
  if (!invoice.notes?.includes(registrationInvoiceTag(registrationId))) return 'not-registration-invoice'
  if (invoice.paymentStatus !== 'paid') return 'not-paid'
  if (invoice.paymentMethod !== 'card' || invoice.cloverPaid !== true) return 'not-online-checkout'
  if (!normalizeReminderEmail(invoice.studentEmail)) return 'missing-email'
  return null
}

export function formatInvoiceAmountEn(total: number): string {
  return `$${total.toFixed(2)}`
}

export function formatInvoiceAmountFr(total: number): string {
  return `${total.toFixed(2).replace('.', ',')} $`
}

export function formatInvoiceDate(isoDate: string, locale: 'en-CA' | 'fr-CA'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date).replace(/[\u202f\u00a0]/g, ' ')
}

export function invoicePdfFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
  return `invoice-${safe || 'invoice'}.pdf`
}

export function onlinePaymentInvoiceEmailSubject(invoiceNumber: string): string {
  return `Payment received — Invoice ${invoiceNumber}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface OnlinePaymentInvoiceEmailContent {
  subject: string
  text: string
  html: string
}

export function buildOnlinePaymentInvoiceEmail(input: {
  studentName: string
  invoiceNumber: string
  total: number
  invoiceDate: string
}): OnlinePaymentInvoiceEmailContent {
  const firstName = registrationFirstName(input.studentName)
  const greetingEn = firstName ? `Hi ${firstName},` : 'Hi there,'
  const greetingFr = firstName ? `Bonjour ${firstName},` : 'Bonjour,'
  const amountEn = formatInvoiceAmountEn(input.total)
  const amountFr = formatInvoiceAmountFr(input.total)
  const dateEn = formatInvoiceDate(input.invoiceDate, 'en-CA')
  const dateFr = formatInvoiceDate(input.invoiceDate, 'fr-CA')
  const subject = onlinePaymentInvoiceEmailSubject(input.invoiceNumber)
  const safeNameEn = escapeHtml(greetingEn)
  const safeNameFr = escapeHtml(greetingFr)
  const safeNumber = escapeHtml(input.invoiceNumber)
  const safeAmountEn = escapeHtml(amountEn)
  const safeAmountFr = escapeHtml(amountFr)
  const safeDateEn = escapeHtml(dateEn)
  const safeDateFr = escapeHtml(dateFr)
  const ink = BRAND.ink
  const muted = '#6b7280'

  const text = [
    greetingEn,
    '',
    'Thank you, your payment was received.',
    '',
    `Invoice: ${input.invoiceNumber}`,
    `Amount: ${amountEn}`,
    `Date: ${dateEn}`,
    '',
    'Your invoice is attached to this email.',
    '',
    greetingFr,
    '',
    'Merci, votre paiement a été reçu.',
    '',
    `Facture : ${input.invoiceNumber}`,
    `Montant : ${amountFr}`,
    `Date : ${dateFr}`,
    '',
    'Votre facture est jointe à ce courriel.',
    '',
    'Qazi Driving School',
    CLASS5_REMINDER_SCHOOL_ADDRESS,
    CLASS5_REMINDER_SCHOOL_PHONE,
  ].join('\n')

  const detailRow = (label: string, value: string) => `
                <tr>
                  <td style="padding:6px 0;color:${muted};width:110px;font-family:Arial,Helvetica,sans-serif;font-size:14px;">${label}</td>
                  <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${ink};">${value}</td>
                </tr>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
<style>
  @media screen and (max-width: 480px) {
    .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Thank you, your payment was received. Invoice ${safeNumber} is attached.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.surface};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e6ebf1;border-radius:8px;">
          <tr>
            <td style="padding:0;border-radius:8px 8px 0 0;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="34%" height="6" style="background:${BRAND.blue};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="33%" height="6" style="background:${BRAND.red};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="33%" height="6" style="background:${BRAND.green};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" align="center" style="padding:32px 40px 8px;background:#ffffff;">
              <img src="${CLASS5_REMINDER_EMAIL_LOGO_URL}" alt="Qazi Driving School" width="220" style="display:block;width:220px;max-width:80%;height:auto;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td class="email-pad" align="center" style="padding:8px 40px 0;">
              <span style="display:inline-block;padding:4px 10px;background:${BRAND.green};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1px;border-radius:4px;">PAID / PAYÉ</span>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:24px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${ink};">
              <p style="margin:0 0 16px;">${safeNameEn}</p>
              <p style="margin:0;color:${BRAND.blue};font-size:18px;font-weight:bold;">Thank you, your payment was received.</p>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:16px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.surface};border-radius:8px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${detailRow('Invoice', safeNumber)}
                      ${detailRow('Amount', safeAmountEn)}
                      ${detailRow('Date', safeDateEn)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:16px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${ink};">
              <p style="margin:0;">Your invoice is attached to this email.</p>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:24px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid ${BRAND.rule};font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:20px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${ink};">
              <p style="margin:0 0 16px;">${safeNameFr}</p>
              <p style="margin:0;color:${BRAND.blue};font-size:18px;font-weight:bold;">Merci, votre paiement a été reçu.</p>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:16px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.surface};border-radius:8px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${detailRow('Facture', safeNumber)}
                      ${detailRow('Montant', safeAmountFr)}
                      ${detailRow('Date', safeDateFr)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:16px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${ink};">
              <p style="margin:0;">Votre facture est jointe à ce courriel.</p>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:28px 40px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${muted};">
              Qazi Driving School<br>
              ${escapeHtml(CLASS5_REMINDER_SCHOOL_ADDRESS)}<br>
              ${escapeHtml(CLASS5_REMINDER_SCHOOL_PHONE)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}

export async function deliverOnlinePaymentInvoiceEmail(
  deps: OnlinePaymentInvoiceEmailDeps,
  input: { registrationId: string; invoiceId?: string; justConfirmed: boolean },
): Promise<OnlinePaymentInvoiceEmailResult> {
  try {
    return await deliverOnlinePaymentInvoiceEmailInner(deps, input)
  } catch (error) {
    console.error('[OnlinePaymentInvoiceEmail] Unexpected failure:', error)
    return { status: 'failed', reason: 'unexpected' }
  }
}

async function deliverOnlinePaymentInvoiceEmailInner(
  deps: OnlinePaymentInvoiceEmailDeps,
  input: { registrationId: string; invoiceId?: string; justConfirmed: boolean },
): Promise<OnlinePaymentInvoiceEmailResult> {
  const enabled = await deps.isEnabled()
  if (!enabled) return { status: 'skipped', reason: 'disabled' }

  const invoice = await deps.findInvoice({
    registrationId: input.registrationId,
    invoiceId: input.invoiceId,
  })
  if (!invoice) return { status: 'skipped', reason: 'missing-invoice' }

  const now = deps.now ?? new Date()
  const block = onlineCheckoutInvoiceBlockReason(invoice, input.registrationId)
  let receipt = await deps.findReceipt(invoice.id)
  // Arm only on the confirmation that just succeeded, and only while the
  // switch is on. A later visit cannot create this row for an older payment.
  if (!receipt && input.justConfirmed && !block) {
    receipt = await deps.arm(invoice.id, now)
  }
  if (!receipt) {
    return { status: 'skipped', reason: input.justConfirmed && block ? block : 'not-eligible' }
  }
  if (block) return { status: 'skipped', reason: block }
  if (receipt.sentAt) return { status: 'skipped', reason: 'already-sent' }

  const from = await deps.getFromAddress()
  if (!from) return { status: 'skipped', reason: 'not-ready' }

  const email = normalizeReminderEmail(invoice.studentEmail)
  if (!email) return { status: 'skipped', reason: 'missing-email' }

  const claimedAt = now
  const staleBefore = new Date(now.getTime() - ONLINE_PAYMENT_INVOICE_EMAIL_CLAIM_LEASE_MS)
  const claimed = await deps.claim(invoice.id, claimedAt, staleBefore)
  if (!claimed) return { status: 'skipped', reason: 'already-claimed' }

  const built = buildOnlinePaymentInvoiceEmail({
    studentName: invoice.studentName,
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
    invoiceDate: invoice.invoiceDate,
  })
  let sent = false
  try {
    const pdf = await deps.renderPdf(invoice)
    await deps.send({
      from,
      to: email,
      subject: built.subject,
      text: built.text,
      html: built.html,
      attachment: {
        filename: invoicePdfFilename(invoice.invoiceNumber),
        content: pdf.toString('base64'),
      },
    })
    sent = true
    await deps.markSent(invoice.id, now)
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error)
    if (!sent) {
      try {
        await deps.release(invoice.id, claimedAt)
      } catch (releaseError) {
        console.error('[OnlinePaymentInvoiceEmail] Could not release claim', invoice.id, releaseError)
      }
      try {
        await deps.logSend({
          email,
          name: invoice.studentName,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          message: built.text,
          status: 'failed',
          error: errorText,
        })
      } catch (logError) {
        console.error('[OnlinePaymentInvoiceEmail] Could not log failed send', invoice.id, logError)
      }
      return { status: 'failed', reason: 'send-failed' }
    }
    console.error('[OnlinePaymentInvoiceEmail] Sent, but recording it failed. Leaving the claim in place:', invoice.id, error)
    return { status: 'sent', reason: 'sent' }
  }

  try {
    await deps.logSend({
      email,
      name: invoice.studentName,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      message: `${built.subject}\n${built.text}`,
      status: 'sent',
    })
  } catch (logError) {
    console.error('[OnlinePaymentInvoiceEmail] Could not log sent receipt', invoice.id, logError)
  }
  return { status: 'sent', reason: 'sent' }
}
