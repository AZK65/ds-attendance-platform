import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HAND_MESSAGED_CLASS5_REGISTRATION_IDS } from './class5-payment-reminder'
import {
  CLASS5_PAYMENT_REMINDER_EMAIL_SUBJECT,
  buildClass5PaymentReminderEmail,
  class5ReminderEmailSkipReason,
  outgoingEmailCoversRegistration,
  processClass5PaymentReminderEmails,
  type Class5ReminderEmailContent,
  type Class5ReminderEmailDeps,
  type Class5ReminderEmailRegistration,
  type Class5ReminderEmailSendLog,
} from './class5-payment-reminder-email'

const NOW = new Date('2026-11-02T03:00:00.000Z')
const TOKEN = 'a'.repeat(48)
const EMAIL = 'sam.rivera@example.com'

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000)
}

function registration(overrides: Partial<Class5ReminderEmailRegistration> = {}): Class5ReminderEmailRegistration {
  return {
    id: 'cmexample000000000000001',
    vehicleType: 'car',
    status: 'submitted',
    fullName: 'Sam Rivera',
    email: EMAIL,
    paymentStatus: 'checkout_pending',
    paymentAmount: 25000,
    paymentCapturedAt: null,
    paymentReturnToken: TOKEN,
    paymentCheckoutCreatedAt: minutesAgo(25),
    paymentReminderEmailSentAt: null,
    createdAt: minutesAgo(25),
    ...overrides,
  }
}

function retryUrl(id = 'cmexample000000000000001'): string {
  return `https://qazidriving.ca/en/register?payment=failure&registration=${id}&token=${TOKEN}`
}

