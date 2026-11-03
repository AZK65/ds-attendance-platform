import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CLASS5_REMINDER_EMAIL_LOGO_URL,
  CLASS5_REMINDER_SCHOOL_ADDRESS,
  CLASS5_REMINDER_SCHOOL_PHONE,
} from './class5-payment-reminder-email'
import {
  ONLINE_PAYMENT_INVOICE_EMAIL_CLAIM_LEASE_MS,
  ONLINE_PAYMENT_INVOICE_EMAIL_PREFERENCE_KEY,
  buildOnlinePaymentInvoiceEmail,
  deliverOnlinePaymentInvoiceEmail,
  formatInvoiceDate,
  invoicePdfFilename,
  onlineCheckoutInvoiceBlockReason,
  onlinePaymentInvoiceEmailSubject,
  registrationInvoiceTag,
  type OnlinePaymentInvoiceEmailDeps,
  type OnlinePaymentInvoiceEmailLog,
  type OnlinePaymentInvoiceEmailMessage,
  type OnlinePaymentInvoiceEmailReceipt,
  type OnlinePaymentInvoiceSnapshot,
} from './online-payment-invoice-email'

const NOW = new Date('2026-11-03T16:00:00.000Z')
const REG_ID = 'cmexample000000000000001'
const INVOICE_ID = 'cminvoice000000000000001'
const EMAIL = 'sample.student@example.com'

function invoice(overrides: Partial<OnlinePaymentInvoiceSnapshot> = {}): OnlinePaymentInvoiceSnapshot {
  return {
    id: INVOICE_ID,
    invoiceNumber: 'INV-2026-0142',
    studentName: 'Sample Student',
    studentEmail: EMAIL,
    invoiceDate: '2026-11-03',
    total: 250,
    paymentStatus: 'paid',
    paymentMethod: 'card',
    cloverPaid: true,
    notes: `Auto-generated from registration ${REG_ID}.\nCard payment captured via Clover.\n${registrationInvoiceTag(REG_ID)}`,
    ...overrides,
  }
}

test('preference key matches the settings switch', () => {
  assert.equal(ONLINE_PAYMENT_INVOICE_EMAIL_PREFERENCE_KEY, 'invoiceEmailAfterOnlinePaymentEnabled')
})

test('the receipt email names the invoice, amount, and date in English and French', () => {
  assert.equal(formatInvoiceDate('2026-11-03', 'en-CA'), 'November 3, 2026')
  assert.equal(formatInvoiceDate('2026-11-03', 'fr-CA'), '3 novembre 2026')
  const email = buildOnlinePaymentInvoiceEmail({
    studentName: 'Sample Student',
    invoiceNumber: 'INV-2026-0142',
    total: 250,
    invoiceDate: '2026-11-03',
  })
  assert.equal(email.subject, onlinePaymentInvoiceEmailSubject('INV-2026-0142'))
  assert.equal(email.subject, 'Payment received — Invoice INV-2026-0142')
  assert.match(email.text, /^Hi Sample,\n\nThank you, your payment was received\./)
  assert.ok(email.text.includes('Invoice: INV-2026-0142'))
  assert.ok(email.text.includes('Amount: $250.00'))
  assert.ok(email.text.includes('Date: November 3, 2026'))
  assert.ok(email.text.includes('Your invoice is attached to this email.'))
  assert.ok(email.text.includes('Bonjour Sample,'))
  assert.ok(email.text.includes('Merci, votre paiement a été reçu.'))
  assert.ok(email.text.includes('Facture : INV-2026-0142'))
  assert.ok(email.text.includes('Montant : 250,00 $'))
  assert.ok(email.text.includes('Date : 3 novembre 2026'))
  assert.ok(email.text.includes('Votre facture est jointe à ce courriel.'))
  assert.ok(email.text.includes(CLASS5_REMINDER_SCHOOL_ADDRESS))
  assert.ok(email.text.includes(CLASS5_REMINDER_SCHOOL_PHONE))
  assert.match(email.html, /font-family:Arial,Helvetica,sans-serif/)
  assert.match(email.html, /max-width:560px/)
  assert.ok(email.html.includes('#e32726'))
  assert.ok(email.html.includes('#1e3fcb'))
  assert.ok(email.html.includes('#2fa94a'))
  assert.ok(email.html.includes('width="220"'))
  assert.ok(email.html.includes(CLASS5_REMINDER_EMAIL_LOGO_URL))
  assert.ok(email.html.includes('Thank you, your payment was received.'))
  assert.ok(email.html.includes('Merci, votre paiement a été reçu.'))
  assert.ok(email.html.includes('INV-2026-0142'))
  assert.ok(email.html.includes('$250.00'))
  assert.ok(email.html.includes('November 3, 2026'))
  assert.ok(email.html.includes('3 novembre 2026'))
  assert.ok(email.html.includes('PAID / PAYÉ'))
  assert.equal(email.html.includes('<script'), false)

  const hostile = buildOnlinePaymentInvoiceEmail({
    studentName: '<b>Sam</b>',
    invoiceNumber: 'INV-1',
    total: 10,
    invoiceDate: '2026-01-02',
  })
  assert.equal(hostile.html.includes('<b>Sam</b>'), false)
  assert.ok(hostile.html.includes('&lt;b&gt;Sam&lt;/b&gt;'))
  assert.equal(invoicePdfFilename('INV-2026-0142'), 'invoice-INV-2026-0142.pdf')
  assert.equal(invoicePdfFilename('INV 1/2'), 'invoice-INV_1_2.pdf')
})

