/* Synthetic UI regression test: intercepts every API and blocks external
 * requests. Never sends WhatsApp, grades exams, or changes student records.
 * Run against the isolated port-3101 server used by verify-platform-ui.cjs. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const puppeteer = require('puppeteer')
const { fixture, origin } = require('./verify-platform-ui.cjs')
const out = 'output/responsive-dialogs'
const now = new Date().toISOString()
const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="40" y="80" font-size="26">Synthetic exam preview</text><path d="M40 140H560M40 200H560M40 260H560" stroke="gray"/></svg>')
const examPage = { id: 'page-1', pageNumber: 1, mimetype: 'image/jpeg', filename: 'sample-exam.jpg', createdAt: now, url: photo, markedUrl: photo }
const paperExam = { id: 'exam-1', title: 'Module 5 practice exam', groupId: 'preview-car-1', groupName: 'Qazi Theory #1124', status: 'graded', score: 19, totalQuestions: 24, passingScore: 18, passed: true, confidence: .95, error: null, verified: false, receivedAt: now, originalDownloadUrl: '/api/mock-download', markedDownloadUrl: '/api/mock-download', pages: [examPage] }
const profile = { student: { student_id: 10052, full_name: 'Amira Bennett Laurent', phone_number: '15145550147', permit_number: '', full_address: '123 Sample Street', city: 'Montreal', postal_code: 'H1H 1H1', email: 'test@example.invalid', dob: '2000-02-14', status: 'Active', contract_number: 0, user_defined_contract_number: null }, localStudent: null, invoices: [], vehicleType: 'car', groups: [], exams: [], paperExams: [paperExam], summary: { totalInvoiced: 0, totalPaid: 0, openBalance: 0, invoiceCount: 0, certificateCount: 0, groupCount: 0 }, registration: null }
const answers = Object.fromEntries(Array.from({length:24}, (_, i) => [String(i+1), 'C']))
const exam = { group: { id: 'preview-car-1', name: 'Qazi Theory #1124' }, session: { id: 'session-1', title: 'Module 5', status: 'closed', startedAt: now, closedAt: now, hasAnswerKey: true, answerKey: answers, examName: 'Module 5', testNumber: 'TEST-1', totalQuestions: 24, passingScore: 18 }, history: [], students: [{ contactId: 'contact-1', name: profile.student.full_name, phone: profile.student.phone_number, submitted: true, submission: { ...paperExam, studentName: profile.student.full_name, phone: profile.student.phone_number, senderJid: '15145550147@c.us', answers, uncertain: [], wrong: [], notes: 'Synthetic test only', resultNotifiedAt: null, resultNotifyError: null } }], unmatched: [], stats: { total: 1, submitted: 1, missing: 0, pages: 1, graded: 1, passed: 1, failed: 0, review: 1, processing: 0 } }
function data(url) {
  const p = url.pathname
  if (p === '/api/students/preview') return profile
  if (p === '/api/students/preview-truck') return {...profile,vehicleType:'truck'}
  if (p.endsWith('/theory-evaluations')) return {competencies:[],summaryLine:'No evaluations',locked:false,finalizedAt:null,revisionNo:0,instructors:[],updatedAt:null,updatedByLabel:null}
  if (p.endsWith('/results-sheet')) return {status:'draft',locked:false,masteredCount:0,updatedAt:null,updatedByLabel:null}
  if (p.endsWith('/saaq-attestations')) return {externalStudentId:10052,today:now.slice(0,10),slots:Object.fromEntries(['theory','practical'].map(kind=>[kind,{kind,status:'not_received',receivedOn:null,current:null,history:[],dateChanges:[]}]))}
  if (p === '/api/students/profile') return profile
  if (p === '/api/phone-change') return { logs: [] }
  if (p === '/api/scheduling/student-events' || p === '/api/scheduling/student-theory') return []
  if (p === '/api/scheduling/signature' || p === '/api/scheduling/instructor-signature') return { signatures: [] }
  if (p === '/api/groups/preview-car-1/paper-exam') return exam
  if (p === '/api/groups/preview-car-1') return {group:{id:'preview-car-1',name:'Qazi Theory #1124',vehicleType:'car',moduleNumber:5},participants:[],pendingInvites:[]}
  if (p === '/api/groups/preview-car-1/schedule') return {events:Array.from({length:6},(_,i)=>({id:`class-${i}`,title:`Module ${i+1} - Qazi Theory #1124`,start_dt:`2026-12-${String(i+10).padStart(2,'0')}T17:30:00`,end_dt:`2026-12-${String(i+10).padStart(2,'0')}T19:30:00`,subcalendar_ids:[3],moduleNumber:i+1,sessionNumber:null,totalSessions:null,isTruck:false})),reminders:{}}
  if (p.startsWith('/api/inbox/chats/') && p.endsWith('/messages')) return {connected:true,messages:[{id:'photo-1',body:'',timestamp:Math.floor(Date.now()/1000),fromMe:false,senderName:'Amira Bennett',type:'image',hasMedia:true,mediaUrl:photo,mimetype:'image/jpeg',filename:'exam-photo.jpg'}]}
  return fixture(url)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function clickText(page, text, scope = 'button') {
  await page.waitForFunction((text, scope) => [...document.querySelectorAll(scope)].some(b => b.textContent.trim() === text), {timeout:30000}, text, scope)
  const handle = await page.evaluateHandle((text, scope) => [...document.querySelectorAll(scope)].find(b => b.textContent.trim() === text), text, scope)
  assert(handle.asElement(), `Missing control: ${text}`)
  await handle.asElement().click()
  await handle.dispose()
}
async function reach(page, selector) {
  await page.$eval(selector, el => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  await sleep(50)
  assert(await page.$eval(selector, el => {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && el.contains(document.elementFromPoint(x, y))
  }), `Clipped/unreachable: ${selector}`)
}
async function fits(page) {
  const dimensions = await page.$eval('[role="dialog"]', el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, viewport:[innerWidth,innerHeight], overflow:el.scrollWidth-el.clientWidth } })
  assert(dimensions.left >= 0 && dimensions.top >= 0 && dimensions.right <= dimensions.viewport[0]+1 && dimensions.bottom <= dimensions.viewport[1]+1 && dimensions.overflow <= 1, JSON.stringify(dimensions))
}
async function main() {
  await fs.mkdir(out, {recursive:true})
  const browser = await puppeteer.launch({ headless:true })
  try {
    const page = await browser.newPage()
    const errors = [], mutations = [], downloads = []
    page.on('pageerror', e => { errors.push(e.message); console.error('Browser error at',page.url(),e.stack) })
    await page.setRequestInterception(true)
    page.on('request', r => {
      const u = new URL(r.url())
      if (u.pathname.startsWith('/api/')) {
        const readOnlyPosts = ['/api/auth/heartbeat','/api/students/batch-match','/api/scheduling/batch-classes','/api/scheduling/groups-next-theory']
        if (!['GET','HEAD'].includes(r.method()) && !readOnlyPosts.includes(u.pathname)) mutations.push(`${r.method()} ${u.pathname}`)
        if (u.pathname === '/api/students/documents') {
          downloads.push(u)
          return void r.respond({ status: 422, contentType:'application/json', body:JSON.stringify({error:'Synthetic download error: please retry'}) })
        }
        return void r.respond({status:200,contentType:'application/json',body:JSON.stringify(data(u))})
      }
      if (u.origin === origin || ['data:','blob:'].includes(u.protocol)) void r.continue()
      else void r.abort()
    })
    await page.setCookie({name:'auth-token',value:'valid',url:origin})
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}])
    await page.setViewport({width:1440,height:800})
    await page.goto(origin+'/students/preview',{waitUntil:'networkidle0',timeout:120000})
    await page.waitForFunction(() => document.body.textContent.includes('Amira Bennett Laurent'))
    await page.addStyleTag({content:'nextjs-portal {display:none !important}'})
    for (const width of [320,390,768,1024,1440]) {
      await page.setViewport({width,height:600}); await sleep(100)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      if (overflow) console.log('Profile overflow',width,await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth).slice(0,8).map(e=>({tag:e.tagName,classes:e.className,text:e.textContent.slice(0,70)}))))
      assert(!overflow, `Profile overflow at ${width}`)
    }
    await clickText(page,'Documents')
    await page.waitForSelector('[data-testid="student-documents-dialog"]')
    for (const [width,height] of [[1920,1080],[1440,800],[1280,620],[1024,600],[960,540],[853,480],[768,600],[390,844],[390,600],[320,568],[844,390],[640,360]]) {
      await page.setViewport({width,height}); await sleep(100)
      await fits(page)
      if (height >= 480) {
        const visible = await page.$$eval('[role="dialog"] [data-slot="dialog-footer"] button', bs => bs.every(b => {const r=b.getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight}))
        assert(visible, `Footer not pinned at ${width}x${height}`)
      }
      await reach(page,'[data-testid="saaq-attestations-zip"]')
      await page.$eval('[role="dialog"] [data-slot="dialog-body"]', el => { el.scrollTop = el.scrollHeight })
      await reach(page,'[role="dialog"] [data-slot="dialog-footer"] button:last-child')
      await page.screenshot({path:`${out}/documents-${width}x${height}.png`})
    }
    await page.setViewport({width:960,height:540})
    await clickText(page,'Select all')
    await clickText(page,'Download selected')
    await page.waitForSelector('[role="alert"]')
    assert.equal(downloads[0].searchParams.get('studentId'),'preview')
    assert.equal(downloads[0].searchParams.get('include').split(',').length,9)
    assert(!downloads[0].searchParams.get('include').includes('attestations'))
    await reach(page,'[role="alert"]')
    await clickText(page,'Download all as ZIP')
    await sleep(100)
    assert.equal(downloads[1].searchParams.get('archive'),'1')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]',{hidden:true})
    await page.click('[title="Open exam page 1"]')
    for (const [width,height] of [[1280,620],[390,600],[844,390]]) {
      await page.setViewport({width,height}); await sleep(100); await fits(page)
      await reach(page,'[role="dialog"] a')
      await page.screenshot({path:`${out}/exam-preview-${width}x${height}.png`})
    }
    await page.keyboard.press('Escape')
    await page.goto(origin+'/groups/preview-car-1/paper-exam',{waitUntil:'networkidle0',timeout:120000})
    await clickText(page,'Review & verify')
    await page.waitForSelector('.exam-review-dialog')
    for (const [width,height] of [[1920,1080],[1280,620],[1024,600],[853,480],[390,844],[320,568],[844,390]]) {
      await page.setViewport({width,height}); await sleep(100); await fits(page)
      await reach(page,'[aria-label="Answer for question 24"]')
      await reach(page,'.exam-review-workspace > div:last-child > div:last-child button:last-child')
      await reach(page,'.exam-review-dialog a')
      await page.screenshot({path:`${out}/exam-review-${width}x${height}.png`})
    }
    await page.keyboard.press('Escape')
    await page.goto(origin+'/students/preview-truck',{waitUntil:'networkidle0'})
    await clickText(page,'Documents')
    await page.setViewport({width:1024,height:600}); await fits(page)
    await reach(page,'[role="dialog"] [data-slot="dialog-footer"] button:last-child')
    await page.keyboard.press('Escape')
    await page.goto(origin+'/students',{waitUntil:'networkidle0'})
    await clickText(page,'New student')
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.includes('New Group + Class Setup'))?.click())
    await page.waitForSelector('[role="dialog"] textarea')
    for (const [width,height] of [[1024,600],[390,600],[844,390]]) {
      await page.setViewport({width,height}); await sleep(100); await fits(page)
      await reach(page,'[role="dialog"] textarea')
      await reach(page,'[role="dialog"] [data-slot="dialog-footer"] button:first-child')
    }
    await page.keyboard.press('Escape')
    await page.goto(origin+'/groups/preview-car-1',{waitUntil:'networkidle0'})
    await clickText(page,'Edit schedule')
    await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('Module 6'))
    for (const [width,height] of [[1024,600],[390,600],[844,390]]) {
      await page.setViewport({width,height}); await sleep(100); await fits(page)
      await reach(page,'[role="dialog"] [data-slot="dialog-body"] > :last-child input')
    }
    await page.keyboard.press('Escape')
    await page.goto(origin+'/inbox',{waitUntil:'networkidle0'})
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Amira Bennett'))?.click())
    await page.waitForSelector('[aria-label="Open exam-photo.jpg"]')
    await page.click('[aria-label="Open exam-photo.jpg"]')
    for (const [width,height] of [[1280,620],[390,600],[844,390]]) {
      await page.setViewport({width,height}); await sleep(100); await fits(page)
      await reach(page,'[role="dialog"] a[download]')
    }
    await page.keyboard.press('Escape')
    await page.goto(origin+'/scheduling',{waitUntil:'networkidle0'})
    await clickText(page,'Export')
    for (const [width,height] of [[1280,620],[390,600],[844,390]]) {
      await page.setViewport({width,height}); await sleep(100); await fits(page)
      await reach(page,'[role="dialog"] [data-slot="dialog-footer"] button:first-child')
    }
    assert.deepEqual(errors,[],'Runtime errors')
    assert.deepEqual(mutations,[],'Test unexpectedly attempted a data mutation')
    console.log('PASS: documents at 12 viewports, car/truck profiles, selected/all download parameters and error state, exam preview/review, group wizard/schedule, inbox photo and calendar export; no data mutations. Screenshots:',out)
  } finally { await browser.close() }
}
main().catch(e => {console.error(e);process.exitCode=1})
