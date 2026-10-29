import assert from 'node:assert/strict'
import { test } from 'node:test'
import { class1StudentSignedAt, formatContractDate } from './class1-contract-signed-date'

const TODAY = new Date('2026-10-29T15:00:00.000Z')
const SIGNATURE = 'data:image/png;base64,abc'

test('a stored submission date is the Montréal signing day, not today', () => {
  // 2026-08-04 02:30 UTC is 22:30 the previous evening in Montréal (EDT, UTC-4).
  const signed = class1StudentSignedAt({
    signatureImage: SIGNATURE,
    submittedAt: new Date('2026-08-04T02:30:00.000Z'),
    termsAcceptedAt: new Date('2026-01-01T15:00:00.000Z'),
  }, TODAY)
  assert.equal(formatContractDate(signed, 'fr'), '3 août 2026')
  assert.equal(formatContractDate(signed, 'en'), 'August 3, 2026')
})

test('termsAcceptedAt is used when submittedAt is missing', () => {
  const signed = class1StudentSignedAt({
    signatureImage: SIGNATURE,
    termsAcceptedAt: '2026-08-03T16:00:00.000Z',
  }, TODAY)
  assert.equal(formatContractDate(signed, 'fr'), '3 août 2026')
})

test('an unsigned contract with no stored date uses today', () => {
  const signed = class1StudentSignedAt({ signatureImage: null }, TODAY)
  assert.equal(formatContractDate(signed, 'fr'), '29 octobre 2026')
})

test('a stored date is kept even when the signature image is absent', () => {
  const signed = class1StudentSignedAt({
    signatureImage: '',
    submittedAt: new Date('2026-08-03T16:00:00.000Z'),
  }, TODAY)
  assert.equal(formatContractDate(signed, 'fr'), '3 août 2026')
})
