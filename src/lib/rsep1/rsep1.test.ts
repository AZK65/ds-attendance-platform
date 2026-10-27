import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { masteryFromGrade, theorySummary, theorySummaryLine } from './competencies'
import { buildRsep1Pdf, readRsep1Fields } from './fill'
import { hashBytes, loadRsep1Template, RSEP1_TEMPLATE_SHA256, rsep1TemplatePath } from './template'
import {
  emptyManual,
  getEffectiveRsep1Values,
  hasTheoryOverride,
  parseGradePercent,
  parseTheoryDate,
  readStoredManual,
} from './values'
import fieldMap from './rsep1-field-map.json' with { type: 'json' }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const dbDir = mkdtempSync(path.join(tmpdir(), 'rsep1-db-'))
process.env.DATABASE_URL = `file:${path.join(dbDir, 'test.db')}`

const actor = { sessionId: null, label: 'test-device' }
const ctx = {
  externalStudentId: 900001,
  studentName: 'Sample Class One',
  registrationId: null,
}

test('80% boundary and a missing grade', () => {
  assert.equal(masteryFromGrade(0), 'No')
  assert.equal(masteryFromGrade(79), 'No')
  assert.equal(masteryFromGrade(79.9), 'No')
  assert.equal(masteryFromGrade(80), 'Yes')
  assert.equal(masteryFromGrade(100), 'Yes')
  assert.equal(masteryFromGrade(null), null)
  assert.equal(masteryFromGrade(undefined), null)

  const summary = theorySummary([85, 79, 100, null, 80, null])
  assert.deepEqual(summary, { recorded: 4, mastered: 3, needsWork: 1, total: 6 })
  assert.equal(theorySummaryLine(summary), 'Theory Evaluations: 4/6 recorded · Mastered: 3 · Needs work: 1')
  assert.throws(() => parseGradePercent(79.9), (error: unknown) => (error as { code?: string }).code === 'grade_not_integer')
  assert.throws(() => parseTheoryDate(null, '2026-10-20'), (error: unknown) => (error as { code?: string }).code === 'date_without_grade')
  assert.throws(() => parseTheoryDate(80, '2099-01-01'), (error: unknown) => (error as { code?: string }).code === 'future_date')
})

test('stored C1 mastery is ignored and a manual override is rejected', () => {
  const manual = readStoredManual(JSON.stringify({
    studentName: 'Sample Class One',
    competencies: {
      c1: { date: '2020-01-01', mastery: 'No' },
      c7: { date: '2026-10-25', mastery: 'Yes' },
      c8: { date: null, mastery: null },
    },
  }))
  const effective = getEffectiveRsep1Values(manual, [
    { competency: 'C1', gradePercent: 80, evaluatedOn: '2026-10-20' },
  ])
  assert.equal(effective.competencies.c1.mastery, 'Yes')
  assert.equal(effective.competencies.c1.date, '2026-10-20')
  assert.equal(effective.competencies.c7.mastery, 'Yes')
  assert.equal(hasTheoryOverride({ values: { competencies: { c1: { mastery: 'No' } } } }), true)
  assert.equal(hasTheoryOverride({ values: { competencies: { c7: { mastery: 'Yes', date: null }, c8: { mastery: null, date: null } } } }), false)
})

test('template hash, 21 fields, and CheckC8 No position', async () => {
  const bytes = loadRsep1Template()
  assert.equal(hashBytes(bytes), RSEP1_TEMPLATE_SHA256)
  assert.equal(hashBytes(readFileSync(rsep1TemplatePath())), RSEP1_TEMPLATE_SHA256)
  const doc = await PDFDocument.load(bytes)
  const form = doc.getForm()
  const names = new Set(form.getFields().map(field => field.getName()))
  assert.equal(fieldMap.fields.length, 21)
  for (const field of fieldMap.fields) assert.ok(names.has(field.pdfName), field.pdfName)
  const widgets = form.getField('CheckC8').acroField.getWidgets()
  const no = widgets.find(widget => widget.getOnValue()?.decodeText() === 'No')
  assert.ok(no)
  const rect = no.getRectangle()
  assert.ok(Math.abs(rect.x - 508) < 0.6, `CheckC8 No x is ${rect.x}`)
  assert.ok(rect.x > 507.6)
})

