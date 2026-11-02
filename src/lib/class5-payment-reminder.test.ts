import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HAND_MESSAGED_CLASS5_REGISTRATION_IDS,
  buildClass5PaymentReminderMessage,
  class5PaymentRetryUrl,
  class5ReminderSkipReason,
  formatClass5FirstPaymentLabel,
  outgoingMessageCoversRegistration,
  processClass5PaymentReminders,
  type Class5ReminderDeps,
  type Class5ReminderRegistration,
  type Class5ReminderSendLog,
} from './class5-payment-reminder'

const NOW = new Date('2026-11-02T03:00:00.000Z')
const TOKEN = 'a'.repeat(48)
const PHONE = '15145550100'

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000)
}

function registration(overrides: Partial<Class5ReminderRegistration> = {}): Class5ReminderRegistration {
  return {
    id: 'cmexample000000000000001',
    vehicleType: 'car',
    status: 'submitted',
    fullName: 'Sam Rivera',
    phoneNumber: PHONE,
    paymentStatus: 'checkout_pending',
    paymentCapturedAt: null,
    paymentReturnToken: TOKEN,
    paymentCheckoutCreatedAt: minutesAgo(25),
    paymentReminderSentAt: null,
    createdAt: minutesAgo(25),
    ...overrides,
  }
}

function retryUrl(id = 'cmexample000000000000001', token = TOKEN): string {
  return class5PaymentRetryUrl(id, token, 'https://qazidriving.ca')
}

test('message uses the Class 5 deposit and the existing retry link', () => {
  const url = retryUrl()
  assert.equal(formatClass5FirstPaymentLabel(25000), '$250')
  assert.equal(
    buildClass5PaymentReminderMessage({ firstName: 'Sam', amountLabel: '$250', retryUrl: url }),
    `Hi Sam, this is Qazi Driving School. We saw your Class 5 registration but the first $250 payment didn't go through. If you couldn't pay, you can use this link: ${url}. Let us know if you have any issues.`,
  )
  assert.equal(
    buildClass5PaymentReminderMessage({
      firstName: 'Sam',
      amountLabel: formatClass5FirstPaymentLabel(30000),
      retryUrl: url,
    }),
    `Hi Sam, this is Qazi Driving School. We saw your Class 5 registration but the first $300 payment didn't go through. If you couldn't pay, you can use this link: ${url}. Let us know if you have any issues.`,
  )
})

test('an unusable deposit keeps the literal $250', () => {
  for (const cents of [null, undefined, 0, -100, Number.NaN, 10.5, 2_000_000]) {
    assert.equal(formatClass5FirstPaymentLabel(cents), '$250')
  }
  assert.equal(formatClass5FirstPaymentLabel(25050), '$250.50')
})

test('retry link reuses the marketing base, registration id, and return token', () => {
  const id = 'cmvymdw1g0efjac1bwi6msvdu'
  const token = 'abc123abc123abc123abc123abc123abc123abc123abc123'
  assert.equal(
    class5PaymentRetryUrl(id, token, 'https://qazidriving.ca/'),
    `https://qazidriving.ca/en/register?payment=failure&registration=${id}&token=${token}`,
  )
  const previous = process.env.MARKETING_SITE_URL
  process.env.MARKETING_SITE_URL = 'https://preview.example.com'
  try {
    assert.equal(
      class5PaymentRetryUrl(id, token),
      `https://preview.example.com/en/register?payment=failure&registration=${id}&token=${token}`,
    )
  } finally {
    if (previous === undefined) delete process.env.MARKETING_SITE_URL
    else process.env.MARKETING_SITE_URL = previous
  }
  const saved = process.env.MARKETING_SITE_URL
  delete process.env.MARKETING_SITE_URL
  try {
    assert.equal(
      class5PaymentRetryUrl(id, token).startsWith('https://qazidriving.ca/en/register?payment=failure&'),
      true,
    )
  } finally {
    if (saved !== undefined) process.env.MARKETING_SITE_URL = saved
  }
})

test('a Class 5 checkout that is still unpaid after 20 minutes is eligible', () => {
  assert.equal(class5ReminderSkipReason(registration(), NOW), null)
  assert.equal(class5ReminderSkipReason(registration({
    createdAt: minutesAgo(20),
    paymentCheckoutCreatedAt: minutesAgo(20),
    paymentStatus: 'failed',
  }), NOW), null)
})

