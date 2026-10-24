import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveTs(fromFile, spec) {
  if (spec.startsWith('@/')) return path.join(root, 'src', spec.slice(2))
  return path.resolve(path.dirname(fromFile), spec)
}

function load(file) {
  const source = readFileSync(file, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  })
  const module = { exports: {} }
  const localRequire = (id) => {
    if (id.startsWith('.') || id.startsWith('@/')) {
      let resolved = resolveTs(file, id)
      if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) resolved += '.ts'
      return load(resolved)
    }
    return require(id)
  }
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports)
  return module.exports
}

const hours = load(path.join(root, 'src/lib/theory-hours.ts'))
const plan = load(path.join(root, 'src/lib/theory-cohort-plan.ts'))
const kb = load(path.join(root, 'src/lib/bot/kb.ts'))

const {
  TEMPLATE_V1,
  TEMPLATE_V2,
  WEEKNIGHT_NET_MINUTES,
  SATURDAY_NET_MINUTES,
  CLASS1_THEORY_REQUIRED_NET_MINUTES,
  AHMED_INSTRUCTOR,
  netMinutes,
  formatNet,
  buildTheorySessions,
  formatTheoryScheduleForBot,
  theoryAttendanceDisplay,
  formatInstructorLine,
  formatReportHoursLine,
} = hours

const weeknight = (template) => template.days.find(day => day.day === 2)
const saturday = (template) => template.days.find(day => day.day === 6)

test('weeknight and Saturday net hours match both templates', () => {
  for (const template of [TEMPLATE_V1, TEMPLATE_V2]) {
    const night = weeknight(template)
    const sat = saturday(template)
    assert.equal(netMinutes(night.start, night.end, night.breaks), 225)
    assert.equal(netMinutes(sat.start, sat.end, sat.breaks), 450)
  }
  assert.equal(WEEKNIGHT_NET_MINUTES, 225)
  assert.equal(SATURDAY_NET_MINUTES, 450)
  assert.equal(10 * 225 + 5 * 450, 4500)
  assert.equal(CLASS1_THEORY_REQUIRED_NET_MINUTES, 4500)
  assert.equal(formatNet(225), '3h45')
  assert.equal(formatNet(450), '7h30')
  assert.equal(formatNet(4500), '75h00')
})

test('exact breaks merge overlaps and approximate breaks ignore position', () => {
  const overlapped = netMinutes('08:00', '12:00', [
    { minutes: 30, kind: 'break', start: '10:00', end: '10:30' },
    { minutes: 30, kind: 'break', start: '10:15', end: '10:45' },
  ])
  assert.equal(overlapped, 240 - 45)

  const approximate = netMinutes('17:30', '21:30', [
    { minutes: 15, kind: 'break', start: '01:00', end: '01:15', approximate: true },
  ])
  assert.equal(approximate, 225)

  assert.equal(netMinutes('17:30', '21:30', [
    { minutes: 500, kind: 'break', approximate: true },
  ]), 0)
})

test('the generator keeps every class whole and survives the November DST change', () => {
  for (const start of ['2026-08-04', '2026-10-13']) {
    const built = buildTheorySessions(start, TEMPLATE_V2.days)
    assert.equal(built.sessions.length, 15)
    assert.equal(built.totalNetMinutes, 4500)
    assert.equal(built.warning, null)
    assert.equal(built.sessions.every(session => session.netMinutes === 225 || session.netMinutes === 450), true)
  }
  const october = buildTheorySessions('2026-10-13', TEMPLATE_V2.days)
  assert.equal(october.sessions[11].date, '2026-11-07')
  assert.equal(october.sessions[11].start, '08:30')
  assert.equal(october.sessions[11].end, '17:30')
  assert.equal(october.sessions.at(-1).date, '2026-11-14')

  const over = buildTheorySessions('2026-10-13', [saturday(TEMPLATE_V2)], 100)
  assert.equal(over.sessions.length, 1)
  assert.equal(over.sessions[0].netMinutes, 450)
  assert.match(over.warning, /not shortened/)
})

