/* Synthetic browser smoke test. Every API request is intercepted. No messages,
 * payments or real student changes are permitted. Use isolated port 3102 only. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const puppeteer = require('puppeteer')
const origin = 'http://127.0.0.1:3102'
const out = path.resolve('output/invoice-ui')

async function main() {
  await fs.mkdir(out, { recursive: true })
  const pdf = await fs.readFile('output/pdf/invoice-ledger-preview.pdf')
  const browser = await puppeteer.launch({ headless: true })
  const requests = [], errors = []
  let review = false, saved = false, failPayment = true, failReceipt = false
  try {
    const page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewport({ width: 1440, height: 960 })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.setCookie({ name: 'auth-token', value: 'valid', url: origin })
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url())
      if (!url.pathname.startsWith('/api/')) {
        return void (url.origin === origin || ['data:', 'blob:'].includes(url.protocol) ? request.continue() : request.abort())
      }
      const p = url.pathname
      requests.push({ path: p, body: request.postData() ? JSON.parse(request.postData()) : null })
      let data = {}, status = 200
      if (p === '/api/invoice/generate') return void request.respond(failReceipt ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic PDF failure' }) } : { status, contentType: 'application/pdf', body: pdf })
      if (p === '/api/invoice/settings') data = { invoicePrefix: 'QAZI', nextInvoiceNumber: saved ? 4103 : 4102, taxesEnabled: true, defaultGstRate: 5, defaultQstRate: 9.975 }
      else if (p === '/api/invoice/packages') data = { packages: [{ id: 'test-package', name: 'Class 5 course', totalPrice: 1000, taxInclusive: true, instalments: [{ id: 'part-1', instalmentNumber: 1, name: 'First payment', amount: 250 }] }] }
      else if (p === '/api/invoice/services') data = { services: [] }
      else if (p === '/api/students/balance') data = { totalInvoiced: saved ? 250 : 0, totalPaid: 0, openBalance: saved || review ? 1000 : 0, netBalance: saved || review ? 1000 : 0, creditBalance: 0, hasAccount: saved && !review, needsReview: review }
      else if (p === '/api/students/profile') data = { invoices: [] }
      else if (p === '/api/invoice/save') { saved = true; data = { invoice: { id: 'synthetic-invoice', invoiceNumber: 'QAZI-4102' } } }
      else if (p === '/api/invoice/update-payment') { status = failPayment ? 409 : 200; data = failPayment ? { error: 'Synthetic payment save failure' } : { invoice: { paymentStatus: 'paid' } } }
      else if (p === '/api/auth/heartbeat' || p === '/api/auth') data = { valid: true, authenticated: true }
      else if (p === '/api/whatsapp/status') data = { isConnected: true, isConnecting: false }
      else if (p === '/api/message-log') data = { messages: [] }
      else if (p === '/api/inbox/attention') data = { count: 0, preview: [] }
      else if (p === '/api/leads') data = { leads: [], newCount: 0 }
      else if (p.includes('send') || request.method() !== 'GET') { status = 403; data = { error: 'External actions disabled in UI test' } }
      else data = { kiosks: [], students: [], contacts: [], sessions: [], results: [] }
      void request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) })
    })
    async function clickText(text) {
      await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.includes(text)), {}, text)
      await page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.includes(text)).click(), text)
    }
    async function openReview() {
      await page.goto(origin + '/invoice?studentName=Amira%20Bennett&studentPhone=15145550147&studentId=42', { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(e => e.textContent === 'Car'))
      await page.evaluate(() => [...document.querySelectorAll('h3')].find(e => e.textContent === 'Car').closest('button').click())
      await clickText('First payment')
      await page.waitForSelector('#billing-mode')
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    await openReview()
    assert.equal(await page.$eval('#billing-mode', e => e.value), 'new-course')
    assert((await page.$eval('main', e => e.textContent)).includes('$1000.00'))
    await page.screenshot({ path: path.join(out, 'before-payment-desktop.png'), fullPage: true })
    await clickText('Generate Invoice PDF')
    await page.waitForFunction(() => document.body.textContent.includes('Invoice Generated!'))
    const writes = requests.filter(r => ['/api/invoice/save', '/api/invoice/generate'].includes(r.path))
    assert.deepEqual(writes.map(r => r.path), ['/api/invoice/save', '/api/invoice/generate'])
    assert.equal(writes[0].body.billingMode, 'new-course')
    assert.equal(writes[0].body.courseTotal, 1000)
    assert.equal(writes[1].body.invoiceNumber, 'QAZI-4102')
    await clickText('Paid in cash')
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Synthetic payment save failure'))
    assert.equal(requests.filter(r => r.path === '/api/invoice/generate').length, 1)
    assert((await page.$eval('main', e => e.textContent)).includes('Payment Method'))
    failPayment = false
    failReceipt = true
    await clickText('Paid in cash')
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Payment saved, but'))
    await clickText('Send payment link')
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('already recorded'))
    assert.equal(requests.filter(r => r.path === '/api/invoice/update-payment').length, 2)
    failReceipt = false
    await clickText('Paid in cash')
    await page.waitForFunction(() => document.body.textContent.includes('Send Invoice'))
    assert.equal(requests.filter(r => r.path === '/api/invoice/generate').length, 3)
    assert.equal(requests.filter(r => r.path === '/api/invoice/update-payment').length, 2)
    assert(requests.filter(r => r.path === '/api/invoice/generate').every(r => r.body.invoiceNumber === 'QAZI-4102'))
    assert(!requests.some(r => r.path.includes('/send-')))
    await new Promise(resolve => setTimeout(resolve, 400))
    await page.screenshot({ path: path.join(out, 'paid-receipt-desktop.png'), fullPage: true })
    review = true
    await page.setViewport({ width: 390, height: 844 })
    await openReview()
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('historical balance'))
    assert(await page.$$eval('button', buttons => buttons.find(b => b.textContent.includes('Generate Invoice PDF')).disabled))
    await page.screenshot({ path: path.join(out, 'review-required-mobile.png'), fullPage: true })
    assert.deepEqual(errors, [])
    console.log('PASS: save-before-PDF, stable receipt number, unpaid course balance, visible payment failure, paid PDF regeneration, and review-required guard.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
