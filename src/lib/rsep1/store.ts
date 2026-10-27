import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'
import type { Rsep1ResultSheet, Rsep1TheoryEvaluation } from '@prisma/client'
import { prisma } from '../db'
import type { Actor, Class1Context } from './access'
import {
  THEORY_COMPETENCIES,
  isTheoryCode,
  theorySummary,
  theorySummaryLine,
} from './competencies'
import { Rsep1Error } from './errors'
import { buildRsep1Pdf, flattenPdf } from './fill'
import { RSEP1_TEMPLATE_VERSION } from './template'
import {
  getEffectiveRsep1Values,
  hasTheoryOverride,
  isSheetComplete,
  masteredCount,
  parseGradePercent,
  parseManualValues,
  parseTheoryDate,
  readStoredManual,
  resolveSheetDate,
  resolveSheetStudentName,
  type ManualValues,
} from './values'

type TheoryRow = Pick<Rsep1TheoryEvaluation,
  'competency' | 'gradePercent' | 'evaluatedOn' | 'evaluatorId' | 'note' | 'updatedAt' | 'updatedByLabel'>

export interface TheoryWrite {
  competency: string
  gradePercent: unknown
  evaluatedOn: unknown
  evaluatorId?: string | null
  note?: string | null
  expectedUpdatedAt?: string | null
}

function theorySnapshot(rows: TheoryRow[]) {
  return THEORY_COMPETENCIES.map(item => {
    const row = rows.find(entry => entry.competency === item.code)
    return {
      competency: item.code,
      gradePercent: row?.gradePercent ?? null,
      evaluatedOn: row?.gradePercent == null ? null : (row?.evaluatedOn ?? null),
      evaluatorId: row?.evaluatorId ?? null,
    }
  })
}

async function loadSheet(externalStudentId: number) {
  const sheet = await prisma.rsep1ResultSheet.findUnique({
    where: { externalStudentId },
    include: { theoryEvaluations: true },
  })
  if (!sheet) throw new Rsep1Error(404, 'not_found', 'Results sheet not found')
  return sheet
}

export async function ensureSheet(ctx: Class1Context) {
  const existing = await prisma.rsep1ResultSheet.findUnique({ where: { externalStudentId: ctx.externalStudentId } })
  if (existing) {
    if (!existing.registrationId && ctx.registrationId) {
      return prisma.rsep1ResultSheet.update({
        where: { id: existing.id },
        data: { registrationId: ctx.registrationId },
      })
    }
    return existing
  }
  return prisma.rsep1ResultSheet.create({
    data: {
      externalStudentId: ctx.externalStudentId,
      registrationId: ctx.registrationId,
      templateVersion: RSEP1_TEMPLATE_VERSION,
      values: JSON.stringify(readStoredManual(null, ctx.studentName)),
      status: 'draft',
    },
  })
}

async function instructorMap(ids: string[]) {
  if (!ids.length) return new Map<string, string>()
  const rows = await prisma.instructor.findMany({
    where: { id: { in: ids } },
    select: { id: true, legalName: true, displayName: true },
  })
  return new Map(rows.map(row => [row.id, row.legalName || row.displayName]))
}

export async function instructorChoices() {
  const [instructors, teachers] = await Promise.all([
    prisma.instructor.findMany({ orderBy: { displayName: 'asc' } }),
    prisma.teacherPhone.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
  ])
  const names = new Set<string>()
  for (const instructor of instructors) {
    if (instructor.legalName) names.add(instructor.legalName)
    if (instructor.displayName) names.add(instructor.displayName)
  }
  for (const teacher of teachers) {
    if (teacher.name) names.add(teacher.name)
  }
  return {
    instructors: instructors.map(row => ({
      id: row.id,
      legalName: row.legalName,
      displayName: row.displayName,
    })),
    nameSuggestions: [...names],
  }
}

