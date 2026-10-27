import { execFile } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  type PDFForm,
  type PDFWidgetAnnotation,
} from 'pdf-lib'
import { ALL_COMPETENCIES, type CompKey, type Mastery, type Observation } from './competencies'
import { loadRsep1Template } from './template'
import type { EffectiveValues } from './values'

const execFileAsync = promisify(execFile)

const TEXT_FIELDS: Record<string, string> = {
  date: 'txtTexte1',
  instructorName: 'txtTexte2',
  studentName: 'txtTexte3',
  c1Date: 'txtTexteC1',
  c2Date: 'txtTexteC2',
  c3Date: 'txtTexteC3',
  c4Date: 'txtTexteC4',
  c5Date: 'txtTexteC5',
  c6Date: 'txtTexteC6',
  c7Date: 'txtTexteC7',
  c8Date: 'txtTexteC8',
  notes: 'txtP2',
}

const CHECK_FIELDS: Record<CompKey | 'observation', string> = {
  c1: 'CheckC1',
  c2: 'CheckC2',
  c3: 'CheckC3',
  c4: 'CheckC4',
  c5: 'CheckC5',
  c6: 'CheckC6',
  c7: 'CheckC7',
  c8: 'CheckC8',
  observation: 'Check9',
}

function widgetOnValue(widget: PDFWidgetAnnotation): PDFName | undefined {
  return widget.getOnValue()
}

/**
 * Each CheckCn field is one parent with two widgets (Yes/No, or Mastery/Needs work).
 * pdf-lib's check() can only turn on the first widget, so set /V and each /AS directly
 * and keep the SAAQ appearance streams.
 */
function setExclusive(form: PDFForm, fieldName: string, value: string | null) {
  const field = form.getField(fieldName)
  const widgets = field.acroField.getWidgets()
  if (!value) {
    field.acroField.dict.set(PDFName.of('V'), PDFName.of('Off'))
    for (const widget of widgets) widget.setAppearanceState(PDFName.of('Off'))
    return
  }
  let chosen: PDFName | null = null
  for (const widget of widgets) {
    const on = widgetOnValue(widget)
    if (on && on.decodeText() === value) chosen = on
  }
  if (!chosen) {
    throw new Error(`RSEP-1 field ${fieldName} has no "${value}" state`)
  }
  field.acroField.dict.set(PDFName.of('V'), chosen)
  for (const widget of widgets) {
    const on = widgetOnValue(widget)
    widget.setAppearanceState(on && on.decodeText() === value ? on : PDFName.of('Off'))
  }
}

function readName(value: unknown): string | null {
  if (!(value instanceof PDFName)) return null
  const text = value.decodeText()
  return text === 'Off' ? null : text
}

export function readExclusive(form: PDFForm, fieldName: string): string | null {
  const field = form.getField(fieldName)
  return readName(field.acroField.dict.lookup(PDFName.of('V')))
}

export function readWidgetStates(form: PDFForm, fieldName: string): string[] {
  return form.getField(fieldName).acroField.getWidgets().map(widget => widget.getAppearanceState()?.decodeText() || 'Off')
}

export async function buildRsep1Pdf(values: EffectiveValues): Promise<Uint8Array> {
  const doc = await PDFDocument.load(loadRsep1Template(), { updateMetadata: false })
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const textValues: Record<string, string> = {
    date: values.date || '',
    instructorName: values.instructorName || '',
    studentName: values.studentName || '',
    notes: values.notes || '',
  }
  for (const item of ALL_COMPETENCIES) {
    textValues[`${item.key}Date`] = values.competencies[item.key].date || ''
  }

  for (const [key, fieldName] of Object.entries(TEXT_FIELDS)) {
    const text = textValues[key] ?? ''
    if (!text) continue
    const field = form.getTextField(fieldName)
    field.setText(text)
    field.updateAppearances(font)
  }

  for (const item of ALL_COMPETENCIES) {
    const mastery: Mastery = values.competencies[item.key].mastery
    if (mastery) setExclusive(form, CHECK_FIELDS[item.key], mastery)
  }
  const observation: Observation = values.observation
  if (observation) setExclusive(form, CHECK_FIELDS.observation, observation)

  // Do not regenerate checkbox appearances. The SAAQ streams already draw the check.
  return doc.save({ updateFieldAppearances: false, useObjectStreams: false })
}

export async function readRsep1Fields(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  const form = doc.getForm()
  const text: Record<string, string> = {}
  for (const [key, fieldName] of Object.entries(TEXT_FIELDS)) {
    text[key] = form.getTextField(fieldName).getText() || ''
  }
  const checks: Record<string, string | null> = {}
  for (const [key, fieldName] of Object.entries(CHECK_FIELDS)) {
    checks[key] = readExclusive(form, fieldName)
  }
  return { text, checks, form }
}

export async function flattenPdf(bytes: Uint8Array): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'rsep1-flat-'))
  try {
    const input = path.join(dir, 'in.pdf')
    const output = path.join(dir, 'out.pdf')
    await writeFile(input, bytes)
    await execFileAsync('qpdf', ['--flatten-annotations=all', input, output])
    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function renderPdfPagePng(bytes: Uint8Array, page = 1, dpi = 140): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'rsep1-png-'))
  try {
    const input = path.join(dir, 'in.pdf')
    await writeFile(input, bytes)
    await execFileAsync('pdftoppm', ['-png', '-r', String(dpi), '-f', String(page), '-l', String(page), input, 'page'], { cwd: dir })
    return await readFile(path.join(dir, `page-${page}.png`))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
