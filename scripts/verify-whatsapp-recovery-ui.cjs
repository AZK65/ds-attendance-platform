// All APIs mocked: never starts WhatsApp or sends a message.
const assert = require('node:assert/strict')
const puppeteer = require('puppeteer')
const QRCode = require('qrcode')
const fs = require('node:fs/promises')
const origin = 'http://127.0.0.1:3102'
async function main() {
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({ 'x-internal-secret': 'synthetic-local-ui-test-only' })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
    const image = await QRCode.toDataURL('synthetic-not-a-whatsapp-login', { width: 320 })
    const commands = [], errors = []
    let mode = 'qr'
    page.on('pageerror', error => errors.push(error.message))
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url()), p = url.pathname
      if (!p.startsWith('/api/')) return void (url.origin === origin || url.protocol === 'data:' ? request.continue() : request.abort())
      let data = {}, status = 200
      if (p === '/api/whatsapp/connect') { commands.push(JSON.parse(request.postData())); status = 202; data = { success: true } }
      else if (p === '/api/whatsapp/status') data = { isConnected: mode === 'connected', isConnecting: mode !== 'connected', authenticatedAt: mode === 'syncing' ? Date.now() : null }
      else if (p === '/api/whatsapp/qr') { status = mode === 'error' ? 401 : 200; data = { qrImage: mode === 'qr' ? image : null, generatedAt: Date.now() } }
      else if (p === '/api/whatsapp/diagnostics') data = { backup: { count: 2, lastBackupAt: new Date().toISOString(), revoked: false } }
      else if (p === '/api/auth') data = { valid: true, authenticated: true }
      else if (p === '/api/message-log') data = { messages: [] }
      else if (p === '/api/notifications') data = { notifications: [] }
      request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const click = text => page.evaluate(label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label)?.click(), text)
    await fs.mkdir('output/whatsapp-recovery-ui', { recursive: true })
    for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
      await page.setViewport({ width, height })
      await page.goto(origin + '/connect', { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('img[alt="WhatsApp QR Code"]')
      await click('Get a new QR code')
      await page.waitForFunction(() => document.querySelector('img[alt="WhatsApp QR Code"]'))
      assert.equal(commands.at(-1).action, 'refresh')
      assert.equal(await page.$eval('img[alt="WhatsApp QR Code"]', e => e.getBoundingClientRect().right <= innerWidth), true)
      await page.screenshot({ path: `output/whatsapp-recovery-ui/${name}.png`, fullPage: true })
    }
    for (const [state, text] of [['syncing', 'Phone linked. Syncing WhatsApp'], ['error', 'Sign in again'], ['connected', 'You are connected']]) {
      mode = state
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(text => document.body.innerText.includes(text), { timeout: 30000 }, text)
      assert.equal(await page.$('img[alt="WhatsApp QR Code"]'), null)
    }
    assert.deepEqual(errors, [])
    console.log('Desktop/mobile QR, real refresh request, syncing, expired staff login and connected states passed.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