const EN = `- Total: 125 hours (75 net hours of in-class theory in 15 classes + 50 hours in-cab practical with a licensed instructor).
- Theory schedule (in person at the school): 15 classes, 75 net hours in total. Breaks and lunch are not counted.
  - Tuesday and Thursday evenings, 5:30 PM–9:30 PM: 3h45 net (break 7:15–7:30 PM).
  - Saturday, 8:30 AM–5:30 PM: 7h30 net (breaks 10:30–10:45 AM and 3:30–3:45 PM; lunch 12:30–1:30 PM).
  - All three days are theory. The school sets each group's exact dates; the total is always 75 net hours.
- Practical (50 h in-cab): scheduled separately, arranged around the student's and instructor's availability. NOT on the fixed weekly grid.
- About 5 weeks to complete the 15 theory classes (15 net hours per week: two weeknights + one Saturday).
- If the verified student context lists the student's own class times, quote those; they take priority over the standard schedule.`

const FR = `- Total : 125 heures (75 heures nettes de théorie en classe, en 15 cours, + 50 heures de pratique en camion avec un instructeur).
- Horaire de la théorie (en personne, à l'école) : 15 cours, 75 heures nettes au total, pauses et dîner non comptés.
  - Mardi et jeudi soir, de 17 h 30 à 21 h 30 : 3 h 45 nettes (pause de 19 h 15 à 19 h 30).
  - Samedi, de 8 h 30 à 17 h 30 : 7 h 30 nettes (pauses de 10 h 30 à 10 h 45 et de 15 h 30 à 15 h 45; dîner de 12 h 30 à 13 h 30).
  - Les trois jours sont de la théorie. L'école fixe les dates exactes de chaque groupe; le total est toujours de 75 heures nettes.
- Pratique (50 h en camion) : planifiée séparément, selon les disponibilités de l'élève et de l'instructeur.
- Environ 5 semaines pour compléter les 15 cours de théorie (15 heures nettes par semaine).`

test('the bot schedule is rendered from template v2', () => {
  const text = formatTheoryScheduleForBot()
  assert.equal(text.en, EN)
  assert.equal(text.fr, FR)
  assert.equal(text.en.includes('17 h/week'), false)
  assert.equal(text.en.includes('17 hours per week'), false)
  assert.equal(text.en.includes('9h00'), false)
  assert.equal(text.fr.includes('9h00'), false)
})

test('Class 5 and Class 3 knowledge text stays in place', () => {
  const pricing = {
    car: {
      total: 1000,
      depositCents: 25000,
      schedule: [{ label: 'On Registration', sub: null, amount: 250 }],
      note: '',
    },
    truck: {
      total: 9050,
      depositCents: 50000,
      schedule: [{ label: 'Installment 1', sub: 'On registration', amount: 2262.5 }],
      note: '',
    },
    truckContract: { theoryHours: 75, theoryPrice: 2250, practicalHours: 50, practicalPrice: 6500, subtotal: 8750 },
  }
  const knowledge = kb.buildKnowledge(pricing)
  const class5 = knowledge.slice(knowledge.indexOf('## Class 5 (Car)'), knowledge.indexOf('## Class 1'))
  const class3 = knowledge.slice(knowledge.indexOf('## Class 3 (Straight truck)'), knowledge.indexOf('## Registration flow'))
  assert.match(class5, /12 theory modules, 15 practical/)
  assert.match(class5, /12 live group modules taught online on Zoom/)
  assert.match(class5, /\$50 \/ hour/)
  assert.equal(class5.includes('3h45'), false)
  assert.equal(class5.includes('75 net hours'), false)
  assert.match(class3, /Starter package: \$1,495 CAD/)
  assert.match(class3, /Extra hours: \$90 \/ hour/)
  assert.equal(class3.includes('8:30 AM'), false)
  assert.match(knowledge, /Missed theory hours \(Class 1\): \$30\/hour make-up fee/)
  assert.match(knowledge, /Practical \(50 h in-cab\): scheduled separately/)
  const rendered = formatTheoryScheduleForBot()
  assert.ok(knowledge.includes(rendered.en))
  assert.ok(knowledge.includes(rendered.fr))
})