test('filled PDF matches grades and does not print numbers or change the template', async () => {
  const before = hashBytes(readFileSync(rsep1TemplatePath()))
  const manual = emptyManual('Sample Class One')
  manual.date = '2026-10-27'
  manual.instructorName = 'Sample Instructor'
  manual.competencies.c7 = { date: '2026-10-25', mastery: 'Yes' }
  const effective = getEffectiveRsep1Values(manual, [
    { competency: 'C1', gradePercent: 85, evaluatedOn: '2026-10-20' },
    { competency: 'C2', gradePercent: 79, evaluatedOn: '2026-10-20' },
    { competency: 'C3', gradePercent: 100, evaluatedOn: '2026-10-22' },
    { competency: 'C4', gradePercent: null, evaluatedOn: '2026-10-01' },
    { competency: 'C5', gradePercent: 80, evaluatedOn: '2026-10-24' },
    { competency: 'C6', gradePercent: null, evaluatedOn: null },
  ])
  assert.equal(effective.competencies.c4.mastery, null)
  assert.equal(effective.competencies.c4.date, null)
  assert.equal(effective.competencies.c6.mastery, null)

  const filled = await buildRsep1Pdf(effective)
  assert.equal(hashBytes(readFileSync(rsep1TemplatePath())), before)
  const { text, checks, form } = await readRsep1Fields(filled)
  assert.equal(checks.c1, 'Yes')
  assert.equal(checks.c2, 'No')
  assert.equal(checks.c3, 'Yes')
  assert.equal(checks.c4, null)
  assert.equal(checks.c5, 'Yes')
  assert.equal(checks.c6, null)
  assert.equal(checks.c7, 'Yes')
  assert.equal(checks.c8, null)
  const appearance = (fieldName: string, onValue: string) => {
    const widget = form.getField(fieldName).acroField.getWidgets().find(item => item.getOnValue()?.decodeText() === onValue)
    return widget?.getAppearanceState()?.decodeText() || 'Off'
  }
  assert.equal(appearance('CheckC1', 'Yes'), 'Yes')
  assert.equal(appearance('CheckC1', 'No'), 'Off')
  assert.equal(appearance('CheckC2', 'Yes'), 'Off')
  assert.equal(appearance('CheckC2', 'No'), 'No')
  assert.equal(appearance('CheckC4', 'Yes'), 'Off')
  assert.equal(appearance('CheckC4', 'No'), 'Off')
  assert.equal(appearance('CheckC6', 'Yes'), 'Off')
  assert.equal(appearance('CheckC6', 'No'), 'Off')
  assert.equal(text.c1Date, '2026-10-20')
  assert.equal(text.c2Date, '2026-10-20')
  assert.equal(text.c4Date, '')
  assert.equal(text.c5Date, '2026-10-24')
  assert.equal(text.c6Date, '')
  assert.equal(text.instructorName, 'Sample Instructor')
  assert.equal(text.date, '2026-10-27')

  const dir = mkdtempSync(path.join(tmpdir(), 'rsep1-text-'))
  const pdfPath = path.join(dir, 'filled.pdf')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(pdfPath, filled)
  const extracted = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
  for (const grade of ['85', '79', '100', '80']) {
    assert.equal(extracted.includes(grade), false, `grade ${grade} leaked onto the PDF`)
  }
})

test('pixels outside the field boxes stay the same', async () => {
  const manual = emptyManual('Sample Class One')
  manual.date = '2026-10-27'
  manual.instructorName = 'Sample Instructor'
  manual.notes = 'Sample note.'
  manual.competencies.c7 = { date: '2026-10-25', mastery: 'Yes' }
  const effective = getEffectiveRsep1Values(manual, [
    { competency: 'C1', gradePercent: 85, evaluatedOn: '2026-10-20' },
    { competency: 'C2', gradePercent: 79, evaluatedOn: '2026-10-20' },
    { competency: 'C3', gradePercent: 100, evaluatedOn: '2026-10-22' },
    { competency: 'C5', gradePercent: 80, evaluatedOn: '2026-10-24' },
  ])
  const filled = await buildRsep1Pdf(effective)
  const dir = mkdtempSync(path.join(tmpdir(), 'rsep1-px-'))
  const { writeFileSync } = await import('node:fs')
  writeFileSync(path.join(dir, 'filled.pdf'), filled)
  writeFileSync(path.join(dir, 'blank.pdf'), loadRsep1Template())
  writeFileSync(path.join(dir, 'map.json'), JSON.stringify(fieldMap))
  const script = `
import json, subprocess
from pathlib import Path
from PIL import Image, ImageChops
root = Path(${JSON.stringify(dir)})
for name in ("blank", "filled"):
    subprocess.check_call(["pdftoppm", "-png", "-r", "120", str(root / f"{name}.pdf"), str(root / name)])
pages = json.loads((root / "map.json").read_text())["fields"]
scale = 120 / 72
pad = 2
def boxes(page):
    out = []
    for field in pages:
        if field["page"] != page:
            continue
        rects = [field["rect"]] if "rect" in field else [opt["rect"] for opt in field["options"]]
        for x0, y0, x1, y1 in rects:
            left = int(x0 * scale) - pad
            top = int((792 - y1) * scale) - pad
            right = int(x1 * scale) + pad
            bottom = int((792 - y0) * scale) + pad
            out.append((left, top, right, bottom))
    return out
for page in (1, 2):
    blank = Image.open(root / f"blank-{page}.png").convert("RGB")
    filled_img = Image.open(root / f"filled-{page}.png").convert("RGB")
    diff = ImageChops.difference(blank, filled_img)
    mask = Image.new("L", blank.size, 0)
    px = mask.load()
    for left, top, right, bottom in boxes(page):
        for y in range(max(0, top), min(blank.height, bottom + 1)):
            for x in range(max(0, left), min(blank.width, right + 1)):
                px[x, y] = 255
    changed = 0
    width, height = blank.size
    diff_px = diff.load()
    mask_px = mask.load()
    for y in range(height):
        for x in range(width):
            if mask_px[x, y]:
                continue
            if diff_px[x, y] != (0, 0, 0):
                changed += 1
    print(f"page {page} outside {changed}")
    if changed:
        raise SystemExit(changed)
`
  execFileSync('python3', ['-c', script], { stdio: 'inherit' })
})