test('only a paid hosted-checkout registration invoice qualifies', () => {
  const cases: Array<[Partial<OnlinePaymentInvoiceSnapshot>, string]> = [
    [{ paymentStatus: 'unpaid' }, 'not-paid'],
    [{ paymentStatus: 'failed' }, 'not-paid'],
    [{ paymentStatus: 'refunded' }, 'not-paid'],
    [{ paymentMethod: 'cash', cloverPaid: false }, 'not-online-checkout'],
    [{ paymentMethod: 'card', cloverPaid: false }, 'not-online-checkout'],
    [{ paymentMethod: 'online', cloverPaid: true }, 'not-online-checkout'],
    [{ notes: 'Marked paid by hand' }, 'not-registration-invoice'],
    [{ notes: null }, 'not-registration-invoice'],
    [{ studentEmail: null }, 'missing-email'],
    [{ studentEmail: 'not-an-email' }, 'missing-email'],
  ]
  for (const [overrides, reason] of cases) {
    assert.equal(onlineCheckoutInvoiceBlockReason(invoice(overrides), REG_ID), reason, JSON.stringify(overrides))
  }
  assert.equal(onlineCheckoutInvoiceBlockReason(invoice(), REG_ID), null)
  assert.equal(onlineCheckoutInvoiceBlockReason(invoice(), 'someone-else'), 'not-registration-invoice')
})

interface Harness {
  deps: OnlinePaymentInvoiceEmailDeps
  sends: OnlinePaymentInvoiceEmailMessage[]
  logs: OnlinePaymentInvoiceEmailLog[]
  row: OnlinePaymentInvoiceSnapshot
  receipt: OnlinePaymentInvoiceEmailReceipt | null
  arms: number
  claims: number
  releases: number
  lookups: number
}

function harness(overrides: Partial<OnlinePaymentInvoiceSnapshot> = {}): Harness {
  const row = invoice(overrides)
  const sends: OnlinePaymentInvoiceEmailMessage[] = []
  const logs: OnlinePaymentInvoiceEmailLog[] = []
  let receipt: OnlinePaymentInvoiceEmailReceipt | null = null
  let arms = 0
  let claims = 0
  let releases = 0
  let lookups = 0
  const deps: OnlinePaymentInvoiceEmailDeps = {
    now: NOW,
    isEnabled: () => true,
    getFromAddress: async () => 'Qazi Driving School <info@qazidriving.ca>',
    findInvoice: async () => {
      lookups++
      return row
    },
    findReceipt: async () => receipt,
    arm: async (invoiceId, at) => {
      if (receipt) return receipt
      arms++
      receipt = { invoiceId, eligibleAt: at, claimedAt: null, sentAt: null }
      return receipt
    },
    claim: async (invoiceId, at, staleBefore) => {
      if (!receipt || receipt.invoiceId !== invoiceId || receipt.sentAt) return false
      if (receipt.claimedAt && receipt.claimedAt.getTime() >= staleBefore.getTime()) return false
      receipt.claimedAt = at
      claims++
      return true
    },
    markSent: async (_invoiceId, at) => {
      if (!receipt) throw new Error('missing receipt')
      receipt.sentAt = at
    },
    release: async (invoiceId, claimedAt) => {
      releases++
      if (!receipt || receipt.invoiceId !== invoiceId || receipt.sentAt) return
      if (receipt.claimedAt?.getTime() !== claimedAt.getTime()) return
      receipt.claimedAt = null
    },
    renderPdf: async () => Buffer.from('%PDF-sample'),
    send: async (message) => {
      sends.push(message)
    },
    logSend: async (entry) => {
      logs.push(entry)
    },
  }
  return {
    deps,
    sends,
    logs,
    row,
    get receipt() { return receipt },
    set receipt(value) { receipt = value },
    get arms() { return arms },
    get claims() { return claims },
    get releases() { return releases },
    get lookups() { return lookups },
  }
}