test('subject and body use the approved wording, price, and retry link', () => {
  const url = retryUrl()
  const email = buildClass5PaymentReminderEmail({
    firstName: 'Sam',
    amountLabel: '$250',
    knownAmountLabel: '$250',
    retryUrl: url,
  })
  assert.equal(email.subject, CLASS5_PAYMENT_REMINDER_EMAIL_SUBJECT)
  assert.equal(email.subject, 'Your Qazi Driving School registration payment')
  assert.match(email.text, /^Hi Sam,\n\nThis is Qazi Driving School\. We saw your Class 5 registration but the first \$250 payment didn't go through\./)
  assert.ok(email.text.includes('If you couldn\'t pay, you can use this link:'))
  assert.ok(email.text.includes(url))
  assert.ok(email.text.includes('Let us know if you have any issues.'))
  assert.ok(email.text.includes('786 rue Jean-Talon Ouest, Montréal, QC H3N 1S2'))
  assert.ok(email.text.includes('(514) 274-6948'))
  assert.match(email.html, /font-family:Arial,Helvetica,sans-serif/)
  assert.match(email.html, /font-size:16px/)
  assert.match(email.html, /line-height:1\.6/)
  assert.match(email.html, /max-width:560px/)
  assert.ok(email.html.includes('#1e3fcb'))
  assert.equal(email.html.includes('#e32726'), false)
  assert.equal(email.html.includes('#2fa94a'), false)
  assert.ok(email.html.includes('width="220"'))
  assert.ok(email.html.includes('https://qazidriving.ca/qazi-logo.png'))
  assert.ok(email.html.includes('Complete your $250 payment'))
  assert.ok(email.html.includes('Class 5 registration · First payment $250'))
  assert.ok(email.html.includes('v:roundrect'))
  assert.ok(email.html.includes('Button not working? Copy this link:'))
  assert.ok(email.html.includes('786 rue Jean-Talon Ouest, Montréal, QC H3N 1S2'))
  assert.ok(email.html.includes('(514) 274-6948'))
  assert.ok(email.html.includes(`href="${url.replace(/&/g, '&amp;')}"`))
  assert.equal(email.html.includes('you can use this link:'), false)
  assert.ok(email.html.includes('Hi Sam,'))
  assert.ok(email.html.includes("the first $250 payment didn't go through."))
  assert.ok(email.html.includes('Let us know if you have any issues.'))

  const priced = buildClass5PaymentReminderEmail({
    firstName: 'Sam',
    amountLabel: '$300',
    knownAmountLabel: '$300',
    retryUrl: url,
  })
  assert.match(priced.text, /first \$300 payment/)
  assert.doesNotMatch(priced.text, /first \$250 payment/)
  assert.ok(priced.html.includes('Complete your $300 payment'))

  const unknown = buildClass5PaymentReminderEmail({
    firstName: 'Sam',
    amountLabel: '$250',
    knownAmountLabel: null,
    retryUrl: url,
  })
  assert.ok(unknown.html.includes('>Complete your payment<'))
  assert.equal(unknown.html.includes('Complete your $'), false)
  assert.equal(unknown.html.includes('First payment'), false)
  assert.ok(unknown.html.includes('Class 5 registration'))
})

test('a Class 5 checkout with an email is eligible without a phone, and skips an address that is not usable', () => {
  assert.equal(class5ReminderEmailSkipReason(registration(), NOW), null)
  assert.equal(class5ReminderEmailSkipReason(registration({
    paymentStatus: 'failed',
    createdAt: minutesAgo(20),
    paymentCheckoutCreatedAt: minutesAgo(20),
  }), NOW), null)
  assert.equal(class5ReminderEmailSkipReason(registration({ email: null }), NOW), 'missing-email')
  assert.equal(class5ReminderEmailSkipReason(registration({ email: '   ' }), NOW), 'missing-email')
  assert.equal(class5ReminderEmailSkipReason(registration({ email: 'not-an-email' }), NOW), 'missing-email')
  assert.equal(class5ReminderEmailSkipReason(registration({ email: 'Sam.Rivera@Example.com' }), NOW), null)
})

test('email skips match the WhatsApp rules and stay independent of a WhatsApp send', () => {
  const cases: Array<[Partial<Class5ReminderEmailRegistration>, string]> = [
    [{ paymentReminderEmailSentAt: NOW }, 'already-sent'],
    [{ id: HAND_MESSAGED_CLASS5_REGISTRATION_IDS[0] }, 'hand-messaged'],
    [{ id: HAND_MESSAGED_CLASS5_REGISTRATION_IDS[1] }, 'hand-messaged'],
    [{ vehicleType: 'truck' }, 'not-class-5'],
    [{ status: 'confirmed' }, 'closed'],
    [{ status: 'approved' }, 'closed'],
    [{ status: 'cancelled' }, 'closed'],
    [{ status: 'rejected' }, 'closed'],
    [{ paymentCapturedAt: NOW }, 'paid-or-captured'],
    [{ paymentStatus: 'captured' }, 'paid-or-captured'],
    [{ paymentStatus: 'authorized' }, 'paid-or-captured'],
    [{ createdAt: minutesAgo(19), paymentCheckoutCreatedAt: minutesAgo(19) }, 'too-new'],
    [{ createdAt: minutesAgo(24 * 60) }, 'too-old'],
    [{ createdAt: minutesAgo(30), paymentCheckoutCreatedAt: minutesAgo(10) }, 'checkout-still-open'],
    [{ paymentReturnToken: null }, 'missing-token'],
    [{ fullName: '' }, 'missing-name'],
  ]
  for (const [overrides, reason] of cases) {
    assert.equal(class5ReminderEmailSkipReason(registration(overrides), NOW), reason, JSON.stringify(overrides))
  }
})

test('an outgoing email log skips a student already sent this registration or its retry link', () => {
  const url = retryUrl()
  const match = (overrides: Partial<Parameters<typeof outgoingEmailCoversRegistration>[0]>) =>
    outgoingEmailCoversRegistration({
      status: 'sent',
      to: EMAIL,
      message: `Please retry ${url}`,
      email: 'Sam.Rivera@Example.com',
      registrationId: 'cmexample000000000000001',
      retryUrl: url,
      ...overrides,
    })
  assert.equal(match({}), true)
  assert.equal(match({ message: 'registration cmexample000000000000001 is unpaid' }), true)
  assert.equal(match({ status: 'failed' }), false)
  assert.equal(match({ to: 'other@example.com' }), false)
  assert.equal(match({ to: '15145550100' }), false)
  assert.equal(match({ message: 'Hi Sam, your class is next week.' }), false)
})

interface Harness {
  deps: Class5ReminderEmailDeps
  sends: Class5ReminderEmailContent[]
  logs: Class5ReminderEmailSendLog[]
  claims: number
  releases: number
  lists: number
  row: Class5ReminderEmailRegistration
}

function harness(
  overrides: Partial<Class5ReminderEmailRegistration> = {},
  sendImpl?: (message: Class5ReminderEmailContent) => Promise<void>,
): Harness {
  const row = registration(overrides)
  const sends: Class5ReminderEmailContent[] = []
  const logs: Class5ReminderEmailSendLog[] = []
  let claims = 0
  let releases = 0
  let lists = 0
  const deps: Class5ReminderEmailDeps = {
    now: NOW,
    isEnabled: () => true,
    getFromAddress: async () => 'Qazi Driving School <info@qazidriving.ca>',
    listCandidates: async () => {
      lists++
      return row.paymentReminderEmailSentAt ? [] : [row]
    },
    wasAlreadyEmailed: async () => false,
    claim: async (id, claimedAt) => {
      if (id !== row.id || row.paymentReminderEmailSentAt) return false
      row.paymentReminderEmailSentAt = claimedAt
      claims++
      return true
    },
    release: async (id) => {
      if (id === row.id) row.paymentReminderEmailSentAt = null
      releases++
    },
    send: async (message) => {
      sends.push(message)
      if (sendImpl) await sendImpl(message)
    },
    logSend: async (entry) => {
      logs.push(entry)
    },
    depositCents: async () => 25000,
  }
  return {
    deps,
    sends,
    logs,
    get claims() { return claims },
    get releases() { return releases },
    get lists() { return lists },
    row,
  }
}

test('overlapping runs send one email and a later run does not send again', async () => {
  let releaseSend: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    releaseSend = resolve
  })
  const run = harness({}, () => gate)
  const running = Promise.all([
    processClass5PaymentReminderEmails(run.deps),
    processClass5PaymentReminderEmails(run.deps),
  ])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(run.sends.length, 1)
  releaseSend()
  const results = await running
  assert.equal(results.reduce((sum, result) => sum + result.sent, 0), 1)
  assert.equal(run.claims, 1)
  assert.equal(run.sends[0].from, 'Qazi Driving School <info@qazidriving.ca>')
  assert.equal(run.sends[0].to, EMAIL)
  assert.equal(run.sends[0].subject, 'Your Qazi Driving School registration payment')
  assert.match(run.sends[0].text, /^Hi Sam,/)
  assert.ok(run.sends[0].html.includes('Complete your $250 payment'))
  assert.match(run.sends[0].html, new RegExp(run.row.id))
  assert.equal(run.logs.filter(log => log.status === 'sent').length, 1)

  const again = await processClass5PaymentReminderEmails(run.deps)
  assert.equal(again.sent, 0)
  assert.equal(run.sends.length, 1)
})