test('skip rules cover payment, status, age, phone, token, and the two hand-sent registrations', () => {
  const cases: Array<[Partial<Class5ReminderRegistration>, string]> = [
    [{ paymentReminderSentAt: NOW }, 'already-sent'],
    [{ id: HAND_MESSAGED_CLASS5_REGISTRATION_IDS[0] }, 'hand-messaged'],
    [{ id: HAND_MESSAGED_CLASS5_REGISTRATION_IDS[1] }, 'hand-messaged'],
    [{ vehicleType: 'truck' }, 'not-class-5'],
    [{ vehicleType: null }, 'not-class-5'],
    [{ status: 'confirmed' }, 'closed'],
    [{ status: 'approved' }, 'closed'],
    [{ status: 'cancelled' }, 'closed'],
    [{ status: 'rejected' }, 'closed'],
    [{ status: 'draft' }, 'not-submitted'],
    [{ paymentCapturedAt: NOW }, 'paid-or-captured'],
    [{ paymentStatus: 'captured' }, 'paid-or-captured'],
    [{ paymentStatus: 'authorized' }, 'paid-or-captured'],
    [{ paymentStatus: 'cash-paid' }, 'paid-or-captured'],
    [{ paymentStatus: 'cash-pending' }, 'paid-or-captured'],
    [{ paymentStatus: 'card-pending' }, 'paid-or-captured'],
    [{ paymentStatus: null }, 'not-unpaid-checkout'],
    [{ createdAt: minutesAgo(19), paymentCheckoutCreatedAt: minutesAgo(19) }, 'too-new'],
    [{ createdAt: minutesAgo(24 * 60) }, 'too-old'],
    [{ createdAt: minutesAgo(30), paymentCheckoutCreatedAt: minutesAgo(10) }, 'checkout-still-open'],
    [{ phoneNumber: null }, 'missing-phone'],
    [{ phoneNumber: '   ' }, 'missing-phone'],
    [{ phoneNumber: '1111111111' }, 'invalid-phone'],
    [{ paymentReturnToken: null }, 'missing-token'],
    [{ paymentReturnToken: 'short' }, 'missing-token'],
    [{ fullName: '   ' }, 'missing-name'],
  ]
  for (const [overrides, reason] of cases) {
    assert.equal(class5ReminderSkipReason(registration(overrides), NOW), reason, JSON.stringify(overrides))
  }
})

test('an outgoing message log skips a student already sent this registration or its retry link', () => {
  const url = retryUrl()
  const match = (overrides: Partial<Parameters<typeof outgoingMessageCoversRegistration>[0]>) =>
    outgoingMessageCoversRegistration({
      status: 'sent',
      to: `${PHONE}@c.us`,
      message: `Please retry ${url}`,
      phoneNumber: PHONE,
      registrationId: 'cmexample000000000000001',
      retryUrl: url,
      ...overrides,
    })

  assert.equal(match({}), true)
  assert.equal(match({ message: 'registration cmexample000000000000001 is unpaid' }), true)
  assert.equal(match({
    to: '5145550100',
    message: `Hi Sam, this is Qazi Driving School. We saw your Class 5 registration but the first $250 payment didn't go through. If you couldn't pay, you can use this link: https://qazidriving.ca/en/register?payment=failure`.slice(0, 200),
  }), true)
  assert.equal(match({ status: 'failed' }), false)
  assert.equal(match({ to: '15145550999@c.us' }), false)
  assert.equal(match({ message: 'Hi Sam, did you still want the class?' }), false)
})

interface Harness {
  deps: Class5ReminderDeps
  sends: string[]
  pauses: string[]
  logs: Class5ReminderSendLog[]
  claims: number
  releases: number
  lists: number
  row: Class5ReminderRegistration
}

function harness(overrides: Partial<Class5ReminderRegistration> = {}, sendImpl?: (message: string) => Promise<void>): Harness {
  const row = registration(overrides)
  const sends: string[] = []
  const pauses: string[] = []
  const logs: Class5ReminderSendLog[] = []
  let claims = 0
  let releases = 0
  let lists = 0
  const deps: Class5ReminderDeps = {
    now: NOW,
    isEnabled: () => true,
    isWhatsAppConnected: () => true,
    listCandidates: async () => {
      lists++
      return row.paymentReminderSentAt ? [] : [row]
    },
    wasAlreadyMessaged: async () => false,
    claim: async (id, claimedAt) => {
      if (id !== row.id || row.paymentReminderSentAt) return false
      row.paymentReminderSentAt = claimedAt
      claims++
      return true
    },
    release: async (id) => {
      if (id === row.id) row.paymentReminderSentAt = null
      releases++
    },
    send: async (_phone, message) => {
      sends.push(message)
      if (sendImpl) await sendImpl(message)
    },
    pauseBot: async (phone) => {
      pauses.push(phone)
    },
    logSend: async (entry) => {
      logs.push(entry)
    },
    depositCents: async () => 25000,
  }
  return {
    deps,
    sends,
    pauses,
    logs,
    get claims() { return claims },
    get releases() { return releases },
    get lists() { return lists },
    row,
  }
}

