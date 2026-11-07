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
    let phoneStatus = 'not_registered', phoneSaves = 0
    let historyReads = 0
    const writes = [], chatWrites = [], errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setCookie({ name: 'auth-token', value: 'valid', url: origin })
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url()), p = url.pathname
      if (!p.startsWith('/api/')) return void (url.origin === origin || ['data:', 'blob:'].includes(url.protocol) ? request.continue() : request.abort())
      let data = {}, status = 200
      if (p === '/api/phone-change/preview') {
        data = { sameNumber: false, normalized: { digits: '15145550199', display: '+1 (514) 555-0199' }, duplicates: [], groups: [], rosterChecked: true,
          whatsapp: { status: phoneStatus, detail: phoneStatus === 'registered' ? 'This number is on WhatsApp.' : 'WhatsApp number not verified.' } }
      } else if (p === '/api/phone-change' && request.method() === 'POST') {
        phoneSaves++; status = 503; data = { error: 'WhatsApp could not verify this number. Nothing was changed.' }
      } else if (p === '/api/students/42/edit') {
        if (request.method() === 'PATCH') {
          writes.push(JSON.parse(request.postData()))
          if (failSave) { status = 409; data = { error: 'Profile changed. Reload the profile before saving.' } }
          else { Object.assign(student, writes.at(-1).fields); data = { ok: true } }
        } else data = { fields: coreFields, phone: student.phone_number, contractNumber: 2100, revision: 'synthetic-revision', chat: { groupId: 'group-42', contactId: '15145550147@c.us', name: 'Amira' } }
      } else if (p === '/api/groups/group-42/members' && request.method() === 'PATCH') {
        chatWrites.push(JSON.parse(request.postData())); data = { success: true }
      } else if (p === '/api/students/42') data = { student, vehicleType: 'car', localStudent: null, registration: null,
        invoices: [], groups: [], exams: [], paperExams: [], summary: { totalInvoiced: 0, totalPaid: 0, openBalance: 0, groupCount: 0, certificateCount: 0, invoiceCount: 0 } }
      else if (p === '/api/students/profile') data = { invoices: [], exams: [], paperExams: [], summary: { totalInvoiced: 0, totalPaid: 0, openBalance: 0, creditBalance: 0 } }
      else if (p.includes('/student-events') || p.includes('/student-theory') || p.includes('/subcalendars')) data = []
      else if (p.includes('/signature')) data = { signatures: [] }
      else if (p === '/api/phone-change') {
        historyReads++
        data = { logs: [{ id: 'history-1', oldDisplay: '+1 (514) 555-0123', newDisplay: '+1 (514) 555-0147',
          actorLabel: 'Front desk', createdAt: '2026-11-07T15:00:00Z', recordsUpdated: '{}', groupAction: 'none' }] }
      }
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
    await page.goto(origin + '/students/42', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Edit profile'))
    assert.equal(await page.$$eval('button', buttons => buttons.filter(b => b.textContent.trim() === 'Change phone number').length), 0)
    assert.equal(await page.$('[data-testid="phone-change-history"]'), null)
    assert.equal(historyReads, 0)
    await click('Edit profile')
    await page.waitForSelector('#profile-full_name')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"]')).opacity === '1')
    assert.equal(await page.$eval('#profile-dob', e => e.value), '2000-04-09')
    assert.equal(await page.$('[data-testid="phone-change-history"]'), null)
    assert.equal(historyReads, 0)
    await click('Previous changes')
    await page.waitForFunction(() => document.querySelector('[data-testid="phone-change-history"]')?.textContent.includes('Front desk'))
    assert(await page.$eval('[data-testid="phone-change-history"]', e => Boolean(e.closest('[role="dialog"]'))))
    assert.equal(historyReads, 1)
    await click('Hide previous changes')
    assert.equal(await page.$('[data-testid="phone-change-history"]'), null)
    await page.screenshot({ path: 'output/student-profile-ui/desktop.png' })
    await page.$eval('#profile-full_address', e => { e.focus(); e.select() })
    await page.type('#profile-full_address', '18 Cedar Road')
    await page.$eval('#profile-chat-name', e => { e.focus(); e.select() })
    await page.type('#profile-chat-name', 'Amira B')
    await click('Save chat name')
    await page.waitForFunction(() => document.body.innerText.includes('Chat name saved.'))
    assert.deepEqual(chatWrites, [{ contactId: '15145550147@c.us', newName: 'Amira B' }])
    assert.equal(await page.$eval('#profile-full_address', e => e.value), '18 Cedar Road')
    await click('Change phone number')
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2)
    await page.type('#new-phone', '5145550199')
    await page.waitForFunction(() => document.querySelector('[data-testid="whatsapp-check-result"]')?.textContent.includes('Not on WhatsApp'))
    assert(await page.$eval('[data-testid="confirm-phone-change"]', e => e.disabled))
    phoneStatus = 'unavailable'
    await page.type('#new-phone', ' ')
    await page.waitForFunction(() => document.querySelector('[data-testid="whatsapp-check-result"]')?.textContent.includes('WhatsApp check unavailable'))
    assert(await page.$eval('[data-testid="confirm-phone-change"]', e => e.disabled))
    phoneStatus = 'registered'
    await click('Check WhatsApp again')
    await page.waitForFunction(() => !document.querySelector('[data-testid="confirm-phone-change"]').disabled)
    // Editing an already verified number must immediately invalidate its result.
    await page.type('#new-phone', ' ')
    assert(await page.$eval('[data-testid="confirm-phone-change"]', e => e.disabled))
    await page.waitForFunction(() => !document.querySelector('[data-testid="confirm-phone-change"]').disabled)
    await page.click('[data-testid="confirm-phone-change"]')
    await page.waitForFunction(() => document.body.innerText.includes('Nothing was changed.'))
    assert.equal(phoneSaves, 1)
    assert.equal(await page.$eval('#new-phone', e => e.value.trim()), '5145550199')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1)
    assert.equal(await page.$eval('#profile-full_address', e => e.value), '18 Cedar Road')
    await click('Save changes')
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Profile changed'))
    assert.equal(await page.$eval('#profile-full_address', e => e.value), '18 Cedar Road')
    await page.setViewport({ width: 390, height: 650 })
    await click('Previous changes')
    await page.waitForSelector('[data-testid="phone-change-history"]')
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
    await click('Edit profile')
    await page.waitForSelector('#profile-full_name')
    assert.equal(await page.$('[data-testid="phone-change-history"]'), null)
    console.log('PASS: one profile editor includes chat and protected phone controls; core edits survive nested phone flow and save errors; mobile Save stays visible.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
