/* Isolated browser regression: API calls are synthetic and external requests
 * blocked. Never run against production. Preview marketing on 4175, platform
 * on 3103 with QAZI_DISABLE_BACKGROUND_JOBS=1 and no production environment. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const puppeteer = require('puppeteer')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const mode = process.argv[2] || 'marketing'
const origin = mode === 'marketing' ? 'http://127.0.0.1:4175' : 'http://127.0.0.1:3103'
const output = 'output/text-morph'
function fixture(path) {
  if (path === '/api/auth/heartbeat') return { valid: true }
  if (path === '/api/whatsapp/status') return { isConnected: true }
  if (path === '/api/invoice/settings') return { taxesEnabled: true, gstRate: 5, qstRate: 9.975, invoicePrefix: 'TEST', nextInvoiceNumber: 1 }
  if (path === '/api/students/balance') return { totalInvoiced: 0, totalPaid: 0, balance: 0, invoices: [] }
  if (path === '/api/students/profile') return { student: null, invoices: [] }
  if (path === '/api/leads') return { leads: [], newCount: 0 }
  if (path === '/api/inbox/attention') return { count: 0, preview: [] }
  if (path === '/api/message-log') return { messages: [] }
  return { services: [], packages: [], kiosks: [], students: [], profile: null, results: [] }
}
async function main() {
  await fs.mkdir(output, { recursive: true })
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(() => localStorage.setItem('qazi:cookies-v1', 'refused'))
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message) })
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/')) return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(url.pathname)) })
      if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return void request.continue()
      void request.abort()
    })
    await page.setViewport({ width: 1440, height: 1000 })
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
    const clickText = text => page.evaluate(text => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(text))
      if (!button) throw new Error('Missing button: ' + text)
      button.click()
    }, text)
    if (mode === 'marketing') {
      for (const route of ['/en', '/']) {
        await page.goto(origin + route, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('h1 [data-morph-text]')
        const original = route === '/en' ? 'Your licence,' : 'Votre permis,'
        const alternate = route === '/en' ? 'Your career,' : 'Votre carrière,'
        await page.waitForFunction(text => document.querySelector('h1 [data-morph-text] > .sr-only')?.textContent === text, { timeout: 8000 }, alternate)
        await wait(450)
        await page.screenshot({ path: `${output}/hero-career-${route === '/' ? 'fr' : 'en'}.png` })
        await page.waitForFunction(text => document.querySelector('h1 [data-morph-text] > .sr-only')?.textContent === text, { timeout: 8000 }, original)
        assert.equal(await page.$eval('h1 [data-morph-text] > .sr-only', el => el.textContent), original)
        await page.$eval('#courses', el => el.scrollIntoView())
        await wait(700)
        await page.evaluate(() => { window.priceNode = document.querySelector('#courses [data-morph-text]') })
        const initial = await page.$eval('#courses [data-morph-text] > .sr-only', el => el.textContent)
        await page.click('#courses button[aria-pressed="false"]')
        await wait(100)
        assert(await page.evaluate(() => window.priceNode === document.querySelector('#courses [data-morph-text]')), 'Prices remounted')
        const next = await page.$eval('#courses [data-morph-text] > .sr-only', el => el.textContent)
        assert.notEqual(initial, next)
        assert(await page.$eval('#courses [data-morph-text]', el => el.getAnimations({ subtree: true }).length > 0), 'Price did not animate')
        await wait(500)
        await page.screenshot({ path: `${output}/packages-${route === '/' ? 'fr' : 'en'}.png` })
        // Rapid reversals must end at the exact selected category, not a stale value.
        for (let i = 0; i < 6; i++) { await page.click('#courses button[aria-pressed="false"]'); await wait(25) }
        await wait(500)
        assert.equal(await page.$eval('#courses [data-morph-text] > .sr-only', el => el.textContent), next)
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
        await page.click('#courses button[aria-pressed="false"]')
        await wait(50)
        assert.equal(await page.$eval('#courses [data-morph-text]', el => el.getAnimations({ subtree: true }).length), 0)
        assert.equal(await page.$eval('#courses [data-morph-text] > .sr-only', el => el.textContent), initial)
        await page.setViewport({ width: 390, height: 844 })
        await page.$eval('#courses', el => el.scrollIntoView())
        await wait(500)
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow')
        await page.screenshot({ path: `${output}/packages-mobile-${route === '/' ? 'fr' : 'en'}.png` })
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
        await wait(700)
        await page.screenshot({ path: `${output}/hero-mobile-${route === '/' ? 'fr' : 'en'}.png` })
        await page.setViewport({ width: 1440, height: 1000 })
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
        console.log(route, 'prices', initial, '→', next, 'passed')
      }
    } else {
      await page.setCookie({ name: 'auth-token', value: 'valid', url: origin })
      await page.goto(origin + '/invoice?studentName=Preview%20Student&studentPhone=15145550147', { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Custom Invoice')))
      await clickText('Custom Invoice')
      await wait(700)
      await page.waitForSelector('input[placeholder="0.00"]')
      const setPrice = async (index, value) => {
        // Set a complete decimal as a paste would, avoiding the existing
        // controlled number input's normalization of intermediate "0." text.
        await page.evaluate((index, value) => {
          const field = document.querySelectorAll('input[placeholder="0.00"]')[index]
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value)
          field.dispatchEvent(new Event('input', { bubbles: true }))
        }, index, value)
        await wait(30)
      }
      const totalSelector = '.font-bold.text-base.font-mono [data-morph-text]'
      const total = () => page.$eval(totalSelector + ' > .sr-only', el => el.textContent)
      await page.evaluate(sel => { window.totalNode = document.querySelector(sel) }, totalSelector)
      for (const value of ['9', '10', '99', '100', '999.99']) {
        await setPrice(0, value)
        assert.equal(await total(), '$' + Number(value).toFixed(2))
      }
      await clickText('Add Item')
      await setPrice(1, '0.01')
      assert.equal(await total(), '$1000.00')
      assert(await page.$eval(totalSelector, el => el.getAnimations({ subtree: true }).length > 0), 'Total did not animate')
      assert(await page.evaluate(sel => window.totalNode === document.querySelector(sel), totalSelector))
      await wait(500)
      await page.$eval(totalSelector, el => el.scrollIntoView({ block: 'center' }))
      await page.screenshot({ path: `${output}/invoice-desktop.png` })
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
      await wait(100)
      await setPrice(0, '19.99')
      assert.equal(await total(), '$20.00')
      await wait(50)
      assert.equal(await page.$eval(totalSelector, el => el.getAnimations({ subtree: true }).length), 0)
      await page.setViewport({ width: 390, height: 844 })
      await page.$eval(totalSelector, el => el.scrollIntoView({ block: 'center' }))
      await wait(200)
      assert(await page.$eval(totalSelector, el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth }), 'Total clipped on mobile')
      await page.screenshot({ path: `${output}/invoice-mobile.png` })
      await page.emulateMediaType('print')
      assert.equal(await page.$eval(totalSelector + ' > .print\\:inline', el => getComputedStyle(el).display), 'block')
      assert.equal(await page.$eval(totalSelector + ' > .print\\:hidden', el => getComputedStyle(el).display), 'none')
      console.log('Invoice carry, additions, exact accessible amounts, reduced motion and print passed')
    }
    assert.deepEqual(errors, [])
    console.log(mode + ': PASS (all API calls intercepted; no live writes)')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