const confirmed = { registrationId: REG_ID, invoiceId: INVOICE_ID, justConfirmed: true }
const retry = { registrationId: REG_ID, invoiceId: INVOICE_ID, justConfirmed: false }

test('a confirmed online payment emails the invoice PDF once', async () => {
  const run = harness()
  const result = await deliverOnlinePaymentInvoiceEmail(run.deps, confirmed)
  assert.equal(result.status, 'sent')
  assert.equal(run.arms, 1)
  assert.equal(run.claims, 1)
  assert.equal(run.sends.length, 1)
  assert.equal(run.sends[0].from, 'Qazi Driving School <info@qazidriving.ca>')
  assert.equal(run.sends[0].to, EMAIL)
  assert.equal(run.sends[0].subject, 'Payment received — Invoice INV-2026-0142')
  assert.match(run.sends[0].text, /Thank you, your payment was received\./)
  assert.equal(run.sends[0].attachment.filename, 'invoice-INV-2026-0142.pdf')
  assert.equal(Buffer.from(run.sends[0].attachment.content, 'base64').toString(), '%PDF-sample')
  assert.equal(run.logs.filter(log => log.status === 'sent').length, 1)
  assert.equal(run.receipt?.sentAt?.toISOString(), NOW.toISOString())

  const again = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(again.reason, 'already-sent')
  assert.equal(run.sends.length, 1)
  assert.equal(run.arms, 1)
})

test('overlapping confirmations send one email', async () => {
  const run = harness()
  let releaseSend: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    releaseSend = resolve
  })
  run.deps.send = async (message) => {
    run.sends.push(message)
    await gate
  }
  const running = Promise.all([
    deliverOnlinePaymentInvoiceEmail(run.deps, confirmed),
    deliverOnlinePaymentInvoiceEmail(run.deps, confirmed),
  ])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(run.sends.length, 1)
  releaseSend()
  const results = await running
  assert.equal(results.filter(result => result.status === 'sent').length, 1)
  assert.equal(run.sends.length, 1)
  assert.equal(run.claims, 1)
})

test('a failed send is released and retried once, then never sent again', async () => {
  const run = harness()
  let fail = true
  run.deps.send = async (message) => {
    run.sends.push(message)
    if (fail) throw new Error('Resend API error')
  }
  const failed = await deliverOnlinePaymentInvoiceEmail(run.deps, confirmed)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.reason, 'send-failed')
  assert.equal(run.releases, 1)
  assert.equal(run.receipt?.claimedAt, null)
  assert.equal(run.receipt?.sentAt, null)
  assert.equal(run.logs[0]?.status, 'failed')
  assert.equal(run.logs[0]?.invoiceId, INVOICE_ID)

  fail = false
  const sent = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(sent.status, 'sent')
  const extra = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(extra.reason, 'already-sent')
  assert.equal(run.sends.length, 2)
})