export async function presentSheet(sheet: Rsep1ResultSheet, rows: TheoryRow[], profileName: string, now = new Date()) {
  const manual = readStoredManual(sheet.values, profileName)
  const printedName = resolveSheetStudentName(manual.studentName, profileName, manual.studentNameCustom)
  const activity = {
    sheetCreatedAt: sheet.createdAt,
    sheetUpdatedAt: sheet.updatedAt,
    theoryUpdatedAts: rows.map(row => row.updatedAt),
    now,
  }
  const shownDate = resolveSheetDate({
    date: manual.date,
    dateCustom: manual.dateCustom,
    locked: !!sheet.finalizedAt,
    ...activity,
  })
  const autoDate = resolveSheetDate({ date: null, dateCustom: false, locked: false, ...activity })
  const grades = theorySnapshot(rows)
  const effective = getEffectiveRsep1Values({ ...manual, studentName: printedName, date: shownDate }, grades, now)
  const names = await instructorMap(rows.map(row => row.evaluatorId).filter((id): id is string => !!id))
  const summary = theorySummary(THEORY_COMPETENCIES.map(item => {
    const row = rows.find(entry => entry.competency === item.code)
    return row?.gradePercent ?? null
  }))
  const choices = await instructorChoices()
  return {
    values: effective,
    manual,
    theorySource: Object.fromEntries(grades.map(row => [row.competency.toLowerCase(), row])),
    competencies: THEORY_COMPETENCIES.map(item => {
      const row = rows.find(entry => entry.competency === item.code)
      const gradePercent = row?.gradePercent ?? null
      return {
        competency: item.code,
        name: item.name,
        gradePercent,
        evaluatedOn: gradePercent == null ? null : (row?.evaluatedOn ?? null),
        evaluatorId: row?.evaluatorId ?? null,
        evaluatorName: row?.evaluatorId ? names.get(row.evaluatorId) || null : null,
        note: row?.note ?? null,
        mastery: effective.competencies[item.key].mastery,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
        updatedByLabel: row?.updatedByLabel ?? null,
      }
    }),
    summary,
    summaryLine: theorySummaryLine(summary),
    prefill: { studentName: profileName, date: autoDate },
    autoDate,
    dateCustom: manual.dateCustom === true,
    profileName,
    nameDiffers: !!profileName && printedName !== profileName,
    status: isSheetComplete(effective) ? 'complete' : 'draft',
    locked: !!sheet.finalizedAt,
    finalizedAt: sheet.finalizedAt?.toISOString() ?? null,
    finalizedBy: sheet.finalizedBy,
    revisionNo: sheet.revisionNo,
    updatedAt: sheet.updatedAt.toISOString(),
    updatedByLabel: sheet.updatedByLabel,
    masteredCount: masteredCount(effective),
    instructors: choices.instructors,
    instructorSuggestions: choices.nameSuggestions,
    sheetId: sheet.id,
  }
}

export async function getSheetView(ctx: Class1Context) {
  await ensureSheet(ctx)
  const full = await loadSheet(ctx.externalStudentId)
  return presentSheet(full, full.theoryEvaluations, ctx.studentName)
}

function assertUnlocked(sheet: { finalizedAt: Date | null }) {
  if (sheet.finalizedAt) {
    throw new Rsep1Error(423, 'sheet_finalized', 'This results sheet is finalized. Reopen it before editing.')
  }
}

function sameStamp(actual: Date, expected: string | null | undefined) {
  if (!expected) return true
  return actual.toISOString() === expected
}

async function appendRevision(input: {
  sheetId: string
  values: ManualValues
  theory: unknown
  changeKind: string
  reason?: string | null
  savedBy: string | null
  pdfPath?: string | null
}) {
  await prisma.rsep1ResultSheetRevision.create({
    data: {
      sheetId: input.sheetId,
      values: JSON.stringify(input.values),
      theory: JSON.stringify(input.theory),
      changeKind: input.changeKind,
      reason: input.reason || null,
      savedBy: input.savedBy,
      pdfPath: input.pdfPath || null,
    },
  })
}

