// Synthetic invoice only. All API calls are intercepted; no email is sent.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const puppeteer = require('puppeteer')
const origin = 'http://127.0.0.1:3102'

async function main() {
  const browser = await puppeteer.launch({ headless: true })
  try {
    await fs.mkdir('output/invoice-email-ui', { recursive: true })
    const page = await browser.newPage()
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.setExtraHTTPHeaders({ 'x-internal-secret': 'synthetic-local-ui-test-only' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    let state = 'history'
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url()), p = url.pathname
      if (!p.startsWith('/api/')) return void (url.origin === origin || ['blob:', 'data:'].includes(url.protocol) ? request.continue() : request.abort())
      let data = {}, status = 200
      if (p === '/api/invoice/example') data = {
        invoice: { id: 'example', invoiceNumber: 'DEMO-001', studentName: 'Test Student', studentEmail: 'student@example.com', invoiceDate: '2026-11-13',
          lineItems: JSON.stringify([{ description: 'Driving lesson', quantity: 1, unitPrice: 150 }]), subtotal: 150, gstAmount: 0, qstAmount: 0, total: 150, paymentStatus: 'paid', paymentMethod: 'cash', remainingBalance: 0 },
        settings: { schoolName: 'Qazi', schoolAddress: 'Demo address', schoolCity: 'Montreal', schoolProvince: 'QC', schoolPostalCode: 'H3N 1S2', defaultGstRate: 5, defaultQstRate: 9.975, taxesEnabled: false, cloverConfigured: false },
      }
      else if (p.endsWith('/emails')) {
        status = state === 'error' ? 500 : 200
        data = { attempts: state === 'empty' ? [] : [
          { id: 'a', recipient: 'student@example.com', status: 'sent', attemptedAt: '2026-11-13T16:05:00Z', sentAt: '2026-11-13T16:05:02Z', source: 'manual' },
          { id: 'b', recipient: 'student@example.com', status: 'failed', attemptedAt: '2026-11-13T15:00:00Z', error: 'Sender domain is not verified.', source: 'manual' },
          { id: 'c', recipient: 'student@example.com', status: 'unknown', attemptedAt: '2026-11-13T14:00:00Z', source: 'manual' },
          { id: 'd', recipient: 'student@example.com', status: 'sent', attemptedAt: '2026-11-12T14:00:00Z', source: 'online-payment' },
        ] }
      } else if (p === '/api/invoice/generate') return void request.respond({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' })
      else if (p === '/api/students/profile') data = { invoices: [], summary: { openBalance: 0, totalPaid: 150, totalInvoiced: 150 } }
      else if (p === '/api/auth') data = { valid: true, authenticated: true }
      else if (p === '/api/message-log') data = { messages: [] }
      else if (p === '/api/notifications') data = { notifications: [] }
      else if (p === '/api/whatsapp/status') data = { isConnected: true }
      return void request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const selector = '[aria-label="Invoice email history"]'
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await page.setViewport({ width, height })
      await page.goto(origin + '/invoice/example', { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(s => document.querySelector(s)?.textContent.includes('Status unknown'), {}, selector)
      const section = await page.$(selector)
      await section.scrollIntoView()
      assert.equal(await section.$$eval('li', rows => rows.length), 3)
      await section.$eval('button', button => button.click())
      assert.equal(await section.$$eval('li', rows => rows.length), 4)
      const rect = await section.boundingBox()
      assert(rect.x >= 0 && rect.x + rect.width <= width + 1, 'History must fit viewport')
      assert.equal(await section.$eval('ul', element => element.scrollWidth <= element.clientWidth + 1), true)
      await page.waitForFunction(s => {
        let element = document.querySelector(s)
        while (element) { if (Number(getComputedStyle(element).opacity) < 1) return false; element = element.parentElement }
        return true
      }, {}, selector)
      await section.screenshot({ path: `output/invoice-email-ui/${name}-history.png` })
      await page.screenshot({ path: `output/invoice-email-ui/${name}.png`, fullPage: true })
    }
    for (const mode of ['empty', 'error']) {
      state = mode
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(({ s, text }) => document.querySelector(s)?.textContent.includes(text), { timeout: 30000 }, { s: selector, text: mode === 'empty' ? 'No recorded email attempts.' : 'Couldn’t load email history.' })
    }
    assert.deepEqual(errors, [])
    console.log('Invoice email history: desktop, mobile, expand, empty and error states passed. No real emails sent.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