test('a fresh claim blocks a second send, and a stale claim can be taken over', async () => {
  const run = harness()
  run.receipt = {
    invoiceId: INVOICE_ID,
    eligibleAt: new Date(NOW.getTime() - 60_000),
    claimedAt: new Date(NOW.getTime() - 5_000),
    sentAt: null,
  }
  const held = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(held.reason, 'already-claimed')
  assert.equal(run.sends.length, 0)

  run.receipt = {
    invoiceId: INVOICE_ID,
    eligibleAt: new Date(NOW.getTime() - ONLINE_PAYMENT_INVOICE_EMAIL_CLAIM_LEASE_MS - 5_000),
    claimedAt: new Date(NOW.getTime() - ONLINE_PAYMENT_INVOICE_EMAIL_CLAIM_LEASE_MS - 1_000),
    sentAt: null,
  }
  const restarted = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(restarted.status, 'sent')
  assert.equal(run.sends.length, 1)

  const duplicate = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(duplicate.reason, 'already-sent')
  assert.equal(run.sends.length, 1)
})

test('the switch defaults off and a payment confirmed while it is off is never emailed later', async () => {
  const run = harness()
  run.deps.isEnabled = () => false
  const off = await deliverOnlinePaymentInvoiceEmail(run.deps, confirmed)
  assert.equal(off.reason, 'disabled')
  assert.equal(run.lookups, 0)
  assert.equal(run.arms, 0)
  assert.equal(run.sends.length, 0)

  run.deps.isEnabled = () => true
  const later = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(later.reason, 'not-eligible')
  assert.equal(run.arms, 0)
  assert.equal(run.sends.length, 0)
  assert.equal(run.receipt, null)
})

test('an already-paid invoice is not emailed unless this confirmation armed it', async () => {
  const run = harness()
  const past = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(past.reason, 'not-eligible')
  assert.equal(run.arms, 0)
  assert.equal(run.sends.length, 0)
})

test('unpaid, failed, refunded, and manually marked invoices are not emailed', async () => {
  for (const overrides of [
    { paymentStatus: 'unpaid' },
    { paymentStatus: 'failed' },
    { paymentStatus: 'refunded' },
    { paymentMethod: 'cash', cloverPaid: false },
    { paymentMethod: 'card', cloverPaid: false },
    { paymentMethod: 'online', cloverPaid: true },
    { notes: 'Marked paid in the office' },
    { studentEmail: null },
    { studentEmail: 'nope' },
  ] as Array<Partial<OnlinePaymentInvoiceSnapshot>>) {
    const run = harness(overrides)
    const result = await deliverOnlinePaymentInvoiceEmail(run.deps, confirmed)
    assert.equal(result.status, 'skipped', JSON.stringify(overrides))
    assert.notEqual(result.reason, 'sent')
    assert.equal(run.arms, 0)
    assert.equal(run.sends.length, 0)
    assert.equal(run.claims, 0)
  }
})

test('a refund after the invoice was armed does not send', async () => {
  const run = harness()
  run.receipt = {
    invoiceId: INVOICE_ID,
    eligibleAt: NOW,
    claimedAt: null,
    sentAt: null,
  }
  run.row.paymentStatus = 'refunded'
  const result = await deliverOnlinePaymentInvoiceEmail(run.deps, retry)
  assert.equal(result.reason, 'not-paid')
  assert.equal(run.sends.length, 0)
  assert.equal(run.claims, 0)
})

test('no from address leaves the invoice unclaimed', async () => {
  const run = harness()
  run.deps.getFromAddress = async () => null
  const result = await deliverOnlinePaymentInvoiceEmail(run.deps, confirmed)
  assert.equal(result.reason, 'not-ready')
  assert.equal(run.arms, 1)
  assert.equal(run.claims, 0)
  assert.equal(run.receipt?.claimedAt, null)
  assert.equal(run.receipt?.sentAt, null)
  assert.equal(run.sends.length, 0)
})

test('a PDF failure releases the claim and does not throw', async () => {
  const run = harness()
  run.deps.renderPdf = async () => {
    throw new Error('pdf broke')
  }
  const result = await deliverOnlinePaymentInvoiceEmail(run.deps, confirmed)
  assert.equal(result.reason, 'send-failed')
  assert.equal(run.releases, 1)
  assert.equal(run.receipt?.claimedAt, null)
  assert.equal(run.sends.length, 0)
})

test('a lookup failure is reported and does not throw', async () => {
  const run = harness()
  run.deps.findInvoice = async () => {
    throw new Error('db down')
  }
  const result = await deliverOnlinePaymentInvoiceEmail(run.deps, confirmed)
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'unexpected')
  assert.equal(run.sends.length, 0)
})