export async function saveTheoryRows(ctx: Class1Context, writes: TheoryWrite[], actor: Actor, now = new Date()) {
  if (!writes.length) throw new Rsep1Error(400, 'empty', 'No grades to save')
  const seen = new Set<string>()
  const normalized = writes.map(write => {
    const code = write.competency.toUpperCase()
    if (!isTheoryCode(code)) throw new Rsep1Error(400, 'bad_competency', 'Competency must be C1–C6')
    if (seen.has(code)) throw new Rsep1Error(400, 'duplicate_competency', `${code} was sent twice`)
    seen.add(code)
    const gradePercent = parseGradePercent(write.gradePercent)
    const evaluatedOn = parseTheoryDate(gradePercent, write.evaluatedOn, now)
    const note = typeof write.note === 'string' ? write.note.trim() : null
    const evaluatorId = write.evaluatorId ? String(write.evaluatorId) : null
    return { ...write, code, gradePercent, evaluatedOn, note: note || null, evaluatorId }
  })

  if (normalized.some(row => row.evaluatorId)) {
    const ids = [...new Set(normalized.map(row => row.evaluatorId).filter((id): id is string => !!id))]
    const found = await prisma.instructor.findMany({ where: { id: { in: ids } }, select: { id: true } })
    if (found.length !== ids.length) throw new Rsep1Error(400, 'bad_evaluator', 'Grading instructor was not found')
  }

  const sheet = await ensureSheet(ctx)
  assertUnlocked(sheet)
  const existing = await prisma.rsep1TheoryEvaluation.findMany({ where: { sheetId: sheet.id } })
  for (const write of normalized) {
    const row = existing.find(entry => entry.competency === write.code)
    if (row && write.expectedUpdatedAt && !sameStamp(row.updatedAt, write.expectedUpdatedAt)) {
      throw new Rsep1Error(409, 'conflict', `${write.code} was saved by someone else. Reload and try again.`)
    }
  }

  const before = theorySnapshot(existing)
  await prisma.$transaction(async tx => {
    for (const write of normalized) {
      await tx.rsep1TheoryEvaluation.upsert({
        where: { sheetId_competency: { sheetId: sheet.id, competency: write.code } },
        create: {
          sheetId: sheet.id,
          externalStudentId: ctx.externalStudentId,
          competency: write.code,
          gradePercent: write.gradePercent,
          evaluatedOn: write.evaluatedOn,
          evaluatorId: write.evaluatorId,
          note: write.note,
          updatedBySession: actor.sessionId,
          updatedByLabel: actor.label,
        },
        update: {
          gradePercent: write.gradePercent,
          evaluatedOn: write.evaluatedOn,
          evaluatorId: write.evaluatorId,
          note: write.note,
          updatedBySession: actor.sessionId,
          updatedByLabel: actor.label,
        },
      })
    }
  })

  const fresh = await loadSheet(ctx.externalStudentId)
  const manual = readStoredManual(fresh.values, ctx.studentName)
  const after = theorySnapshot(fresh.theoryEvaluations)
  const effective = getEffectiveRsep1Values(manual, after)
  const changes = normalized.map(write => ({
    competency: write.code,
    before: before.find(row => row.competency === write.code) || null,
    after: after.find(row => row.competency === write.code) || null,
  }))
  await prisma.rsep1ResultSheet.update({
    where: { id: fresh.id },
    data: {
      status: isSheetComplete(effective) ? 'complete' : 'draft',
      updatedBySession: actor.sessionId,
      updatedByLabel: actor.label,
    },
  })
  await appendRevision({
    sheetId: fresh.id,
    values: manual,
    theory: { rows: after, changes },
    changeKind: 'theory',
    savedBy: actor.label,
  })
  const updated = await loadSheet(ctx.externalStudentId)
  return presentSheet(updated, updated.theoryEvaluations, ctx.studentName)
}

export async function saveManualSheet(
  ctx: Class1Context,
  body: unknown,
  actor: Actor,
) {
  if (hasTheoryOverride(body)) {
    throw new Rsep1Error(400, 'c1_c6_from_grades', 'C1–C6 come from theory grades and cannot be set on the results sheet')
  }
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const manual = parseManualValues(record.values ?? record)
  const typedName = manual.studentName.trim()
  if (typedName && typedName !== ctx.studentName) manual.studentNameCustom = true
  else delete manual.studentNameCustom
  const submitted = record.values && typeof record.values === 'object' ? record.values as Record<string, unknown> : record
  if (submitted.dateCustom === true && manual.date) manual.dateCustom = true
  else if (submitted.dateCustom === false || !manual.date) {
    delete manual.dateCustom
    manual.date = null
  } else manual.dateCustom = true
  const sheet = await ensureSheet(ctx)
  assertUnlocked(sheet)
  const expected = typeof record.expectedUpdatedAt === 'string' ? record.expectedUpdatedAt : null
  if (expected && !sameStamp(sheet.updatedAt, expected)) {
    throw new Rsep1Error(409, 'conflict', 'This results sheet was saved by someone else. Reload and try again.')
  }
  const fresh = await loadSheet(ctx.externalStudentId)
  const effective = getEffectiveRsep1Values(manual, theorySnapshot(fresh.theoryEvaluations))
  await prisma.rsep1ResultSheet.update({
    where: { id: sheet.id },
    data: {
      values: JSON.stringify(manual),
      status: isSheetComplete(effective) ? 'complete' : 'draft',
      updatedBySession: actor.sessionId,
      updatedByLabel: actor.label,
    },
  })
  await appendRevision({
    sheetId: sheet.id,
    values: manual,
    theory: { rows: theorySnapshot(fresh.theoryEvaluations), changes: [] },
    changeKind: 'sheet',
    savedBy: actor.label,
  })
  const updated = await loadSheet(ctx.externalStudentId)
  return presentSheet(updated, updated.theoryEvaluations, ctx.studentName)
}

