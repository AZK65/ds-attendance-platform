import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server.js'
import { getLeadScreening, screeningLabels } from '../src/lib/lead-screening.ts'

const require = createRequire(import.meta.url)
// Compile actual modules in memory and inject only database dependencies.
// Tests never open a real DB, start WhatsApp, or create production leads.
function load(relativePath, overrides = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(id => id in overrides ? overrides[id] : require(id), module, module.exports)
  return module.exports
}

test('banner hides at zero, shows counts, and always opens the new-lead queue', () => {
  const { LeadAttentionBar } = load('../src/components/LeadAttentionBar.tsx')
  const render = props => renderToStaticMarkup(React.createElement(LeadAttentionBar, props))
  assert.equal(render({ count: 0, unavailable: false }), '')
  const html = render({ count: 3, unavailable: false })
  assert.match(html, /3 submissions not yet contacted/)
  assert.match(html, /href="\/leads\?status=new"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(render({ count: 0, unavailable: true }), /temporarily unavailable/)
  assert.match(render({ count: 3, unavailable: true }), /count may be out of date/)
})

test('truck qualification uses distinct green, red and amber states with readable labels', () => {
  const { LeadQualification } = load('../src/components/LeadQualification.tsx', { '@/lib/lead-screening': { screeningLabels } })
  for (const [result, colour] of [['meets', 'green'], ['not_met', 'red'], ['review', 'amber']]) {
    const html = renderToStaticMarkup(React.createElement(LeadQualification, { screening: { result } }))
    assert.ok(html.includes(`bg-${colour}-100`))
    assert.ok(html.includes(screeningLabels[result]))
  }
  assert.match(renderToStaticMarkup(React.createElement(LeadQualification)), /Needs review/)
})

test('the attention bar is above navigation and remains independent of the active page', () => {
  const nav = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8')
  assert.ok(nav.indexOf('<LeadAttentionBar') < nav.indexOf('{/* Logo */}'))
  assert.match(nav, /sticky top-0/)
  assert.doesNotMatch(nav, /pathname.*&&.*LeadAttentionBar/)
})

test('API excludes test notifications and sends only safe screening details', async () => {
  const queries = []
  const prisma = { lead: {
    count: async options => { queries.push(options); return 2 },
    findMany: async options => {
      queries.push(options)
      return [{ id: 'fixture', status: 'new', source: 'google_ads', rawData: JSON.stringify({ google_key: 'never-expose-this', user_column_data: [{ column_id: 'QUEBEC_LICENCE', string_value: 'Yes' }, { column_id: 'DRIVING_EXPERIENCE', string_value: 'No' }] }) }]
    },
  } }
  const { GET } = load('../src/app/api/leads/route.ts', { '@/lib/db': { prisma }, '@/lib/lead-screening': { getLeadScreening } })
  const response = await GET(new NextRequest('http://localhost/api/leads?status=new'))
  const data = await response.json()
  assert.deepEqual(queries[0].where, { status: 'new', isTest: false })
  assert.deepEqual(queries[1].where, { status: 'new', isTest: false })
  assert.equal(data.newCount, 2)
  assert.equal(data.leads[0].screening.result, 'not_met')
  assert.equal('rawData' in data.leads[0], false)
  assert.equal(JSON.stringify(data).includes('never-expose-this'), false)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  queries.length = 0
  await GET(new NextRequest('http://localhost/api/leads?includeTests=1'))
  assert.equal(queries[1].where.isTest, undefined)
  assert.equal(queries[0].where.isTest, false)
})

test('count-only polling does not fetch personal lead information', async () => {
  const prisma = { lead: { count: async () => 4, findMany: async () => { throw new Error('Should not fetch records') } } }
  const { GET } = load('../src/app/api/leads/route.ts', { '@/lib/db': { prisma }, '@/lib/lead-screening': { getLeadScreening } })
  const response = await GET(new NextRequest('http://localhost/api/leads?countOnly=1'))
  assert.deepEqual(await response.json(), { newCount: 4 })
})
