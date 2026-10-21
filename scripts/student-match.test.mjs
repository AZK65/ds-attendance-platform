import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

const {
  namesEqual,
  normalizeStudentName,
  nameSearchVariants,
  phonesConflict,
  selectLocalStudentMatch,
  canOverwriteStudent,
  shouldAdoptLocalStudent,
  phoneLast10,
} = load('../src/lib/student-match.ts')

const SHAHEER_PHONE = '5145551001'
const LARAIB_PHONE = '4385552002'
const HASSAN_PHONE = '5145551003'
const ZHANA_PHONE = '4385552004'
const LABEEB_PHONE = '5145551005'
const ASMA_PHONE = '4385552006'
const AMNA_BIBI_PHONE = '5145551007'
const AMNA_JAVED_PHONE = '4385552008'

function row(partial) {
  return {
    certificates: [],
    phoneAlt: null,
    licenceNumber: null,
    address: null,
    ...partial,
  }
}

test('normalized names ignore case, commas, #tags, accents, and word order', () => {
  assert.equal(normalizeStudentName('Iqbal, Shaheer'), normalizeStudentName('Shaheer Iqbal'))
  assert.equal(namesEqual('Iqbal,  Shaheer', 'shaheer iqbal'), true)
  assert.equal(namesEqual('Naseer Jasba #1114', 'Jasba, Naseer'), true)
  assert.equal(namesEqual('José García', 'Garcia, Jose'), true)
  assert.equal(namesEqual('Laraib Shah', 'Shaheer, Iqbal'), false)
  assert.equal(namesEqual('Shah', 'Shaheer, Iqbal'), false)
  assert.equal(namesEqual('Shah', 'Laraib Shah'), false)
  assert.ok(nameSearchVariants('Iqbal, Shaheer').includes('Shaheer Iqbal'))
})

test('production cross-matches no longer bind a new student to a stranger', () => {
  const directory = [
    row({
      id: 'shaheer',
      name: 'Shaheer, Iqbal',
      phone: SHAHEER_PHONE,
      certificates: [{ id: 'cert-shaheer' }],
      licenceNumber: 'L-SHAHEER',
    }),
    row({
      id: 'hassan',
      name: 'Hassan, Ali',
      phone: '(514) 555-1003',
      certificates: [{ id: 'cert-hassan' }],
    }),
    row({
      id: 'labeeb',
      name: 'Labeeb Javed',
      phone: `1 ${LABEEB_PHONE}`,
      certificates: [{ id: 'cert-labeeb' }],
    }),
    row({
      id: 'amna-bibi',
      name: 'AMNA BIBI',
      phone: AMNA_BIBI_PHONE,
      certificates: [{ id: 'cert-amna' }],
    }),
  ]

  assert.equal(selectLocalStudentMatch(directory, { phone: LARAIB_PHONE, name: 'Laraib Shah' }), null)
  assert.equal(selectLocalStudentMatch(directory, { phone: ZHANA_PHONE, name: 'Zhana Assa' }), null)
  assert.equal(selectLocalStudentMatch(directory, { phone: ASMA_PHONE, name: 'Asma Javed' }), null)
  assert.equal(selectLocalStudentMatch(directory, { phone: AMNA_JAVED_PHONE, name: 'Amna Javed' }), null)
  assert.equal(selectLocalStudentMatch(directory, { name: 'Laraib Shah' }), null)
  assert.equal(selectLocalStudentMatch(directory, { name: 'Zhana Assa' }), null)
  assert.equal(selectLocalStudentMatch(directory, { name: 'Asma Javed' }), null)
  assert.equal(selectLocalStudentMatch(directory, { name: 'Amna Javed' }), null)
})

test('Iqbal, Shaheer still matches Shaheer Iqbal when the phone is the same', () => {
  const directory = [
    row({ id: 'laraib', name: 'Laraib Shah', phone: LARAIB_PHONE }),
    row({ id: 'shaheer', name: 'Shaheer Iqbal', phone: '(514) 555-1001', phoneAlt: '0000000000' }),
  ]
  const picked = selectLocalStudentMatch(directory, {
    phone: `+1 ${SHAHEER_PHONE}`,
    name: 'Iqbal, Shaheer',
  })
  assert.equal(picked?.id, 'shaheer')
  assert.equal(phoneLast10('(514) 555-1001'), phoneLast10('+1 514-555-1001'))
  assert.equal(
    selectLocalStudentMatch(
      [row({ id: 'named', name: 'Iqbal, Shaheer', phone: SHAHEER_PHONE })],
      { name: 'Shaheer Iqbal' },
    )?.id,
    'named',
  )
})

