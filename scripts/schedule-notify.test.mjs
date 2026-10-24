import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
  new Function('require', 'module', 'exports', outputText)(
    () => { throw new Error('unexpected import') },
    module,
    module.exports,
  )
  return module.exports
}

const plan = load(path.join(root, 'src/lib/schedule-notify-plan.ts'))

function actions() {
  const calls = []
  return {
    calls,
    syncReminder: async () => { calls.push('reminder') },
    notifyGroup: async () => { calls.push('post') },
    updateTheorySession: async () => { calls.push('theory') },
    consumeSuppression: async () => { calls.push('consume') },
    log: message => { calls.push(`log:${message}`) },
  }
}

test('a suppressed theory time change does not post and does not touch the reminder', async () => {
  const spy = actions()
  const result = await plan.applyGroupTheoryTimeChange(true, spy)
  assert.deepEqual(spy.calls, [
    'theory',
    'consume',
    'log:Schedule update suppressed; reminder left unchanged',
  ])
  assert.equal(result.posted, false)
  assert.equal(result.reminderRegenerated, false)
  assert.equal(result.theoryUpdated, true)
  assert.equal(result.suppressionConsumed, true)
  assert.equal(spy.calls.includes('post'), false)
  assert.equal(spy.calls.includes('reminder'), false)
})

test('a theory time change without a suppression posts and regenerates the reminder', async () => {
  const spy = actions()
  const result = await plan.applyGroupTheoryTimeChange(false, spy)
  assert.deepEqual(spy.calls, ['reminder', 'post'])
  assert.equal(result.posted, true)
  assert.equal(result.reminderRegenerated, true)
  assert.equal(result.theoryUpdated, false)
  assert.equal(result.suppressionConsumed, false)
})

test('the staff checkbox is off by default and only the checked path stays quiet', () => {
  const normal = plan.staffTheorySavePlan(false)
  assert.equal(normal.postToGroup, true)
  assert.equal(normal.regenerateReminder, true)
  assert.equal(normal.updateTheorySession, true)
  assert.equal(normal.armSuppression, false)

  const quiet = plan.staffTheorySavePlan(true)
  assert.equal(quiet.postToGroup, false)
  assert.equal(quiet.regenerateReminder, false)
  assert.equal(quiet.updateTheorySession, true)
  assert.equal(quiet.armSuppression, true)
})

test('a suppression is active only until it is consumed or expires', () => {
  const now = new Date('2026-10-24T12:00:00Z')
  assert.equal(plan.suppressionIsActive({
    consumedAt: null,
    expiresAt: new Date('2026-10-24T12:30:00Z'),
  }, now), true)
  assert.equal(plan.suppressionIsActive({
    consumedAt: now,
    expiresAt: new Date('2026-10-24T12:30:00Z'),
  }, now), false)
  assert.equal(plan.suppressionIsActive({
    consumedAt: null,
    expiresAt: new Date('2026-10-24T11:00:00Z'),
  }, now), false)
})

test('the silent-move script writes the suppression before it calls Teamup', () => {
  const source = readFileSync(path.join(root, 'scripts/teamup-silent-move.ts'), 'utf8')
  const suppressionAt = source.indexOf('await createScheduleSuppression')
  const teamupAt = source.indexOf('await updateTeamupEventTime')
  assert.ok(suppressionAt > 0)
  assert.ok(teamupAt > suppressionAt)
  assert.match(source, /--apply/)
  assert.match(source, /Dry-run only/)
})
