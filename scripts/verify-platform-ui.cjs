/* Read-only UI smoke test. All /api requests are intercepted with synthetic
 * fixtures; never point this at production. Start an isolated dev server with
 * QAZI_DISABLE_BACKGROUND_JOBS=1 and no production .env before running. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const puppeteer = require('puppeteer')

const origin = 'http://127.0.0.1:3101'
const out = path.resolve('output/platform-ui')
const now = new Date().toISOString()
const groups = [
  { id: 'preview-car-1', name: 'Qazi Theory #1124', participantCount: 30, moduleNumber: 3, vehicleType: 'car', lastMessageDate: now },
  { id: 'preview-car-2', name: 'Qazi Theory #1123', participantCount: 18, moduleNumber: 5, vehicleType: 'car', lastMessageDate: now },
  { id: 'preview-car-3', name: 'Qazi Theory #1122', participantCount: 24, moduleNumber: 7, vehicleType: 'car', lastMessageDate: now },
  { id: 'preview-truck-1', name: 'Qazi Truck #001', participantCount: 12, moduleNumber: null, vehicleType: 'truck', lastMessageDate: now },
]
const teachers = [
  { id: 1, name: 'Ahmed Car', active: true, color: 1 },
  { id: 2, name: 'Ahmed Truck', active: true, color: 3 },
  { id: 3, name: 'Fayyaz Car-Theory', active: true, color: 5 },
]
let searchFails = false
const leadCount = 3
function fixture(url) {
  const p = url.pathname
  if (p === '/api/search') return { results: [
    { id: 'student-preview', type: 'student', title: 'Amira Bennett', subtitle: '(514) 555-0147 · Qazi Theory #1124', meta: 'Student', href: '/students/preview' },
    { id: 'group-preview', type: 'group', title: 'Qazi Theory #1124', subtitle: '30 members · Module 3', meta: 'Car', href: '/groups/preview-car-1' },
    { id: 'invoice-preview', type: 'invoice', title: 'QAZI-4102 · Amira Bennett', subtitle: '$250.00 · Paid', meta: 'Invoice', href: '/invoice/preview' },
  ] }
  if (p === '/api/whatsapp/status') return { isConnected: true, isConnecting: false }
  if (p === '/api/auth/heartbeat') return { valid: true }
  if (p === '/api/leads') return { leads: [], newCount: leadCount }
  if (p === '/api/inbox/attention') return { count: 0, preview: [] }
  if (p === '/api/message-log') return { messages: [] }
  if (p === '/api/groups') return { groups, connected: true }
  if (p === '/api/groups/participants') return { isConnected: true, participants: ['Amira Bennett', 'Noah Laurent', 'Maya Chen', 'Arjun Patel'].map((name, i) => ({ id: `1514555014${i}@c.us`, phone: `1514555014${i}`, name, pushName: null, groupId: groups[i].id, groupName: groups[i].name, moduleNumber: groups[i].moduleNumber, vehicleType: groups[i].vehicleType, lastMessageDate: now })) }
  if (p === '/api/scheduling/groups-next-theory') return { results: Object.fromEntries(groups.map(g => [g.name, { date: now, endDate: now, title: 'Upcoming theory class', module: g.moduleNumber }])) }
  if (p === '/api/scheduling/subcalendars') return teachers
  if (p === '/api/scheduling/events') {
    const start = url.searchParams.get('startDate') || now.slice(0, 10)
    const day = start.slice(0, 10)
    return [
      { id: 'preview-event-1', title: 'Session 3 - Amira Bennett', start_dt: `${day}T10:00:00`, end_dt: `${day}T12:00:00`, subcalendar_ids: [1] },
      { id: 'preview-event-2', title: 'Class 1 Theory - Qazi Truck #001', start_dt: `${day}T13:00:00`, end_dt: `${day}T17:00:00`, subcalendar_ids: [2] },
    ]
  }
  if (p === '/api/scheduling/teacher-phones') return { teachers: [] }
  if (p === '/api/scheduling/attendance') return {}
  if (p === '/api/registrations') return { registrations: [] }
  if (p === '/api/students/dismissed') return { dismissed: [] }
  if (p === '/api/bot') return { enabled: true, conversations: [] }
  if (p === '/api/inbox/chats') return { connected: true, chats: [{ id: '15145550147@c.us', name: 'Amira Bennett', isGroup: false, unreadCount: 1, timestamp: Math.floor(Date.now()/1000), lastMessage: { body: 'When is my next class?', timestamp: Math.floor(Date.now()/1000), fromMe: false } }] }
  if (p.endsWith('/messages')) return { connected: true, messages: [{ id: 'preview-message', body: 'When is my next class?', timestamp: Math.floor(Date.now()/1000), fromMe: false, senderName: 'Amira Bennett', type: 'chat', hasMedia: false }] }
  if (p === '/api/invoice/settings') return { settings: { schoolName: 'Qazi Driving School', nextInvoiceNumber: 4103, invoicePrefix: 'QAZI' } }
  if (p === '/api/invoice/services') return { services: [] }
  if (p === '/api/invoice/packages') return { packages: [] }
  if (p === '/api/kiosk') return { kiosks: [] }
  return { students: [], results: {}, participants: [], matches: [], sections: [], registrations: [], leads: [], settings: {}, sessions: [] }
}

async function main() {
  await fs.mkdir(out, { recursive: true })
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    const unknown = new Set()
    page.on('pageerror', e => errors.push(e.message))
    await page.setRequestInterception(true)
    page.on('request', request => {
      const u = new URL(request.url())
      if (u.pathname.startsWith('/api/')) {
        const status = u.pathname === '/api/search' && searchFails ? 503 : 200
        unknown.add(`${request.method()} ${u.pathname}`)
        void request.respond({ status, contentType: 'application/json', body: JSON.stringify(status === 503 ? { error: 'Preview connection failure' } : fixture(u)) })
      } else if (u.origin === origin || u.protocol === 'data:' || u.protocol === 'blob:') {
        void request.continue()
      } else { void request.abort() }
    })
    await page.setCookie({ name: 'auth-token', value: 'valid', url: origin })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.setViewport({ width: 1440, height: 960 })
    await page.goto(origin + '/groups', { waitUntil: 'networkidle0', timeout: 120000 })
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.waitForSelector('a[href="/groups/preview-car-1"]')
    await new Promise(r => setTimeout(r, 800))
    await page.screenshot({ path: path.join(out, 'groups-desktop.png'), fullPage: true })
    for (const width of [1440, 1280, 1024, 768, 390, 320]) {
      await page.setViewport({ width, height: 900 })
      await new Promise(r => setTimeout(r, 150))
      const layout = await page.evaluate(() => {
        const nav = document.querySelector('.platform-nav')
        const tools = document.querySelector('.platform-nav-tools').getBoundingClientRect()
        const logo = nav.querySelector('img').getBoundingClientRect()
        const links = nav.querySelector('.platform-nav-links').getBoundingClientRect()
        const lastLink = nav.querySelector('.platform-nav-links > :last-child').getBoundingClientRect()
        return { width: document.documentElement.scrollWidth, viewport: innerWidth, overlap: logo.right > tools.left || (innerWidth >= 1280 && lastLink.right > tools.left), labelledLinks: [...nav.querySelectorAll('a[aria-current], .platform-nav-link')].every(a => a.textContent.trim()), linksWidth: links.width }
      })
      assert(layout.width <= layout.viewport, `Page overflow at ${width}: ${layout.width}`)
      assert(!layout.overlap, `Header overlaps at ${width}`)
      assert(layout.labelledLinks, `Missing nav labels at ${width}`)
    }
    await page.setViewport({ width: 390, height: 844 })
    await page.click('[aria-label="Browse all pages"]')
    await page.waitForSelector('[role="menu"]')
    assert.equal(await page.$$eval('[role="menuitem"]', items => items.length), 11)
    await page.keyboard.press('Escape')
    await page.click('[aria-label="Message notifications"]')
    await page.waitForSelector('.platform-floating-panel')
    const notificationFits = await page.$eval('.platform-floating-panel', el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth })
    assert(notificationFits, 'Notifications extend outside mobile viewport')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: path.join(out, 'groups-mobile.png'), fullPage: true })
    await page.click('[aria-label="Search everything"]')
    await page.waitForSelector('[role="dialog"]')
    assert(await page.$('[aria-label="Close search"]'))
    await page.type('[cmdk-input]', 'amira')
    await page.waitForFunction(() => document.querySelector('[cmdk-list]')?.textContent.includes('Amira Bennett'))
    await page.screenshot({ path: path.join(out, 'search-mobile.png') })
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { hidden: true })
    searchFails = true
    await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control')
    await page.waitForSelector('[cmdk-input]')
    await page.type('[cmdk-input]', 'offline')
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Search is unavailable'), { timeout: 15000 })
    assert(!(await page.$eval('[cmdk-list]', e => e.textContent)).includes('No results'))
    searchFails = false
    await page.click('[role="alert"] button')
    await page.waitForFunction(() => document.querySelector('[cmdk-list]')?.textContent.includes('Amira Bennett'))
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { hidden: true })
    await page.setViewport({ width: 1440, height: 960 })
    await page.click('[aria-label="Search everything"]')
    await page.type('[cmdk-input]', 'amira')
    await page.waitForFunction(() => document.querySelector('[cmdk-list]')?.textContent.includes('Amira Bennett'))
    await page.screenshot({ path: path.join(out, 'search-desktop.png') })
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { hidden: true })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    await page.screenshot({ path: path.join(out, 'groups-dark.png'), fullPage: true })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }])
    for (const route of ['/scheduling', '/students', '/invoice', '/certificate', '/leads', '/kiosks', '/lms', '/inbox']) {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForFunction(() => document.querySelector('.platform-nav')?.textContent.includes('3 submissions not yet contacted'))
      await new Promise(r => setTimeout(r, 1000))
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
      await page.screenshot({ path: path.join(out, route.slice(1) + '-desktop.png') })
      await page.setViewport({ width: 390, height: 844 })
      await new Promise(r => setTimeout(r, 150))
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      console.log(route, 'mobile overflow:', overflow)
      if (overflow) console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth && getComputedStyle(el).position !== 'fixed').slice(0, 12).map(el => ({ tag: el.tagName, classes: el.className, right: el.getBoundingClientRect().right }))))
      await page.screenshot({ path: path.join(out, route.slice(1) + '-mobile.png') })
      assert(!overflow, `Mobile overflow on ${route}`)
      if (route === '/inbox') {
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Amira Bennett'))?.click())
        await page.waitForSelector('textarea')
        const fits = await page.$eval('textarea', e => e.getBoundingClientRect().bottom <= innerHeight)
        assert(fits, 'Inbox composer is outside viewport')
      }
      await page.setViewport({ width: 1440, height: 960 })
    }
    for (const route of ['/register', '/register/kiosk']) {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForFunction(() => document.body.textContent.includes('Class 5') || document.body.textContent.includes('Classe 5'))
      assert.equal(await page.$('.platform-shell'), null, 'Public registration must not receive the admin shell')
      console.log(route, 'shared registration form renders')
    }
    console.log('Intercepted APIs:', [...unknown].sort())
    assert.deepEqual(errors, [], 'Browser runtime errors')
    console.log('PASS: responsive navigation, search results/error/retry/escape, dark theme, page smoke checks, inbox composer. Screenshots:', out)
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