test('cohort import plan matches the approved hours and the Saturday decision', () => {
  const first = plan.summarizeCohort('#001')
  const second = plan.summarizeCohort('#002')
  assert.equal(first.sessions, 15)
  assert.equal(first.netMinutes, 4500)
  assert.equal(first.netLabel, '75h00')
  assert.equal(first.signatureAttendance, 135)
  assert.equal(first.adminAttendance, 0)
  assert.equal(first.corrections, 142)
  assert.equal(second.sessions, 15)
  assert.equal(second.netMinutes, 4500)
  assert.equal(second.signatureAttendance, 3)
  assert.equal(second.adminAttendance, 12)
  assert.equal(second.corrections, 21)

  const rows = plan.plannedSessions().filter(session => session.cohort === '#002' && (session.date === '2026-10-31' || session.date === '2026-11-07'))
  assert.equal(rows.length, 2)
  for (const row of rows) {
    assert.equal(row.recordedStart, '08:30')
    assert.equal(row.recordedEnd, '17:30')
    assert.equal(row.netMinutes, 450)
    assert.equal(row.templateVersion, 2)
    assert.match(row.teamupAction, /no change/)
    assert.match(row.teamupAction, /out of scope/)
    assert.equal(/create|update event|retitle/i.test(row.teamupAction), false)
  }
  const added = plan.plannedSessions().find(session => session.cohort === '#002' && session.session === 15)
  assert.equal(added.teamupEventId, null)
  assert.match(added.teamupAction, /out of scope/)
})

test('attendance and instructor lines use the approved wording', () => {
  const pending = theoryAttendanceDisplay({
    status: 'present',
    basis: 'admin_confirmed',
    confirmedBy: 'Ars (administration)',
    confirmedAt: '2026-10-24',
  })
  assert.equal(pending.en, 'Attended — signature pending')
  assert.equal(pending.fr, 'Présent(e) — signature en attente')
  assert.equal(pending.staffNote, 'Attendance confirmed by administration (Ars, 2026-10-24) — per-lesson signature system not yet in service.')
  const signed = theoryAttendanceDisplay({ status: 'present', basis: 'signature' })
  assert.equal(signed.en, 'Signed')
  assert.equal(signed.fr, 'Signé')
  assert.equal(signed.staffNote, null)
  assert.equal(theoryAttendanceDisplay({ status: null }).en, 'Scheduled')
  assert.equal(theoryAttendanceDisplay({ status: 'absent' }).fr, 'Absent(e)')

  assert.equal(AHMED_INSTRUCTOR.saaqInstructorNo, null)
  assert.equal(AHMED_INSTRUCTOR.displayName, 'Ahmed')
  assert.equal(
    formatInstructorLine(AHMED_INSTRUCTOR, 'en'),
    'Instructor: Abdul Rahman Ahmed Qazi — SAAQ instructor no.: pending (not yet issued)',
  )
  assert.equal(
    formatInstructorLine(AHMED_INSTRUCTOR, 'fr'),
    'Formateur : Abdul Rahman Ahmed Qazi — No de formateur SAAQ : en attente (non encore attribué)',
  )
  assert.equal(
    formatReportHoursLine({ attendedNetMinutes: 4500, attendedCount: 15, lang: 'en' }),
    'Net hours: 3h45 (Tue/Thu), 7h30 (Sat), breaks and lunch excluded. Total: 75 h / 75 h — 15 / 15 classes.',
  )
  assert.equal(
    formatReportHoursLine({ attendedNetMinutes: 4500, attendedCount: 15, lang: 'fr' }),
    'Heures nettes : 3 h 45 (mardi/jeudi), 7 h 30 (samedi), pauses et dîner exclus. Total : 75 h / 75 h — 15 / 15 cours.',
  )
})

test('seed and import cannot rewrite Teamup, reminders, or signatures', () => {
  const files = [
    'src/lib/theory-import.ts',
    'src/lib/theory-seed.ts',
    'src/lib/theory-session-sync.ts',
    'scripts/import-theory-cohorts.ts',
    'scripts/seed-theory-program.ts',
    'src/instrumentation.ts',
  ]
  const forbidden = [
    /scheduledMessage/,
    /classSignature\.(update|delete|upsert)/,
    /createTruckTheoryEvent/,
    /from ['"]@\/lib\/teamup['"]/,
    /theory-import/,
    /seed-theory-program/,
    /ensureTheoryProgram/,
  ]
  const boot = readFileSync(path.join(root, 'src/instrumentation.ts'), 'utf8')
  for (const pattern of forbidden) assert.equal(pattern.test(boot), false, pattern.toString())
  for (const file of files.slice(0, 5)) {
    const source = readFileSync(path.join(root, file), 'utf8')
    assert.equal(/scheduledMessage/.test(source), false, file)
    assert.equal(/classSignature\.(update|delete|upsert)/.test(source), false, file)
    assert.equal(/createTruckTheoryEvent/.test(source), false, file)
    assert.equal(/from ['"]@\/lib\/teamup['"]/.test(source), false, file)
  }
})
