import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getLeadScreening } from '../src/lib/lead-screening.ts'

const lead = (values) => ({ rawData: JSON.stringify({ google_key: 'not-for-clients', user_column_data: Object.entries(values).map(([column_id, string_value]) => ({ column_id, string_value })) }) })

test('both yes answers meet the initial screen only', () => {
  assert.equal(getLeadScreening(lead({ QUEBEC_LICENCE: 'Yes', DRIVING_EXPERIENCE: 'Yes' })).result, 'meets')
})
test('any no is recorded as criteria not met without rejecting or archiving the lead', () => {
  for (const answers of [['No', 'Yes'], ['Yes', 'No'], ['No', 'No']]) {
    assert.equal(getLeadScreening(lead({ QUEBEC_LICENCE: answers[0], DRIVING_EXPERIENCE: answers[1] })).result, 'not_met')
  }
})
test('missing, unknown and not sure require review', () => {
  for (const answers of [{}, { QUEBEC_LICENCE: 'Yes' }, { QUEBEC_LICENCE: 'Yes', DRIVING_EXPERIENCE: 'Not sure' }, { QUEBEC_LICENCE: 'Maybe', DRIVING_EXPERIENCE: 'Yes' }]) {
    assert.equal(getLeadScreening(lead(answers)).result, 'review')
  }
})
test('legacy combined answers are displayed without inventing individual answers', () => {
  const result = getLeadScreening(lead({ QUEBEC_LICENCE_EXPERIENCE: 'Yes' }))
  assert.equal(result.result, 'meets')
  assert.equal(result.quebecLicence, 'unknown')
  assert.equal(result.drivingExperience, 'unknown')
  assert.equal(result.combinedAnswer, 'yes')
})
test('new incomplete answers do not fall back to a legacy yes', () => {
  assert.equal(getLeadScreening(lead({ QUEBEC_LICENCE: 'Not sure', QUEBEC_LICENCE_EXPERIENCE: 'Yes' })).result, 'review')
})
test('manual or malformed payloads are safe and never marked as qualifying by default', () => {
  for (const rawData of [null, '', '{oops', 'null', '[]', '{"user_column_data":[null,1,"x"]}']) {
    assert.equal(getLeadScreening({ rawData }).result, 'review')
  }
})
test('existing website leads are recognized without a database backfill', () => {
  const result = getLeadScreening({ ...lead({ SOURCE_PAGE: 'Website callback · https://qazidriving.ca/promotion-camion', LANGUAGE: 'English', CALLBACK_TIME: 'morning', PROGRAM: 'Class 1 truck' }), source: 'google_ads' })
  assert.equal(result.website, true)
  assert.equal(result.language, 'English')
  assert.equal(result.callbackTime, 'morning')
  assert.equal('google_key' in result, false)
})
test('notes can supply old answers when raw payload is unavailable', () => {
  assert.equal(getLeadScreening({ notes: "Has a Québec driver's licence: Yes\nAt least 2 years of driving experience: No" }).result, 'not_met')
})
