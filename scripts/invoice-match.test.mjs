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

const {
  invoiceBelongsToStudent,
  selectInvoiceForBalanceEdit,
  openBalanceFromInvoices,
  remainingBalanceUpdateAfterDelete,
} = load(path.join(root, 'src/lib/invoice-match.ts'))

const DEEP = { externalStudentId: 10, name: 'Deep Singh', phone: '5145550101' }
const SANDEEP_PHONE = '5145550202'
const RANDEEP_PHONE = '4385550303'

function invoice(partial) {
  return {
    externalStudentId: null,
    studentPhone: null,
    studentName: '',
    total: 0,
    paymentStatus: 'unpaid',
    remainingBalance: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

test('Deep Singh does not match Sandeep Singh or Randeep Singh', () => {
  for (const name of ['Sandeep Singh', 'Randeep Singh', 'sandeep singh']) {
    assert.equal(invoiceBelongsToStudent(invoice({ studentName: name }), { name: 'Deep Singh' }), false)
    assert.equal(
      invoiceBelongsToStudent(
        invoice({ studentName: name, studentPhone: SANDEEP_PHONE }),
        DEEP,
      ),
      false,
    )
  }
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ studentName: 'Randeep Singh', studentPhone: RANDEEP_PHONE, externalStudentId: 30 }),
      DEEP,
    ),
    false,
  )
})

test('Shah does not match Shaheer, and a single name part does not match', () => {
  assert.equal(invoiceBelongsToStudent(invoice({ studentName: 'Shaheer Iqbal' }), { name: 'Shah' }), false)
  assert.equal(invoiceBelongsToStudent(invoice({ studentName: 'Shaheer' }), { name: 'Shah' }), false)
  assert.equal(invoiceBelongsToStudent(invoice({ studentName: 'Laraib Shah' }), { name: 'Shah' }), false)
  assert.equal(invoiceBelongsToStudent(invoice({ studentName: 'Deep Singh' }), { name: 'Singh' }), false)
  assert.equal(invoiceBelongsToStudent(invoice({ studentName: 'Deep Singh' }), { name: 'Deep' }), false)
})

test('the same phone matches after spaces, dashes, and a country code', () => {
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ studentName: 'Someone Else', studentPhone: '514 555-1234' }),
      { name: 'Deep Singh', phone: '5145551234' },
    ),
    true,
  )
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ studentName: 'Deep Singh', studentPhone: '(514) 555-1234' }),
      { name: 'Other Person', phone: '+1 514-555-1234' },
    ),
    true,
  )
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ studentName: 'Deep Singh', studentPhone: '5145550101' }),
      { ...DEEP, phone: '(514) 555-0101' },
    ),
    true,
  )
})

test('a phone never falls back to the same name', () => {
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ studentName: 'Sandeep Singh', studentPhone: '514 555-9999' }),
      { externalStudentId: 2, name: 'Sandeep Singh', phone: '5145550101' },
    ),
    false,
  )
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ studentName: 'Sandeep Singh', studentPhone: null }),
      { name: 'Sandeep Singh', phone: '5145550101' },
    ),
    false,
  )
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ studentName: 'Sandeep Singh', studentPhone: SANDEEP_PHONE }),
      { name: 'Sandeep Singh' },
    ),
    false,
  )
})

test('exact name matches across case, spacing, and word order only when there is no phone', () => {
  assert.equal(
    invoiceBelongsToStudent(invoice({ studentName: 'deep   singh' }), { name: 'Deep Singh' }),
    true,
  )
  assert.equal(
    invoiceBelongsToStudent(invoice({ studentName: 'Singh, Deep' }), { name: 'Deep  Singh', phone: '   ' }),
    true,
  )
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ studentName: 'Deep Singh', studentPhone: '514 555-0101' }),
      { name: 'deep   singh', phone: '' },
    ),
    false,
  )
})

test('student id decides before phone or name', () => {
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ externalStudentId: 42, studentName: 'Sandeep Singh', studentPhone: SANDEEP_PHONE }),
      { externalStudentId: 42, name: 'Deep Singh', phone: '5145550101' },
    ),
    true,
  )
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ externalStudentId: 6, studentName: 'Deep Singh', studentPhone: '5145550101' }),
      { externalStudentId: 5, name: 'Deep Singh', phone: '5145550101' },
    ),
    false,
  )
  assert.equal(
    invoiceBelongsToStudent(
      invoice({ externalStudentId: null, studentName: 'Sandeep Singh', studentPhone: '514 555-0101' }),
      DEEP,
    ),
    true,
  )
})