let store: typeof import('./store')

before(async () => {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })
  store = await import('./store')
})

test('server rejects a C1 override and finalize locks grades', async () => {
  await store.ensureSheet(ctx)
  await assert.rejects(
    () => store.saveManualSheet(ctx, {
      values: { competencies: { c1: { mastery: 'Yes', date: '2026-10-20' }, c7: { mastery: null, date: null }, c8: { mastery: null, date: null } } },
    }, actor),
    (error: unknown) => (error as { code?: string }).code === 'c1_c6_from_grades',
  )

  await store.saveTheoryRows(ctx, [
    { competency: 'C1', gradePercent: 79, evaluatedOn: '2026-10-20' },
  ], actor)
  let view = await store.getSheetView(ctx)
  assert.equal(view.values.competencies.c1.mastery, 'No')

  await store.saveTheoryRows(ctx, [
    { competency: 'C1', gradePercent: 80, evaluatedOn: '2026-10-20', expectedUpdatedAt: view.competencies[0].updatedAt },
  ], actor)
  view = await store.getSheetView(ctx)
  assert.equal(view.values.competencies.c1.mastery, 'Yes')
  const revisions = await (await import('../db')).prisma.rsep1ResultSheetRevision.findMany({
    where: { sheetId: view.sheetId, changeKind: 'theory' },
    orderBy: { savedAt: 'asc' },
  })
  assert.ok(revisions.length >= 2)
  const latest = JSON.parse(revisions.at(-1)!.theory) as { changes: Array<{ before: { gradePercent: number }, after: { gradePercent: number } }> }
  assert.equal(latest.changes[0].before.gradePercent, 79)
  assert.equal(latest.changes[0].after.gradePercent, 80)

  view = await store.finalizeSheet(ctx, actor, true)
  assert.equal(view.locked, true)
  const finalPath = path.join(root, 'data', 'rsep1', view.sheetId, 'rev-1.pdf')
  const firstFinal = readFileSync(finalPath)
  assert.ok(statSync(finalPath).size > 1000)

  await assert.rejects(
    () => store.saveTheoryRows(ctx, [{ competency: 'C2', gradePercent: 90, evaluatedOn: '2026-10-21' }], actor),
    (error: unknown) => (error as { status?: number, code?: string }).status === 423 && (error as { code?: string }).code === 'sheet_finalized',
  )
  await assert.rejects(
    () => store.saveManualSheet(ctx, { values: { notes: 'changed' } }, actor),
    (error: unknown) => (error as { code?: string }).code === 'sheet_finalized',
  )
  await assert.rejects(
    () => store.reopenSheet(ctx, actor, '   '),
    (error: unknown) => (error as { code?: string }).code === 'reason_required',
  )

  await store.reopenSheet(ctx, actor, 'Correct C2')
  await store.saveTheoryRows(ctx, [{ competency: 'C2', gradePercent: 90, evaluatedOn: '2026-10-21' }], actor)
  const again = await store.finalizeSheet(ctx, actor, true)
  assert.equal(again.revisionNo, 2)
  assert.equal(readFileSync(finalPath).equals(firstFinal), true)
  assert.ok(statSync(path.join(root, 'data', 'rsep1', view.sheetId, 'rev-2.pdf')).size > 1000)
})
