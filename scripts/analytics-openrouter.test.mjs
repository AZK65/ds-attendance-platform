import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANALYTICS_MODELS,
  DEFAULT_ANALYTICS_MODEL,
  filterLiveModels,
  resolveAnalyticsModel,
} from '../src/lib/analytics-models.ts'
import {
  balanceFromCreditsBody,
  balanceFromKeyBody,
  fetchOpenRouterBalance,
  presentOpenRouterBalance,
} from '../src/lib/openrouter-balance.ts'

const SECRET = 'sk-or-v1-supersecret-do-not-leak'

test('omitted model stays on the current analytics model', () => {
  assert.equal(resolveAnalyticsModel(undefined), DEFAULT_ANALYTICS_MODEL)
  assert.equal(resolveAnalyticsModel(null), DEFAULT_ANALYTICS_MODEL)
  assert.equal(resolveAnalyticsModel(''), DEFAULT_ANALYTICS_MODEL)
})

test('allowlisted models pass through and everything else is rejected', () => {
  for (const model of ANALYTICS_MODELS) {
    assert.equal(resolveAnalyticsModel(model.id), model.id)
  }
  for (const model of [
    'openai/gpt-4o',
    'anthropic/claude-opus-4.5',
    'anthropic/claude-sonnet-4.6 ',
    ' anthropic/claude-sonnet-4.6',
    'anthropic/claude-sonnet-4.6-evil',
    'anthropic/claude-sonnet-4.6\n',
    ['anthropic/claude-sonnet-4.6'],
    { id: 'anthropic/claude-sonnet-4.6' },
  ]) {
    assert.equal(resolveAnalyticsModel(model), null)
  }
})

test('a live catalog narrows the chooser and keeps the current model', () => {
  assert.deepEqual(filterLiveModels(null).map(model => model.id), ANALYTICS_MODELS.map(model => model.id))
  assert.deepEqual(filterLiveModels([]).map(model => model.id), ANALYTICS_MODELS.map(model => model.id))
  const live = filterLiveModels(['anthropic/claude-sonnet-4.6', 'openai/gpt-4o', 'google/gemini-3.5-flash'])
  assert.deepEqual(live.map(model => model.id), [
    DEFAULT_ANALYTICS_MODEL,
    'anthropic/claude-sonnet-4.6',
    'google/gemini-3.5-flash',
  ])
})

test('account credits remaining is purchased minus used', () => {
  const parsed = balanceFromCreditsBody({ data: { total_credits: 100.5, total_usage: 25.75 } })
  assert.deepEqual(parsed, { totalCreditsUsd: 100.5, totalUsageUsd: 25.75, remainingUsd: 74.75 })
  assert.equal(balanceFromCreditsBody({ total_credits: 10, total_usage: 1 }), null)
  assert.equal(balanceFromCreditsBody({ data: { total_credits: '100', total_usage: 1 } }), null)
})

test('key limit remaining is preferred, then the binding budget, then usage', () => {
  assert.equal(balanceFromKeyBody({
    data: { label: SECRET, usage: 25.5, limit: 100, limit_remaining: 74.5, effective_budget: { remaining_usd: 10 } },
  })?.remainingUsd, 74.5)
  assert.equal(balanceFromKeyBody({
    data: { usage: 25.5, limit: null, limit_remaining: null, effective_budget: { remaining_usd: 17.5 } },
  })?.remainingUsd, 17.5)
  const unlimited = balanceFromKeyBody({
    data: { usage: 12.5, limit: null, limit_remaining: null, effective_budget: null },
  })
  assert.equal(unlimited?.remainingUsd, null)
  assert.equal(unlimited?.keyUsageUsd, 12.5)
  assert.equal(balanceFromKeyBody({ data: { label: SECRET } }), null)
})

test('credits response is used as-is and a 403 falls back to the key endpoint', async () => {
  const seen = []
  const creditsOnly = await fetchOpenRouterBalance(SECRET, async (url, init) => {
    seen.push(url)
    assert.equal(init.headers.Authorization, `Bearer ${SECRET}`)
    assert.equal(url, 'https://openrouter.ai/api/v1/credits')
    return new Response(JSON.stringify({ data: { total_credits: 40, total_usage: 15.25 } }), { status: 200 })
  })
  assert.equal(creditsOnly.source, 'credits')
  assert.equal(creditsOnly.remainingUsd, 24.75)
  assert.deepEqual(seen, ['https://openrouter.ai/api/v1/credits'])

  const fallback = await fetchOpenRouterBalance(SECRET, async (url) => {
    if (url.endsWith('/credits')) {
      return new Response(JSON.stringify({ error: { code: 403, message: 'Only management keys can perform this operation' } }), { status: 403 })
    }
    return new Response(JSON.stringify({ data: { label: SECRET, usage: 3, limit: 20, limit_remaining: 17 } }), { status: 200 })
  })
  assert.equal(fallback.source, 'key')
  assert.equal(fallback.remainingUsd, 17)
  const view = presentOpenRouterBalance(fallback)
  assert.equal(view.label, '$17.00 left')
  assert.equal(view.provider, 'openrouter')
  assert.equal(JSON.stringify(view).includes('supersecret'), false)
  assert.equal(JSON.stringify(fallback).includes(SECRET), false)
})

test('a rejected key is reported without the upstream body', async () => {
  const balance = await fetchOpenRouterBalance(SECRET, async () => {
    return new Response(JSON.stringify({ error: { message: `bad ${SECRET}` } }), { status: 401 })
  })
  const view = presentOpenRouterBalance(balance)
  assert.equal(view.label, 'Credits unavailable')
  assert.equal(view.detail, 'OpenRouter rejected the API key.')
  assert.equal(JSON.stringify(view).includes(SECRET), false)
})

test('usage is shown when the key has no remaining balance', () => {
  const view = presentOpenRouterBalance({
    source: 'key',
    remainingUsd: null,
    totalCreditsUsd: null,
    totalUsageUsd: null,
    keyUsageUsd: 12.5,
    keyLimitUsd: null,
    note: 'usage only',
    error: null,
  })
  assert.equal(view.label, '$12.50 used')
  assert.equal(view.detail, 'usage only')
  assert.equal(view.remainingUsd, null)
})