test('edit balance targets only this student\'s newest invoice', () => {
  const invoices = [
    invoice({
      id: 'randeep-newest',
      studentName: 'Randeep Singh',
      studentPhone: RANDEEP_PHONE,
      externalStudentId: 30,
      createdAt: '2026-10-03T00:00:00.000Z',
      remainingBalance: 10,
    }),
    invoice({
      id: 'sandeep-newer',
      studentName: 'Sandeep Singh',
      studentPhone: '514 555-0202',
      externalStudentId: 20,
      createdAt: '2026-10-02T00:00:00.000Z',
      remainingBalance: 900,
    }),
    invoice({
      id: 'deep-new',
      studentName: 'Deep Singh',
      studentPhone: '5145550101',
      externalStudentId: 10,
      createdAt: '2026-10-01T00:00:00.000Z',
      remainingBalance: -25,
    }),
    invoice({
      id: 'deep-old',
      studentName: 'Singh, Deep',
      studentPhone: '(514) 555-0101',
      createdAt: '2026-09-01T00:00:00.000Z',
      remainingBalance: 400,
    }),
  ]
  const target = selectInvoiceForBalanceEdit(invoices, DEEP)
  assert.equal(target?.id, 'deep-new')
  assert.equal(selectInvoiceForBalanceEdit(invoices, { name: 'Sandeep Singh', phone: SANDEEP_PHONE })?.id, 'sandeep-newer')
  assert.equal(selectInvoiceForBalanceEdit(invoices, { name: 'Nobody Else', phone: '5145550000' }), null)
})

test('open balance keeps a newer negative or zero remainingBalance', () => {
  assert.equal(openBalanceFromInvoices([
    invoice({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z', remainingBalance: 500, total: 500 }),
    invoice({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z', remainingBalance: -40, total: 100, paymentStatus: 'paid' }),
  ]), -40)
  assert.equal(openBalanceFromInvoices([
    invoice({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z', remainingBalance: 500, total: 500 }),
    invoice({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z', remainingBalance: 0, total: 100, paymentStatus: 'paid' }),
  ]), 0)
  assert.equal(openBalanceFromInvoices([
    invoice({ id: 'oldest', createdAt: '2026-01-01T00:00:00.000Z', remainingBalance: 500, total: 500 }),
    invoice({ id: 'middle', createdAt: '2026-03-01T00:00:00.000Z', remainingBalance: -15, total: 20, paymentStatus: 'paid' }),
    invoice({ id: 'newest', createdAt: '2026-06-01T00:00:00.000Z', remainingBalance: null, total: 10, paymentStatus: 'paid' }),
  ]), -15)
  assert.equal(openBalanceFromInvoices([
    invoice({ id: 'a', createdAt: '2026-06-01T00:00:00.000Z', remainingBalance: null, total: 100 }),
    invoice({ id: 'b', createdAt: '2026-01-01T00:00:00.000Z', remainingBalance: null, total: 50, paymentStatus: 'paid' }),
  ]), 100)
})

test('delete recalculation rewrites only the same student\'s newest invoice', () => {
  const deleted = invoice({
    id: 'deep-deleted',
    studentName: 'Deep Singh',
    studentPhone: '514 555-0101',
    total: 100,
    remainingBalance: 250,
    createdAt: '2026-08-01T00:00:00.000Z',
  })
  const remaining = [
    invoice({
      id: 'sandeep',
      studentName: 'Sandeep Singh',
      studentPhone: SANDEEP_PHONE,
      total: 400,
      remainingBalance: 800,
      createdAt: '2026-10-03T00:00:00.000Z',
    }),
    invoice({
      id: 'randeep',
      studentName: 'Randeep Singh',
      studentPhone: '(438) 555-0303',
      externalStudentId: 30,
      total: 50,
      remainingBalance: 100,
      createdAt: '2026-10-02T00:00:00.000Z',
    }),
    invoice({
      id: 'deep-older',
      studentName: 'Deep Singh',
      studentPhone: '5145550101',
      total: 40,
      remainingBalance: 80,
      createdAt: '2026-07-01T00:00:00.000Z',
    }),
    invoice({
      id: 'deep-keep',
      studentName: 'Singh, Deep',
      studentPhone: '+1 514-555-0101',
      total: 80,
      remainingBalance: 150,
      createdAt: '2026-09-01T00:00:00.000Z',
    }),
  ]
  assert.deepEqual(remainingBalanceUpdateAfterDelete(deleted, remaining), {
    id: 'deep-keep',
    remainingBalance: 250,
  })

  const tagged = invoice({
    id: 'deep-tagged',
    externalStudentId: 10,
    studentName: 'Deep Singh',
    studentPhone: '5145550101',
    total: 25,
    remainingBalance: 10,
    createdAt: '2026-05-01T00:00:00.000Z',
  })
  const otherTagged = invoice({
    id: 'sandeep-tagged',
    externalStudentId: 20,
    studentName: 'Sandeep Singh',
    studentPhone: '5145550101',
    total: 999,
    remainingBalance: 999,
    createdAt: '2026-11-01T00:00:00.000Z',
  })
  assert.deepEqual(remainingBalanceUpdateAfterDelete(tagged, [otherTagged]), null)
})
