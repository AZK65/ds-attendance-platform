// Synthetic browser test: all APIs intercepted; no production profile is edited.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const puppeteer = require('puppeteer')
const origin = 'http://127.0.0.1:3102'

async function main() {
  const browser = await puppeteer.launch({ headless: true })
  try {
    await fs.mkdir('output/student-profile-ui', { recursive: true })
    const page = await browser.newPage()
    const student = { student_id: 42, full_name: 'Amira Bennett', phone_number: '15145550147', permit_number: 'A123',
      full_address: '12 Cedar Road', city: 'Montreal', postal_code: 'H3N1S2', email: 'amira@example.com', dob: '2000-04-09', status: 'new', contract_number: 2100, user_defined_contract_number: null }
    const coreFields = Object.fromEntries(Object.entries(student).filter(([key]) => !['student_id', 'phone_number', 'contract_number'].includes(key)))
    let failSave = true
    const writes = [], errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setCookie({ name: 'auth-token', value: 'valid', url: origin })
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url()), p = url.pathname
      if (!p.startsWith('/api/')) return void (url.origin === origin || ['data:', 'blob:'].includes(url.protocol) ? request.continue() : request.abort())
      let data = {}, status = 200
      if (p === '/api/students/42/edit') {
        if (request.method() === 'PATCH') {
          writes.push(JSON.parse(request.postData()))
          if (failSave) { status = 409; data = { error: 'Profile changed. Reload the profile before saving.' } }
          else { Object.assign(student, writes.at(-1).fields); data = { ok: true } }
        } else data = { fields: coreFields, phone: student.phone_number, contractNumber: 2100, revision: 'synthetic-revision' }
      } else if (p === '/api/students/42') data = { student, vehicleType: 'car', localStudent: null, registration: null,
        invoices: [], groups: [], exams: [], paperExams: [], summary: { totalInvoiced: 0, totalPaid: 0, openBalance: 0, groupCount: 0, certificateCount: 0, invoiceCount: 0 } }
      else if (p === '/api/students/profile') data = { invoices: [], exams: [], paperExams: [], summary: { totalInvoiced: 0, totalPaid: 0, openBalance: 0, creditBalance: 0 } }
      else if (p.includes('/student-events') || p.includes('/student-theory') || p.includes('/subcalendars')) data = []
      else if (p.includes('/signature')) data = { signatures: [] }
      else if (p === '/api/phone-change') data = { logs: [] }
      else if (p.includes('/attendance')) data = {}
      else if (p.startsWith('/api/auth')) data = { valid: true, authenticated: true }
      else if (p === '/api/whatsapp/status') data = { isConnected: true }
      else if (p === '/api/message-log') data = { messages: [] }
      else if (p === '/api/notifications') data = { notifications: [] }
      return void request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const click = async text => {
      const found = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label), text)
      assert(found.asElement(), `Missing button ${text}: ${JSON.stringify(errors)} ${await page.$eval('body', e => e.innerText)}`)
      await found.asElement().click()
    }
    await page.setViewport({ width: 1440, height: 900 })
    await page.goto(origin + '/students/42', { waitUntil: 'networkidle0' })
    await click('Edit profile')
    await page.waitForSelector('#profile-full_name')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"]')).opacity === '1')
    assert.equal(await page.$eval('#profile-dob', e => e.value), '2000-04-09')
    await page.screenshot({ path: 'output/student-profile-ui/desktop.png' })
    await page.$eval('#profile-full_address', e => { e.focus(); e.select() })
    await page.type('#profile-full_address', '18 Cedar Road')
    await click('Save changes')
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Profile changed'))
    assert.equal(await page.$eval('#profile-full_address', e => e.value), '18 Cedar Road')
    await page.setViewport({ width: 390, height: 650 })
    await page.waitForFunction(() => {
      const box = document.querySelector('[role="dialog"]').getBoundingClientRect()
      return box.top >= 0 && box.bottom <= innerHeight
    })
    await page.screenshot({ path: 'output/student-profile-ui/mobile.png' })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert(await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role="dialog"] button')].find(e => e.textContent === 'Save changes').getBoundingClientRect()
      return b.top >= 0 && b.bottom <= innerHeight
    }))
    failSave = false
    await click('Save changes')
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'))
    assert.equal(writes.length, 2)
    assert.equal(writes[1].fields.full_address, '18 Cedar Road')
    assert.equal(writes[1].fields.phone_number, undefined)
    assert.equal(writes[1].fields.sortie5Date, undefined)
    assert.equal(writes[1].revision, 'synthetic-revision')
    assert.deepEqual(errors, [])
    console.log('PASS: profile editor loads, saves all core fields, retains edits on error and keeps mobile Save visible; no phone/attendance writes.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