test('overlapping runs send one reminder and a later run does not send again', async () => {
  let releaseSend: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    releaseSend = resolve
  })
  const first = harness({}, () => gate)
  const shared = first
  const secondDeps: Class5ReminderDeps = { ...shared.deps }
  const running = Promise.all([
    processClass5PaymentReminders(shared.deps),
    processClass5PaymentReminders(secondDeps),
  ])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(shared.sends.length, 1)
  releaseSend()
  const results = await running
  assert.equal(results.reduce((sum, result) => sum + result.sent, 0), 1)
  assert.equal(shared.claims, 1)
  assert.equal(shared.pauses.length, 1)
  assert.equal(shared.logs.filter(log => log.status === 'sent').length, 1)
  assert.match(shared.sends[0], /^Hi Sam, this is Qazi Driving School\./)
  assert.match(shared.sends[0], /https:\/\/qazidriving\.ca\/en\/register\?payment=failure&registration=cmexample000000000000001&token=/)

  const again = await processClass5PaymentReminders(shared.deps)
  assert.equal(again.sent, 0)
  assert.equal(shared.sends.length, 1)
})

test('a disconnected client does not claim, and a later connected run sends once', async () => {
  const run = harness()
  let connected = false
  run.deps.isWhatsAppConnected = () => connected
  const waiting = await processClass5PaymentReminders(run.deps)
  assert.equal(waiting.connected, false)
  assert.equal(waiting.sent, 0)
  assert.equal(run.lists, 0)
  assert.equal(run.claims, 0)
  assert.equal(run.row.paymentReminderSentAt, null)

  connected = true
  const sent = await processClass5PaymentReminders(run.deps)
  assert.equal(sent.sent, 1)
  assert.equal(run.sends.length, 1)
  const repeat = await processClass5PaymentReminders(run.deps)
  assert.equal(repeat.sent, 0)
  assert.equal(run.sends.length, 1)
})

test('a failed send is released and retried once, then never sent again', async () => {
  const run = harness()
  let fail = true
  run.deps.send = async (_phone, message) => {
    run.sends.push(message)
    if (fail) throw new Error('WhatsApp not connected')
  }
  const failed = await processClass5PaymentReminders(run.deps)
  assert.equal(failed.failed, 1)
  assert.equal(failed.sent, 0)
  assert.equal(run.releases, 1)
  assert.equal(run.row.paymentReminderSentAt, null)
  assert.equal(run.logs[0]?.status, 'failed')
  assert.equal(run.logs[0]?.registrationId, run.row.id)
  assert.equal(run.pauses.length, 0)

  fail = false
  const sent = await processClass5PaymentReminders(run.deps)
  assert.equal(sent.sent, 1)
  assert.equal(run.logs.filter(log => log.status === 'sent').length, 1)
  const extra = await processClass5PaymentReminders(run.deps)
  assert.equal(extra.sent, 0)
  assert.equal(run.sends.length, 2)
})

test('the switch defaulting off performs no lookup and no send', async () => {
  const run = harness()
  run.deps.isEnabled = () => false
  const result = await processClass5PaymentReminders(run.deps)
  assert.equal(result.enabled, false)
  assert.equal(result.sent, 0)
  assert.equal(run.lists, 0)
  assert.equal(run.sends.length, 0)
  assert.equal(run.claims, 0)
})

test('a student already messaged about this registration is not claimed', async () => {
  const run = harness()
  run.deps.wasAlreadyMessaged = async (_reg, url) => url.includes(run.row.id)
  const result = await processClass5PaymentReminders(run.deps)
  assert.equal(result.skipped, 1)
  assert.equal(result.sent, 0)
  assert.equal(run.claims, 0)
  assert.equal(run.sends.length, 0)
})

test('Class 1 and the hand-messaged registrations are not sent', async () => {
  for (const overrides of [
    { vehicleType: 'truck' },
    { id: HAND_MESSAGED_CLASS5_REGISTRATION_IDS[0] },
    { id: HAND_MESSAGED_CLASS5_REGISTRATION_IDS[1] },
    { status: 'confirmed' },
    { paymentStatus: 'captured' },
  ] as Array<Partial<Class5ReminderRegistration>>) {
    const run = harness(overrides)
    const result = await processClass5PaymentReminders(run.deps)
    assert.equal(result.sent, 0, JSON.stringify(overrides))
    assert.equal(run.sends.length, 0)
    assert.equal(run.claims, 0)
  }
})
