// Isolated UI regression test. All APIs are mocked; no bookings or messages.
const assert = require('node:assert/strict')
const puppeteer = require('puppeteer')
const origin = 'http://127.0.0.1:3102'

async function main() {
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.setCookie({ name: 'auth-token', value: 'valid', url: origin })
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url())
      if (!url.pathname.startsWith('/api/')) return void (url.origin === origin ? request.continue() : request.abort())
      let data = {}
      if (url.pathname === '/api/scheduling/subcalendars') data = [{ id: 1, name: 'Ahmed Car', active: true, color: 1 }]
      else if (url.pathname === '/api/scheduling/events') data = []
      else if (url.pathname === '/api/scheduling/student-car-classes') data = { classes: [{ id: 'synthetic', title: 'Session 1 - Amira Bennett', notes: 'Student: Amira Bennett', startDate: '2026-03-01T09:00:00' }] }
      else if (url.pathname === '/api/whatsapp/status') data = { isConnected: true }
      else if (url.pathname === '/api/message-log') data = { messages: [] }
      else if (url.pathname === '/api/scheduling/teacher-phones') data = { teachers: [] }
      else if (url.pathname === '/api/groups/participants') data = { participants: [] }
      else data = { valid: true, students: [], contacts: [], results: [], count: 0, preview: [], leads: [], newCount: 0 }
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const click = async text => {
      await page.waitForFunction(t => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === t), {}, text)
      await page.evaluate(t => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t).click(), text)
    }
    const choose = async (index, text) => {
      await (await page.$$('[role="dialog"] [role="combobox"]'))[index].click()
      await page.waitForSelector('[role="option"]')
      await page.evaluate(t => [...document.querySelectorAll('[role="option"]')].find(o => o.textContent.includes(t)).click(), text)
    }
    const fill = async () => {
      await page.type('input[placeholder="Search WhatsApp contacts or type name"]', 'Amira Bennett')
      await page.evaluate(() => {
        const e = document.querySelector('[role="dialog"] input[type="date"]')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '2026-03-02')
        e.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await choose(0, 'Ahmed Car')
      await choose(1, 'Session 2')
      await page.waitForFunction(() => document.querySelector('[role="dialog"]').textContent.includes('need at least 7 days'))
    }
    const disabled = text => page.evaluate(t => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === t).disabled, text)
    await page.goto(origin + '/scheduling', { waitUntil: 'networkidle0' })
    await click('New Class')
    await fill()
    assert(await disabled('Create'))
    await click('Extra Hours')
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]').textContent.includes('need at least 7 days'))
    assert.equal(await disabled('Create'), false)
    await click('Extra Hours')
    assert(await disabled('Create'))
    await click('Bulk')
    await fill()
    assert(await disabled('Review Schedule'))
    await click('Extra Hours')
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]').textContent.includes('need at least 7 days'))
    assert.equal(await disabled('Review Schedule'), false)
    await click('Extra Hours')
    assert(await disabled('Review Schedule'))
    assert.deepEqual(errors, [])
    console.log('PASS: single and bulk extra-hour toggles remove the gap block; switching back restores regular enforcement.')
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
