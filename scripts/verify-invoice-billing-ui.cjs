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
  let staleReview = true
  const reviewAccount = {
    identityKey: 'student:42', studentName: 'Amira Bennett', studentId: 42, phone: '5145550147', fingerprint: 'synthetic-v1',
    currentBalance: 500, totalPaid: 250, suggestedChargesCents: 100000, issues: [], canApprove: true, reviewed: false, audit: null,
    invoices: [{ id: 'receipt-one', number: 'TEST-4101', date: '2026-11-01', total: 250, status: 'paid', savedBalance: 750 },
      { id: 'receipt-two', number: 'TEST-4102', date: '2026-11-04', total: 250, status: 'unpaid', savedBalance: 500 }],
  }
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
      if (p === '/api/invoice/balance-review') {
        if (request.method() === 'POST') {
          if (staleReview) { status = 409; data = { error: 'This account changed. Reload and check the latest records before approving.' } }
          else {
            const body = JSON.parse(request.postData())
            Object.assign(reviewAccount, { fingerprint: 'synthetic-v2', reviewed: true, canApprove: false, currentBalance: 750,
              audit: { by: body.reviewedBy, note: body.reviewNote, at: '2026-11-05T16:00:00Z', openingCharges: 1000, paidAtReview: 250, previousBalance: 500 } })
            data = { success: true }
          }
        } else data = { accounts: [reviewAccount] }
        return void request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) })
      }
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
    await page.goto(origin + '/invoice/balances?q=%2B15145550147', { waitUntil: 'networkidle0' })
    await clickText('Amira Bennett')
    await page.waitForSelector('#review-total')
    assert.equal(await page.$eval('#review-total', e => e.value), '')
    assert(await page.$eval('button[type="submit"]', e => e.disabled))
    await page.type('#review-total', '1000')
    await page.type('#review-name', 'Samira Chen')
    await page.type('#review-note', 'Verified the signed course contract and both receipts.')
    assert(await page.$eval('button[type="submit"]', e => e.disabled))
    await page.click('input[type="checkbox"]')
    assert.equal(await page.$eval('button[type="submit"]', e => e.disabled), false)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
    await page.screenshot({ path: path.join(out, 'balance-review-mobile.png'), fullPage: true })
    await page.setViewport({ width: 1440, height: 960 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: path.join(out, 'balance-review-desktop.png'), fullPage: true })
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => document.body.textContent.includes('This account changed.'))
    assert.equal(requests.filter(r => r.path === '/api/invoice/balance-review' && r.body).length, 1)
    await clickText('Reload latest records')
    staleReview = false
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => document.body.textContent.includes('Saved review'))
    assert((await page.$eval('main', e => e.textContent)).includes('Samira Chen'))
    assert.equal(await page.$('#review-total'), null)
    const approvals = requests.filter(r => r.path === '/api/invoice/balance-review' && r.body)
    assert.equal(approvals.length, 2)
    assert.equal(approvals[1].body.openingChargesCents, 100000)
    assert.equal(approvals[1].body.approved, true)
    assert.equal(approvals[1].body.invoiceIds, undefined)
    await page.screenshot({ path: path.join(out, 'balance-reviewed-desktop.png'), fullPage: true })
    assert.deepEqual(errors, [])
    console.log('PASS: invoice flow and guarded balance review: no inferred total, required confirmation, formatted phone search, mobile layout, stale error, explicit approval and saved audit.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