async function filledPdf(ctx: Class1Context) {
  const view = await getSheetView(ctx)
  const bytes = await buildRsep1Pdf(view.values)
  return { view, bytes }
}

export async function pdfForStudent(ctx: Class1Context, flatten = false) {
  const { view, bytes } = await filledPdf(ctx)
  const file = flatten ? await flattenPdf(bytes) : Buffer.from(bytes)
  return { view, bytes: file }
}

export async function finalizeSheet(ctx: Class1Context, actor: Actor, confirmIncomplete = false) {
  const sheet = await ensureSheet(ctx)
  if (sheet.finalizedAt) throw new Rsep1Error(423, 'sheet_finalized', 'This results sheet is already finalized')
  const { view, bytes } = await filledPdf(ctx)
  if (view.status !== 'complete' && !confirmIncomplete) {
    throw new Rsep1Error(400, 'incomplete', 'The sheet is not complete. Confirm to finalize it anyway.')
  }
  let stored: Buffer
  try {
    stored = await flattenPdf(bytes)
  } catch {
    stored = Buffer.from(bytes)
  }
  const relative = path.join('data', 'rsep1', sheet.id, `rev-${sheet.revisionNo}.pdf`)
  const absolute = path.join(process.cwd(), relative)
  await mkdir(path.dirname(absolute), { recursive: true })
  try {
    await writeFile(absolute, stored, { flag: 'wx' })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') throw new Rsep1Error(500, 'revision_pdf_exists', 'A finalized PDF for this revision already exists')
    throw error
  }
  try {
    const fresh = await loadSheet(ctx.externalStudentId)
    const manual = readStoredManual(fresh.values, ctx.studentName)
    if (view.values.date) manual.date = view.values.date
    await prisma.rsep1ResultSheet.update({
      where: { id: sheet.id },
      data: {
        values: JSON.stringify(manual),
        finalizedAt: new Date(),
        finalizedBy: actor.label,
        status: view.status,
        updatedBySession: actor.sessionId,
        updatedByLabel: actor.label,
      },
    })
    await appendRevision({
      sheetId: sheet.id,
      values: manual,
      theory: { rows: theorySnapshot(fresh.theoryEvaluations), changes: [] },
      changeKind: 'finalize',
      savedBy: actor.label,
      pdfPath: relative,
    })
  } catch (error) {
    await rm(absolute, { force: true })
    throw error
  }
  const updated = await loadSheet(ctx.externalStudentId)
  return presentSheet(updated, updated.theoryEvaluations, ctx.studentName)
}

export async function reopenSheet(ctx: Class1Context, actor: Actor, reason: unknown) {
  const text = typeof reason === 'string' ? reason.trim() : ''
  if (!text) throw new Rsep1Error(400, 'reason_required', 'Reopen needs a reason')
  const sheet = await ensureSheet(ctx)
  if (!sheet.finalizedAt) throw new Rsep1Error(400, 'not_finalized', 'This results sheet is not finalized')
  const before = { finalizedAt: sheet.finalizedAt.toISOString(), revisionNo: sheet.revisionNo }
  const nextRevision = sheet.revisionNo + 1
  const manual = readStoredManual(sheet.values, ctx.studentName)
  if (!manual.dateCustom) manual.date = null
  await prisma.theoryCorrection.create({
    data: {
      entityType: 'Rsep1ResultSheet',
      entityId: sheet.id,
      kind: 'reopen',
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify({ finalizedAt: null, revisionNo: nextRevision }),
      reason: text,
      approvedBy: actor.label,
      internalOnly: true,
    },
  })
  await prisma.rsep1ResultSheet.update({
    where: { id: sheet.id },
    data: {
      values: JSON.stringify(manual),
      finalizedAt: null,
      finalizedBy: null,
      revisionNo: nextRevision,
      updatedBySession: actor.sessionId,
      updatedByLabel: actor.label,
    },
  })
  const fresh = await loadSheet(ctx.externalStudentId)
  await appendRevision({
    sheetId: sheet.id,
    values: manual,
    theory: { rows: theorySnapshot(fresh.theoryEvaluations), changes: [] },
    changeKind: 'reopen',
    reason: text,
    savedBy: actor.label,
  })
  const updated = await loadSheet(ctx.externalStudentId)
  return presentSheet(updated, updated.theoryEvaluations, ctx.studentName)
}

export async function readFinalizedPdf(sheetId: string, revisionNo: number) {
  const relative = path.join('data', 'rsep1', sheetId, `rev-${revisionNo}.pdf`)
  return readFile(path.join(process.cwd(), relative))
}