test('a provided phone never falls back to a different or missing phone', () => {
  const sameNameDifferentPhone = row({
    id: 'other',
    name: 'Laraib Shah',
    phone: SHAHEER_PHONE,
    certificates: [{ id: 'cert' }],
  })
  assert.equal(
    selectLocalStudentMatch([sameNameDifferentPhone], { phone: LARAIB_PHONE, name: 'Laraib Shah' }),
    null,
  )

  const containsTrap = row({ id: 'trap', name: 'Laraib Shah', phone: `${LARAIB_PHONE}99` })
  assert.equal(
    selectLocalStudentMatch([containsTrap], { phone: LARAIB_PHONE, name: 'Laraib Shah' }),
    null,
  )

  const phoneless = row({ id: 'blank', name: 'Laraib Shah', phone: null, phoneAlt: '  ' })
  assert.equal(
    selectLocalStudentMatch([phoneless, sameNameDifferentPhone], {
      phone: LARAIB_PHONE,
      name: 'Laraib Shah',
    })?.id,
    'blank',
  )
  assert.equal(
    selectLocalStudentMatch([row({ id: 'blank-other', name: 'Someone Else', phone: '' })], {
      phone: LARAIB_PHONE,
      name: 'Laraib Shah',
    }),
    null,
  )
})

test('phoneAlt counts as the student phone, and duplicates keep the certificate ranking', () => {
  const empty = row({
    id: 'empty',
    name: 'Shaheer Iqbal',
    phone: SHAHEER_PHONE,
    updatedAt: '2024-02-01T00:00:00.000Z',
  })
  const rich = row({
    id: 'rich',
    name: 'Iqbal, Shaheer',
    phone: '1111111111',
    phoneAlt: `1-${SHAHEER_PHONE}`,
    certificates: [{ id: 'cert' }],
    licenceNumber: 'L1',
    address: '1 Main',
    module1Date: '2024-01-01',
    module2Date: '2024-01-08',
    updatedAt: '2020-01-01T00:00:00.000Z',
  })
  const logs = []
  const picked = selectLocalStudentMatch(
    [empty, rich],
    { phone: SHAHEER_PHONE, name: 'Shaheer Iqbal' },
    (message) => logs.push(message),
  )
  assert.equal(picked.id, 'rich')
  assert.equal(logs.length, 1)

  const plain = row({ id: 'plain', name: 'Amna Javed', phone: null })
  const dated = row({
    id: 'dated',
    name: 'Javed, Amna',
    phone: '',
    certificates: [{ id: 'cert' }],
    sortie1Date: '2024-03-01',
  })
  const nameLogs = []
  const byName = selectLocalStudentMatch([plain, dated], { name: 'Amna Javed' }, (message) => nameLogs.push(message))
  assert.equal(byName.id, 'dated')
  assert.equal(nameLogs.length, 1)
})

test('certificate save and adopt refuse a different non-empty phone', () => {
  const shaheer = { id: 'shaheer', name: 'Shaheer, Iqbal', phone: SHAHEER_PHONE, licenceNumber: 'L-SHAHEER' }
  const laraib = { phone: LARAIB_PHONE, phoneAlt: '', licenceNumber: 'L-LARAIB' }
  assert.equal(phonesConflict(shaheer, laraib.phone, laraib.phoneAlt), true)
  assert.equal(canOverwriteStudent(shaheer, laraib), false)
  assert.equal(shouldAdoptLocalStudent(shaheer, laraib, null), false)

  assert.equal(canOverwriteStudent(shaheer, { phone: '(514) 555-1001', licenceNumber: 'OTHER' }), true)
  assert.equal(canOverwriteStudent(shaheer, { phone: LARAIB_PHONE, licenceNumber: 'L-SHAHEER' }), true)
  assert.equal(canOverwriteStudent({ phone: null, licenceNumber: null }, laraib), true)
  assert.equal(shouldAdoptLocalStudent(shaheer, laraib, 'shaheer'), true)
  assert.equal(shouldAdoptLocalStudent(shaheer, { ...laraib, licenceNumber: 'L-SHAHEER' }, null), true)

  const pairs = [
    [{ phone: SHAHEER_PHONE, licenceNumber: 'L-SHAHEER' }, { phone: LARAIB_PHONE, licenceNumber: 'L-LARAIB' }],
    [{ phone: HASSAN_PHONE, licenceNumber: null }, { phone: ZHANA_PHONE, licenceNumber: 'L-ZHANA' }],
    [{ phone: LABEEB_PHONE, licenceNumber: null }, { phone: ASMA_PHONE, licenceNumber: 'L-ASMA' }],
    [{ phone: AMNA_BIBI_PHONE, licenceNumber: null }, { phone: AMNA_JAVED_PHONE, licenceNumber: 'L-AMNA' }],
  ]
  for (const [stranger, student] of pairs) {
    assert.equal(canOverwriteStudent(stranger, student), false)
    assert.equal(shouldAdoptLocalStudent({ id: 'stranger', ...stranger }, student, null), false)
  }
})