test('a failed send is released and retried once, then never sent again', async () => {
  const run = harness()
  let fail = true
  run.deps.send = async (message) => {
    run.sends.push(message)
    if (fail) throw new Error('Resend API error')
  }
  const failed = await processClass5PaymentReminderEmails(run.deps)
  assert.equal(failed.failed, 1)
  assert.equal(failed.sent, 0)
  assert.equal(run.releases, 1)
  assert.equal(run.row.paymentReminderEmailSentAt, null)
  assert.equal(run.logs[0]?.status, 'failed')
  assert.equal(run.logs[0]?.registrationId, run.row.id)

  fail = false
  const sent = await processClass5PaymentReminderEmails(run.deps)
  assert.equal(sent.sent, 1)
  const extra = await processClass5PaymentReminderEmails(run.deps)
  assert.equal(extra.sent, 0)
  assert.equal(run.sends.length, 2)
})

test('the email switch defaulting off performs no lookup and no send', async () => {
  const run = harness()
  run.deps.isEnabled = () => false
  const result = await processClass5PaymentReminderEmails(run.deps)
  assert.equal(result.enabled, false)
  assert.equal(result.sent, 0)
  assert.equal(run.lists, 0)
  assert.equal(run.sends.length, 0)
  assert.equal(run.claims, 0)
})

test('no from address leaves the registration unclaimed', async () => {
  const run = harness()
  run.deps.getFromAddress = async () => null
  const result = await processClass5PaymentReminderEmails(run.deps)
  assert.equal(result.enabled, true)
  assert.equal(result.ready, false)
  assert.equal(run.lists, 0)
  assert.equal(run.claims, 0)
  assert.equal(run.row.paymentReminderEmailSentAt, null)
})

test('a student already emailed, or with no email, or already covered by the skip rules, is not sent', async () => {
  const already = harness()
  already.deps.wasAlreadyEmailed = async () => true
  const skipped = await processClass5PaymentReminderEmails(already.deps)
  assert.equal(skipped.sent, 0)
  assert.equal(already.claims, 0)

  for (const overrides of [
    { email: null },
    { email: 'nope' },
    { vehicleType: 'truck' },
    { id: HAND_MESSAGED_CLASS5_REGISTRATION_IDS[0] },
    { id: HAND_MESSAGED_CLASS5_REGISTRATION_IDS[1] },
    { status: 'confirmed' },
    { paymentStatus: 'captured' },
  ] as Array<Partial<Class5ReminderEmailRegistration>>) {
    const run = harness(overrides)
    const result = await processClass5PaymentReminderEmails(run.deps)
    assert.equal(result.sent, 0, JSON.stringify(overrides))
    assert.equal(run.sends.length, 0)
    assert.equal(run.claims, 0)
  }
})
